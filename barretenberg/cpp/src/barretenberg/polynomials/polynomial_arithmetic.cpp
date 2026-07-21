// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 94f596f8b3bbbc216f9ad7dc33253256141156b2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "polynomial_arithmetic.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/fields/vectorized_for.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/accumulator.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <math.h>
#include <memory.h>

namespace bb::polynomial_arithmetic {

inline uint32_t reverse_bits(uint32_t x, uint32_t bit_length)
{
    x = (((x & 0xaaaaaaaa) >> 1) | ((x & 0x55555555) << 1));
    x = (((x & 0xcccccccc) >> 2) | ((x & 0x33333333) << 2));
    x = (((x & 0xf0f0f0f0) >> 4) | ((x & 0x0f0f0f0f) << 4));
    x = (((x & 0xff00ff00) >> 8) | ((x & 0x00ff00ff) << 8));
    return (((x >> 16) | (x << 16))) >> (32 - bit_length);
}

inline bool is_power_of_two(uint64_t x)
{
    return x && !(x & (x - 1));
}

template <typename Fr>
void scale_by_generator(Fr* coeffs,
                        Fr* target,
                        const EvaluationDomain<Fr>& domain,
                        const Fr& generator_start,
                        const Fr& generator_shift,
                        const size_t generator_size)
{
    BB_ASSERT(generator_size % domain.num_threads == 0,
              "generator_size must be divisible by num_threads to avoid silently skipping elements");
    parallel_for(domain.num_threads, [&](size_t j) {
        Fr thread_shift = generator_shift.pow(static_cast<uint64_t>(j * (generator_size / domain.num_threads)));
        Fr work_generator = generator_start * thread_shift;
        const size_t offset = j * (generator_size / domain.num_threads);
        const size_t end = offset + (generator_size / domain.num_threads);
        for (size_t i = offset; i < end; ++i) {
            target[i] = coeffs[i] * work_generator;
            work_generator *= generator_shift;
        }
    });
}

template <typename Fr>
    requires SupportsFFT<Fr>
void fft_inner_parallel(
    Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain, const Fr&, const std::vector<Fr*>& root_table)
{
    BB_ASSERT(coeffs != target, "fft_inner_parallel does not support in-place operation");
    parallel_for(domain.num_threads, [&](size_t j) {
        Fr temp_1;
        Fr temp_2;
        for (size_t i = (j * domain.thread_size); i < ((j + 1) * domain.thread_size); i += 2) {
            uint32_t next_index_1 = (uint32_t)reverse_bits((uint32_t)i + 2, (uint32_t)domain.log2_size);
            uint32_t next_index_2 = (uint32_t)reverse_bits((uint32_t)i + 3, (uint32_t)domain.log2_size);
            __builtin_prefetch(&coeffs[next_index_1]);
            __builtin_prefetch(&coeffs[next_index_2]);

            uint32_t swap_index_1 = (uint32_t)reverse_bits((uint32_t)i, (uint32_t)domain.log2_size);
            uint32_t swap_index_2 = (uint32_t)reverse_bits((uint32_t)i + 1, (uint32_t)domain.log2_size);

            Fr::__copy(coeffs[swap_index_1], temp_1);
            Fr::__copy(coeffs[swap_index_2], temp_2);
            target[i + 1] = temp_1 - temp_2;
            target[i] = temp_1 + temp_2;
        }
    });

    // outer FFT loop
    for (size_t m = 2; m < (domain.size); m <<= 1) {
        parallel_for(domain.num_threads, [&](size_t j) {
            Fr temp;

            // Ok! So, what's going on here? This is the inner loop of the FFT algorithm, and we want to break it
            // out into multiple independent threads. For `num_threads`, each thread will evaluation `domain.size /
            // num_threads` of the polynomial. The actual iteration length will be half of this, because we leverage
            // the fact that \omega^{n/2} = -\omega (where \omega is a root of unity)

            // Here, `start` and `end` are used as our iterator limits, so that we can use our iterator `i` to
            // directly access the roots of unity lookup table
            const size_t start = j * (domain.thread_size >> 1);
            const size_t end = (j + 1) * (domain.thread_size >> 1);

            // For all but the last round of our FFT, the roots of unity that we need, will be a subset of our
            // lookup table. e.g. for a size 2^n FFT, the 2^n'th roots create a multiplicative subgroup of order 2^n
            //      the 1st round will use the roots from the multiplicative subgroup of order 2 : the 2'th roots of
            //      unity the 2nd round will use the roots from the multiplicative subgroup of order 4 : the 4'th
            //      roots of unity
            // i.e. each successive FFT round will double the set of roots that we need to index.
            // We have already laid out the `root_table` container so that each FFT round's roots are linearly
            // ordered in memory. For all FFT rounds, the number of elements we're iterating over is greater than
            // the size of our lookup table. We need to access this table in a cyclical fasion - i.e. for a subgroup
            // of size x, the first x iterations will index the subgroup elements in order, then for the next x
            // iterations, we loop back to the start.

            // We could implement the algorithm by having 2 nested loops (where the inner loop iterates over the
            // root table), but we want to flatten this out - as for the first few rounds, the inner loop will be
            // tiny and we'll have quite a bit of unneccesary branch checks For each iteration of our flattened
            // loop, indexed by `i`, the element of the root table we need to access will be `i % (current round
            // subgroup size)` Given that each round subgroup size is `m`, which is a power of 2, we can index the
            // root table with a very cheap `i & (m - 1)` Which is why we have this odd `block_mask` variable
            const size_t block_mask = m - 1;

            // The next problem to tackle, is we now need to efficiently index the polynomial element in
            // `scratch_space` in our flattened loop If we used nested loops, the outer loop (e.g. `y`) iterates
            // from 0 to 'domain size', in steps of 2 * m, with the inner loop (e.g. `z`) iterating from 0 to m. We
            // have our inner loop indexer with `i & (m - 1)`. We need to add to this our outer loop indexer, which
            // is equivalent to taking our indexer `i`, masking out the bits used in the 'inner loop', and doubling
            // the result. i.e. polynomial indexer = (i & (m - 1)) + ((i & ~(m - 1)) >> 1) To simplify this, we
            // cache index_mask = ~block_mask, meaning that our indexer is just `((i & index_mask) << 1 + (i &
            // block_mask)`
            const size_t index_mask = ~block_mask;

            // `round_roots` fetches the pointer to this round's lookup table. We use `numeric::get_msb(m) - 1` as
            // our indexer, because we don't store the precomputed root values for the 1st round (because they're
            // all 1).
            const Fr* round_roots = root_table[static_cast<size_t>(numeric::get_msb(m)) - 1];

            // Finally, we want to treat the final round differently from the others,
            // so that we can reduce out of our 'coarse' reduction and store the output in `coeffs` instead of
            // `scratch_space`
            for (size_t i = start; i < end; ++i) {
                size_t k1 = (i & index_mask) << 1;
                size_t j1 = i & block_mask;
                temp = round_roots[j1] * target[k1 + j1 + m];
                target[k1 + j1 + m] = target[k1 + j1] - temp;
                target[k1 + j1] += temp;
            }
        });
    }
}

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel(coeffs, target, domain, domain.root_inverse, domain.get_inverse_round_roots());

    parallel_for(domain.num_threads, [&](size_t j) {
        const size_t start = j * domain.thread_size;
        const size_t end = (j + 1) * domain.thread_size;
        for (size_t i = start; i < end; ++i) {
            target[i] *= domain.domain_inverse;
        }
    });
}

template <typename Fr> Fr evaluate(const Fr* coeffs, const Fr& z, const size_t n)
{
    const size_t num_threads = get_num_cpus();
    std::vector<Fr> evaluations(num_threads, Fr::zero());
    parallel_for([&](const ThreadChunk& chunk) {
        // parallel_for with ThreadChunk uses get_num_cpus() threads
        BB_ASSERT_EQ(chunk.total_threads, evaluations.size());
        auto range = chunk.range(n);
        if (range.empty()) {
            return;
        }
        size_t start = *range.begin();
        Fr z_acc = z.pow(static_cast<uint64_t>(start));
        for (size_t i : range) {
            Fr work_var = z_acc * coeffs[i];
            evaluations[chunk.thread_index] += work_var;
            z_acc *= z;
        }
    });

    Fr r = Fr::zero();
    for (const auto& eval : evaluations) {
        r += eval;
    }
    return r;
}

// This function computes sum of all scalars in a given array.
//
// Loop abstraction: vectorized_for<VECTOR_FIELD_WIDTH> emits
// ContiguousVectorIndex<W> in the bulk and ScalarIndex in the tail. The
// kernel reads from a non-owning PolynomialSpan view of the input array;
// span[ctx] returns Fr for ScalarIndex and a VectorField for
// ContiguousVectorIndex<W>. Accumulator<Fr> dispatches its operator+= on
// the argument type, so the kernel body stays as one line. reduce()
// horizontal-adds the W vector lanes together with the scalar slot.
template <typename Fr> Fr compute_sum(const Fr* src, const size_t n)
{
    PolynomialSpan<const Fr> view{ 0, std::span<const Fr>(src, n) };
    Accumulator<Fr> acc;
    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, n, [&](auto ctx) { acc += view[ctx]; });
    return acc.reduce();
}

// This function computes the polynomial (x - a)(x - b)(x - c)... given n distinct roots (a, b, c, ...).
//
// Build the product incrementally by multiplying in one root at a time. After the i-th iteration,
// dest[0..i+1] holds the coefficients of ∏_{k=0}^{i} (X - roots[k]). Multiplying the existing
// polynomial P(X) by (X - r) gives
//     P(X) · X   shifts every coefficient up by one index, and
//    -P(X) · r   scales every coefficient by -r.
// Walking k high-to-low allows writing the shift-and-combine update in place with total cost O(n^2).
template <typename Fr> void compute_linear_polynomial_product(const Fr* roots, Fr* dest, const size_t n)
{
    if (n == 0) {
        return;
    }

    dest[0] = -roots[0];
    dest[1] = Fr(1);
    for (size_t i = 1; i < n; ++i) {
        const Fr r = roots[i];
        dest[i + 1] = dest[i];
        for (size_t k = i; k >= 1; --k) {
            dest[k] = dest[k - 1] - r * dest[k];
        }
        dest[0] = -r * dest[0];
    }
}

template <typename Fr> Fr compute_linear_polynomial_product_evaluation(const Fr* roots, const Fr z, const size_t n)
{
    Fr result = 1;
    for (size_t i = 0; i < n; ++i) {
        result *= (z - roots[i]);
    }
    return result;
}

template <typename Fr>
void compute_efficient_interpolation(const Fr* src, Fr* dest, const Fr* evaluation_points, const size_t n)
{
    /*
        We use Lagrange technique to compute polynomial interpolation.
        Given: (x_i, y_i) for i ∈ {0, 1, ..., n} =: [n]
        Compute function f(X) such that f(x_i) = y_i for all i ∈ [n].
                   (X - x1)(X - x2)...(X - xn)             (X - x0)(X - x2)...(X - xn)
        F(X) = y0--------------------------------  +  y1----------------------------------  + ...
                 (x0 - x_1)(x0 - x_2)...(x0 - xn)       (x1 - x_0)(x1 - x_2)...(x1 - xn)
        We write this as:
                      [          yi        ]
        F(X) = N(X) * |∑_i --------------- |
                      [     (X - xi) * di  ]
        where:
        N(X) = ∏_{i \in [n]} (X - xi),
        di = ∏_{j != i} (xi - xj)
        For division of N(X) by (X - xi), we use the same trick that was used in compute_opening_polynomial()
        function in the Kate commitment scheme.
        We denote
        q_{x_i} = N(X)/(X-x_i) * y_i * (d_i)^{-1} = q_{x_i,0}*1 + ... + q_{x_i,n-1} * X^{n-1} for i=0,..., n-1.

        The computation of F(X) is split into two cases:

        - if 0 is not in the interpolation domain, then the numerator polynomial N(X) has a non-zero constant term
        that is used to initialize the division algorithm mentioned above; the monomial coefficients q_{x_i, j} of
        q_{x_i} are accumulated into dest[j] for j=0,..., n-1

        - if 0 is in the domain at index i_0, the constant term of N(X) is 0 and the division algorithm computing
        q_{x_i} for i != i_0 is initialized with the constant term of N(X)/X. Note that its coefficients are given
        by numerator_polynomial[j] for j=1,...,n. The monomial coefficients of q_{x_i} are then accumuluated in
        dest[j] for j=1,..., n-1. Whereas the coefficients of
        q_{0} = N(X)/X * f(0) * (d_{i_0})^{-1}
        are added to dest[j] for j=0,..., n-1. Note that these coefficients do not require performing the division
        algorithm used in Kate commitment scheme, as the coefficients of N(X)/X are given by numerator_polynomial[j]
        for j=1,...,n.
    */
    // Lagrange interpolation is mathematically ill-defined when any two evaluation points coincide:
    // the denominator d_i contains a zero factor. batch_invert silently skips zero entries, so
    // without this check duplicate points produce an incorrect result.
    for (size_t i = 0; i < n; ++i) {
        for (size_t j = i + 1; j < n; ++j) {
            BB_ASSERT(evaluation_points[i] != evaluation_points[j],
                      "compute_efficient_interpolation requires distinct evaluation points");
        }
    }

    std::vector<Fr> numerator_polynomial(n + 1);
    polynomial_arithmetic::compute_linear_polynomial_product(evaluation_points, numerator_polynomial.data(), n);
    // First half contains roots, second half contains denominators (to be inverted)
    std::vector<Fr> roots_and_denominators(2 * n);
    std::vector<Fr> temp_src(n);
    for (size_t i = 0; i < n; ++i) {
        roots_and_denominators[i] = -evaluation_points[i];
        temp_src[i] = src[i];
        dest[i] = 0;
        // compute constant denominators
        roots_and_denominators[n + i] = 1;
        for (size_t j = 0; j < n; ++j) {
            if (j == i) {
                continue;
            }
            roots_and_denominators[n + i] *= (evaluation_points[i] - evaluation_points[j]);
        }
    }
    // at this point roots_and_denominators is populated as follows
    // (x_0,\ldots, x_{n-1}, d_0, \ldots, d_{n-1})
    Fr::batch_invert(roots_and_denominators.data(), 2 * n);

    Fr z, multiplier;
    std::vector<Fr> temp_dest(n);
    size_t idx_zero = 0;
    bool interpolation_domain_contains_zero = false;
    // if the constant term of the numerator polynomial N(X) is 0, then the interpolation domain contains 0
    // we find the index i_0, such that x_{i_0} = 0
    if (numerator_polynomial[0] == Fr(0)) {
        for (size_t i = 0; i < n; ++i) {
            if (evaluation_points[i] == Fr(0)) {
                idx_zero = i;
                interpolation_domain_contains_zero = true;
                break;
            }
        }
    };

    if (!interpolation_domain_contains_zero) {
        for (size_t i = 0; i < n; ++i) {
            // set z = - 1/x_i for x_i <> 0
            z = roots_and_denominators[i];
            // temp_src[i] is y_i, it gets multiplied by 1/d_i
            multiplier = temp_src[i] * roots_and_denominators[n + i];
            temp_dest[0] = multiplier * numerator_polynomial[0];
            temp_dest[0] *= z;
            dest[0] += temp_dest[0];
            for (size_t j = 1; j < n; ++j) {
                temp_dest[j] = multiplier * numerator_polynomial[j] - temp_dest[j - 1];
                temp_dest[j] *= z;
                dest[j] += temp_dest[j];
            }
        }
    } else {
        for (size_t i = 0; i < n; ++i) {
            if (i == idx_zero) {
                // the contribution from the term corresponding to i_0 is computed separately
                continue;
            }
            // get the next inverted root
            z = roots_and_denominators[i];
            // compute f(x_i) * d_{x_i}^{-1}
            multiplier = temp_src[i] * roots_and_denominators[n + i];
            // get x_i^{-1} * f(x_i) * d_{x_i}^{-1} into the "free" term
            temp_dest[1] = multiplier * numerator_polynomial[1];
            temp_dest[1] *= z;
            // correct the first coefficient as it is now accumulating free terms from
            // f(x_i) d_i^{-1} prod_(X-x_i, x_i != 0) (X-x_i) * 1/(X-x_i)
            dest[1] += temp_dest[1];
            // compute the quotient N(X)/(X-x_i) f(x_i)/d_{x_i} and its contribution to the target coefficients
            for (size_t j = 2; j < n; ++j) {
                temp_dest[j] = multiplier * numerator_polynomial[j] - temp_dest[j - 1];
                temp_dest[j] *= z;
                dest[j] += temp_dest[j];
            };
        }
        // correct the target coefficients by the contribution from q_{0} = N(X)/X * d_{i_0}^{-1} * f(0)
        for (size_t i = 0; i < n; ++i) {
            dest[i] += temp_src[idx_zero] * roots_and_denominators[n + idx_zero] * numerator_polynomial[i + 1];
        }
    }
}

template fr evaluate<fr>(const fr*, const fr&, const size_t);
template void fft_inner_parallel<fr>(fr*, fr*, const EvaluationDomain<fr>&, const fr&, const std::vector<fr*>&);
template void ifft<fr>(fr*, fr*, const EvaluationDomain<fr>&);
template fr compute_sum<fr>(const fr*, const size_t);
template void compute_linear_polynomial_product<fr>(const fr*, fr*, const size_t);
template void compute_efficient_interpolation<fr>(const fr*, fr*, const fr*, const size_t);

template grumpkin::fr evaluate<grumpkin::fr>(const grumpkin::fr*, const grumpkin::fr&, const size_t);
template grumpkin::fr compute_sum<grumpkin::fr>(const grumpkin::fr*, const size_t);
template void compute_linear_polynomial_product<grumpkin::fr>(const grumpkin::fr*, grumpkin::fr*, const size_t);
template void compute_efficient_interpolation<grumpkin::fr>(const grumpkin::fr*,
                                                            grumpkin::fr*,
                                                            const grumpkin::fr*,
                                                            const size_t);

} // namespace bb::polynomial_arithmetic

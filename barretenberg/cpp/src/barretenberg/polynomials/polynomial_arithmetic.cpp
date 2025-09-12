// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "polynomial_arithmetic.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "iterate_over_domain.hpp"
#include <math.h>
#include <memory.h>
#include <memory>

namespace bb::polynomial_arithmetic {

namespace {

template <typename Fr> std::shared_ptr<Fr[]> get_scratch_space(const size_t num_elements)
{
    // WASM needs to release slab so it can be reused elsewhere.
    // But for native code it's more performant to hold onto it.
#ifdef __wasm__
    return std::static_pointer_cast<Fr[]>(get_mem_slab(num_elements * sizeof(Fr)));
#else
    static std::shared_ptr<Fr[]> working_memory = nullptr;
    static size_t current_size = 0;
    if (num_elements > current_size) {
        working_memory = std::static_pointer_cast<Fr[]>(get_mem_slab(num_elements * sizeof(Fr)));
        current_size = num_elements;
    }
    return working_memory;
#endif
}

} // namespace

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
void copy_polynomial(const Fr* src, Fr* dest, size_t num_src_coefficients, size_t num_target_coefficients)
{
    // TODO: fiddle around with avx asm to see if we can speed up
    memcpy((void*)dest, (void*)src, num_src_coefficients * sizeof(Fr));

    if (num_target_coefficients > num_src_coefficients) {
        // fill out the polynomial coefficients with zeroes
        memset((void*)(dest + num_src_coefficients), 0, (num_target_coefficients - num_src_coefficients) * sizeof(Fr));
    }
}

template <typename Fr>
void scale_by_generator(Fr* coeffs,
                        Fr* target,
                        const EvaluationDomain<Fr>& domain,
                        const Fr& generator_start,
                        const Fr& generator_shift,
                        const size_t generator_size)
{
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
/**
 * Compute multiplicative subgroup (g.X)^n.
 *
 * Compute the subgroup for X in roots of unity of (2^log2_subgroup_size)*n.
 * X^n will loop through roots of unity (2^log2_subgroup_size).
 *
 * @param log2_subgroup_size Log_2 of the subgroup size.
 * @param src_domain The domain of size n.
 * @param subgroup_roots Pointer to the array for saving subgroup members.
 * */
template <typename Fr>
    requires SupportsFFT<Fr>
void compute_multiplicative_subgroup(const size_t log2_subgroup_size,
                                     const EvaluationDomain<Fr>& src_domain,
                                     Fr* subgroup_roots)
{
    size_t subgroup_size = 1UL << log2_subgroup_size;
    // Step 1: get primitive 4th root of unity
    Fr subgroup_root = Fr::get_root_of_unity(log2_subgroup_size);

    // Step 2: compute the cofactor term g^n
    Fr accumulator = src_domain.generator;
    for (size_t i = 0; i < src_domain.log2_size; ++i) {
        accumulator.self_sqr();
    }

    // Step 3: fill array with subgroup_size values of (g.X)^n, scaled by the cofactor
    subgroup_roots[0] = accumulator;
    for (size_t i = 1; i < subgroup_size; ++i) {
        subgroup_roots[i] = subgroup_roots[i - 1] * subgroup_root;
    }
}

template <typename Fr>
    requires SupportsFFT<Fr>
void fft_inner_parallel(std::vector<Fr*> coeffs,
                        const EvaluationDomain<Fr>& domain,
                        const Fr&,
                        const std::vector<Fr*>& root_table)
{
    auto scratch_space_ptr = get_scratch_space<Fr>(domain.size);
    auto scratch_space = scratch_space_ptr.get();

    const size_t num_polys = coeffs.size();
    ASSERT(is_power_of_two(num_polys));
    const size_t poly_size = domain.size / num_polys;
    ASSERT(is_power_of_two(poly_size));
    const size_t poly_mask = poly_size - 1;
    const size_t log2_poly_size = (size_t)numeric::get_msb(poly_size);

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

            size_t poly_idx_1 = swap_index_1 >> log2_poly_size;
            size_t elem_idx_1 = swap_index_1 & poly_mask;
            size_t poly_idx_2 = swap_index_2 >> log2_poly_size;
            size_t elem_idx_2 = swap_index_2 & poly_mask;

            Fr::__copy(coeffs[poly_idx_1][elem_idx_1], temp_1);
            Fr::__copy(coeffs[poly_idx_2][elem_idx_2], temp_2);
            scratch_space[i + 1] = temp_1 - temp_2;
            scratch_space[i] = temp_1 + temp_2;
        }
    });

    // hard code exception for when the domain size is tiny - we won't execute the next loop, so need to manually
    // reduce + copy
    if (domain.size <= 2) {
        coeffs[0][0] = scratch_space[0];
        coeffs[0][1] = scratch_space[1];
    }

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
            if (m != (domain.size >> 1)) {
                for (size_t i = start; i < end; ++i) {
                    size_t k1 = (i & index_mask) << 1;
                    size_t j1 = i & block_mask;
                    temp = round_roots[j1] * scratch_space[k1 + j1 + m];
                    scratch_space[k1 + j1 + m] = scratch_space[k1 + j1] - temp;
                    scratch_space[k1 + j1] += temp;
                }
            } else {
                for (size_t i = start; i < end; ++i) {
                    size_t k1 = (i & index_mask) << 1;
                    size_t j1 = i & block_mask;

                    size_t poly_idx_1 = (k1 + j1) >> log2_poly_size;
                    size_t elem_idx_1 = (k1 + j1) & poly_mask;
                    size_t poly_idx_2 = (k1 + j1 + m) >> log2_poly_size;
                    size_t elem_idx_2 = (k1 + j1 + m) & poly_mask;

                    temp = round_roots[j1] * scratch_space[k1 + j1 + m];
                    coeffs[poly_idx_2][elem_idx_2] = scratch_space[k1 + j1] - temp;
                    coeffs[poly_idx_1][elem_idx_1] = scratch_space[k1 + j1] + temp;
                }
            }
        });
    }
}

template <typename Fr>
    requires SupportsFFT<Fr>
void fft_inner_parallel(
    Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain, const Fr&, const std::vector<Fr*>& root_table)
{
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

    // hard code exception for when the domain size is tiny - we won't execute the next loop, so need to manually
    // reduce + copy
    if (domain.size <= 2) {
        coeffs[0] = target[0];
        coeffs[1] = target[1];
    }

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
void fft(Fr* coeffs, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel({ coeffs }, domain, domain.root, domain.get_round_roots());
}

template <typename Fr>
    requires SupportsFFT<Fr>
void fft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel(coeffs, target, domain, domain.root, domain.get_round_roots());
}

template <typename Fr>
    requires SupportsFFT<Fr>
void fft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel<Fr>(coeffs, domain.size, domain.root, domain.get_round_roots());
}

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(Fr* coeffs, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel({ coeffs }, domain, domain.root_inverse, domain.get_inverse_round_roots());
    ITERATE_OVER_DOMAIN_START(domain);
    coeffs[i] *= domain.domain_inverse;
    ITERATE_OVER_DOMAIN_END;
}

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel(coeffs, target, domain, domain.root_inverse, domain.get_inverse_round_roots());
    ITERATE_OVER_DOMAIN_START(domain);
    target[i] *= domain.domain_inverse;
    ITERATE_OVER_DOMAIN_END;
}

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain)
{
    fft_inner_parallel(coeffs, domain, domain.root_inverse, domain.get_inverse_round_roots());

    const size_t num_polys = coeffs.size();
    ASSERT(is_power_of_two(num_polys));
    const size_t poly_size = domain.size / num_polys;
    ASSERT(is_power_of_two(poly_size));
    const size_t poly_mask = poly_size - 1;
    const size_t log2_poly_size = (size_t)numeric::get_msb(poly_size);

    ITERATE_OVER_DOMAIN_START(domain);
    coeffs[i >> log2_poly_size][i & poly_mask] *= domain.domain_inverse;
    ITERATE_OVER_DOMAIN_END;
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs, const EvaluationDomain<Fr>& domain)
{
    scale_by_generator(coeffs, coeffs, domain, Fr::one(), domain.generator, domain.generator_size);
    fft(coeffs, domain);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain)
{
    scale_by_generator(coeffs, target, domain, Fr::one(), domain.generator, domain.generator_size);
    fft(coeffs, target, domain);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain)
{
    const size_t num_polys = coeffs.size();
    ASSERT(is_power_of_two(num_polys));
    const size_t poly_size = domain.size / num_polys;
    const Fr generator_pow_n = domain.generator.pow(poly_size);
    Fr generator_start = 1;

    for (size_t i = 0; i < num_polys; i++) {
        scale_by_generator(coeffs[i], coeffs[i], domain, generator_start, domain.generator, poly_size);
        generator_start *= generator_pow_n;
    }
    fft(coeffs, domain);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs,
               const EvaluationDomain<Fr>& domain,
               const EvaluationDomain<Fr>&,
               const size_t domain_extension)
{
    const size_t log2_domain_extension = static_cast<size_t>(numeric::get_msb(domain_extension));
    Fr primitive_root = Fr::get_root_of_unity(domain.log2_size + log2_domain_extension);

    // Fr work_root = domain.generator.sqr();
    // work_root = domain.generator.sqr();
    auto scratch_space_ptr = get_scratch_space<Fr>(domain.size * domain_extension);
    auto scratch_space = scratch_space_ptr.get();

    // Fr* temp_memory = static_cast<Fr*>(aligned_alloc(64, sizeof(Fr) * domain.size *
    // domain_extension));

    std::vector<Fr> coset_generators(domain_extension);
    coset_generators[0] = domain.generator;
    for (size_t i = 1; i < domain_extension; ++i) {
        coset_generators[i] = coset_generators[i - 1] * primitive_root;
    }
    for (size_t i = domain_extension - 1; i < domain_extension; --i) {
        scale_by_generator(coeffs, coeffs + (i * domain.size), domain, Fr::one(), coset_generators[i], domain.size);
    }

    for (size_t i = 0; i < domain_extension; ++i) {
        fft_inner_parallel(coeffs + (i * domain.size),
                           scratch_space + (i * domain.size),
                           domain,
                           domain.root,
                           domain.get_round_roots());
    }

    if (domain_extension == 4) {
        parallel_for(domain.num_threads, [&](size_t j) {
            const size_t start = j * domain.thread_size;
            const size_t end = (j + 1) * domain.thread_size;
            for (size_t i = start; i < end; ++i) {
                Fr::__copy(scratch_space[i], coeffs[(i << 2UL)]);
                Fr::__copy(scratch_space[i + (1UL << domain.log2_size)], coeffs[(i << 2UL) + 1UL]);
                Fr::__copy(scratch_space[i + (2UL << domain.log2_size)], coeffs[(i << 2UL) + 2UL]);
                Fr::__copy(scratch_space[i + (3UL << domain.log2_size)], coeffs[(i << 2UL) + 3UL]);
            }
        });

        for (size_t i = 0; i < domain.size; ++i) {
            for (size_t j = 0; j < domain_extension; ++j) {
                Fr::__copy(scratch_space[i + (j << domain.log2_size)], coeffs[(i << log2_domain_extension) + j]);
            }
        }
    } else {
        for (size_t i = 0; i < domain.size; ++i) {
            for (size_t j = 0; j < domain_extension; ++j) {
                Fr::__copy(scratch_space[i + (j << domain.log2_size)], coeffs[(i << log2_domain_extension) + j]);
            }
        }
    }
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft_with_constant(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& constant)
{
    Fr start = constant;
    scale_by_generator(coeffs, coeffs, domain, start, domain.generator, domain.generator_size);
    fft(coeffs, domain);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft_with_generator_shift(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& constant)
{
    scale_by_generator(coeffs, coeffs, domain, Fr::one(), domain.generator * constant, domain.generator_size);
    fft(coeffs, domain);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft_with_constant(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& value)
{
    fft_inner_parallel({ coeffs }, domain, domain.root_inverse, domain.get_inverse_round_roots());
    Fr T0 = domain.domain_inverse * value;
    ITERATE_OVER_DOMAIN_START(domain);
    coeffs[i] *= T0;
    ITERATE_OVER_DOMAIN_END;
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_ifft(Fr* coeffs, const EvaluationDomain<Fr>& domain)
{
    ifft(coeffs, domain);
    scale_by_generator(coeffs, coeffs, domain, Fr::one(), domain.generator_inverse, domain.size);
}

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_ifft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain)
{
    ifft(coeffs, domain);

    const size_t num_polys = coeffs.size();
    ASSERT(is_power_of_two(num_polys));
    const size_t poly_size = domain.size / num_polys;
    const Fr generator_inv_pow_n = domain.generator_inverse.pow(poly_size);
    Fr generator_start = 1;

    for (size_t i = 0; i < num_polys; i++) {
        scale_by_generator(coeffs[i], coeffs[i], domain, generator_start, domain.generator_inverse, poly_size);
        generator_start *= generator_inv_pow_n;
    }
}

template <typename Fr> Fr evaluate(const Fr* coeffs, const Fr& z, const size_t n)
{
    size_t num_threads = get_num_cpus_pow2();
    size_t range_per_thread = n / num_threads;
    size_t leftovers = n - (range_per_thread * num_threads);
    Fr* evaluations = new Fr[num_threads];
    parallel_for(num_threads, [&](size_t j) {
        Fr z_acc = z.pow(static_cast<uint64_t>(j * range_per_thread));
        size_t offset = j * range_per_thread;
        evaluations[j] = Fr::zero();
        size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            Fr work_var = z_acc * coeffs[i];
            evaluations[j] += work_var;
            z_acc *= z;
        }
    });

    Fr r = Fr::zero();
    for (size_t j = 0; j < num_threads; ++j) {
        r += evaluations[j];
    }
    delete[] evaluations;
    return r;
}

template <typename Fr> Fr evaluate(const std::vector<Fr*> coeffs, const Fr& z, const size_t large_n)
{
    const size_t num_polys = coeffs.size();
    const size_t poly_size = large_n / num_polys;
    ASSERT(is_power_of_two(poly_size));
    const size_t log2_poly_size = (size_t)numeric::get_msb(poly_size);
    size_t num_threads = get_num_cpus_pow2();
    size_t range_per_thread = large_n / num_threads;
    size_t leftovers = large_n - (range_per_thread * num_threads);
    Fr* evaluations = new Fr[num_threads];
    parallel_for(num_threads, [&](size_t j) {
        Fr z_acc = z.pow(static_cast<uint64_t>(j * range_per_thread));
        size_t offset = j * range_per_thread;
        evaluations[j] = Fr::zero();
        size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            Fr work_var = z_acc * coeffs[i >> log2_poly_size][i & (poly_size - 1)];
            evaluations[j] += work_var;
            z_acc *= z;
        }
    });

    Fr r = Fr::zero();
    for (size_t j = 0; j < num_threads; ++j) {
        r += evaluations[j];
    }
    delete[] evaluations;
    return r;
}

template <typename Fr>
    requires SupportsFFT<Fr>
Fr compute_kate_opening_coefficients(const Fr* src, Fr* dest, const Fr& z, const size_t n)
{
    // if `coeffs` represents F(X), we want to compute W(X)
    // where W(X) = F(X) - F(z) / (X - z)
    // i.e. divide by the degree-1 polynomial [-z, 1]

    // We assume that the commitment is well-formed and that there is no remainder term.
    // Under these conditions we can perform this polynomial division in linear time with good constants
    Fr f = evaluate(src, z, n);

    // compute (1 / -z)
    Fr divisor = -z.invert();

    // we're about to shove these coefficients into a pippenger multi-exponentiation routine, where we need
    // to convert out of montgomery form. So, we can use lazy reduction techniques here without triggering overflows
    dest[0] = src[0] - f;
    dest[0] *= divisor;
    for (size_t i = 1; i < n; ++i) {
        dest[i] = src[i] - dest[i - 1];
        dest[i] *= divisor;
    }

    return f;
}

// Computes r = \sum_{i=0}^{num_coeffs-1} (L_{i+1}(ʓ).f_i)
//
//                     (ʓ^n - 1)
// Start with L_1(ʓ) = ---------
//                     n.(ʓ - 1)
//
//                                 ʓ^n - 1
// L_i(z) = L_1(ʓ.ω^{1-i}) = ------------------
//                           n.(ʓ.ω^{1-i)} - 1)
//
fr compute_barycentric_evaluation(const fr* coeffs,
                                  const size_t num_coeffs,
                                  const fr& z,
                                  const EvaluationDomain<fr>& domain)
{
    fr* denominators = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * num_coeffs));

    fr numerator = z;
    for (size_t i = 0; i < domain.log2_size; ++i) {
        numerator.self_sqr();
    }
    numerator -= fr::one();
    numerator *= domain.domain_inverse; // (ʓ^n - 1) / n

    denominators[0] = z - fr::one();
    fr work_root = domain.root_inverse; // ω^{-1}
    for (size_t i = 1; i < num_coeffs; ++i) {
        denominators[i] =
            work_root * z; // denominators[i] will correspond to L_[i+1] (since our 'commented maths' notation indexes
                           // L_i from 1). So ʓ.ω^{-i} = ʓ.ω^{1-(i+1)} is correct for L_{i+1}.
        denominators[i] -= fr::one(); // ʓ.ω^{-i} - 1
        work_root *= domain.root_inverse;
    }

    fr::batch_invert(denominators, num_coeffs);

    fr result = fr::zero();

    for (size_t i = 0; i < num_coeffs; ++i) {
        fr temp = coeffs[i] * denominators[i]; // f_i * 1/(ʓ.ω^{-i} - 1)
        result = result + temp;
    }

    result = result *
             numerator; //   \sum_{i=0}^{num_coeffs-1} f_i * [ʓ^n - 1]/[n.(ʓ.ω^{-i} - 1)]
                        // = \sum_{i=0}^{num_coeffs-1} f_i * L_{i+1}
                        // (with our somewhat messy 'commented maths' convention that L_1 corresponds to the 0th coeff).

    aligned_free(denominators);

    return result;
}

// This function computes sum of all scalars in a given array.
template <typename Fr> Fr compute_sum(const Fr* src, const size_t n)
{
    Fr result = 0;
    for (size_t i = 0; i < n; ++i) {
        result += src[i];
    }
    return result;
}

// This function computes the polynomial (x - a)(x - b)(x - c)... given n distinct roots (a, b, c, ...).
template <typename Fr> void compute_linear_polynomial_product(const Fr* roots, Fr* dest, const size_t n)
{

    auto scratch_space_ptr = get_scratch_space<Fr>(n);
    auto scratch_space = scratch_space_ptr.get();
    memcpy((void*)scratch_space, (void*)roots, n * sizeof(Fr));

    dest[n] = 1;
    dest[n - 1] = -compute_sum(scratch_space, n);

    Fr temp;
    Fr constant = 1;
    for (size_t i = 0; i < n - 1; ++i) {
        temp = 0;
        for (size_t j = 0; j < n - 1 - i; ++j) {
            scratch_space[j] = roots[j] * compute_sum(&scratch_space[j + 1], n - 1 - i - j);
            temp += scratch_space[j];
        }
        dest[n - 2 - i] = temp * constant;
        constant *= Fr::neg_one();
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

template <typename Fr> void compute_interpolation(const Fr* src, Fr* dest, const Fr* evaluation_points, const size_t n)
{
    std::vector<Fr> local_roots;
    Fr local_polynomial[n];
    Fr denominator = 1;
    Fr multiplicand;
    Fr temp_dest[n];

    if (n == 1) {
        temp_dest[0] = src[0];
        return;
    }

    // Initialize dest
    for (size_t i = 0; i < n; ++i) {
        temp_dest[i] = 0;
    }

    for (size_t i = 0; i < n; ++i) {

        // fill in local roots
        denominator = 1;
        for (size_t j = 0; j < n; ++j) {
            if (j == i) {
                continue;
            }
            local_roots.push_back(evaluation_points[j]);
            denominator *= (evaluation_points[i] - evaluation_points[j]);
        }

        // bring local roots to coefficient form
        compute_linear_polynomial_product(&local_roots[0], local_polynomial, n - 1);

        // store the resulting coefficients
        multiplicand = src[i] / denominator;
        for (size_t j = 0; j < n; ++j) {
            temp_dest[j] += multiplicand * local_polynomial[j];
        }

        // clear up local roots
        local_roots.clear();
    }

    memcpy((void*)dest, (void*)temp_dest, n * sizeof(Fr));
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
    Fr numerator_polynomial[n + 1];
    polynomial_arithmetic::compute_linear_polynomial_product(evaluation_points, numerator_polynomial, n);
    // First half contains roots, second half contains denominators (to be inverted)
    Fr roots_and_denominators[2 * n];
    Fr temp_src[n];
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
    Fr::batch_invert(roots_and_denominators, 2 * n);

    Fr z, multiplier;
    Fr temp_dest[n];
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
template fr evaluate<fr>(const std::vector<fr*>, const fr&, const size_t);
template void copy_polynomial<fr>(const fr*, fr*, size_t, size_t);
template void fft_inner_parallel<fr>(std::vector<fr*>, const EvaluationDomain<fr>&, const fr&, const std::vector<fr*>&);
template void fft<fr>(fr*, const EvaluationDomain<fr>&);
template void fft<fr>(fr*, fr*, const EvaluationDomain<fr>&);
template void fft<fr>(std::vector<fr*>, const EvaluationDomain<fr>&);
template void coset_fft<fr>(fr*, const EvaluationDomain<fr>&);
template void coset_fft<fr>(fr*, fr*, const EvaluationDomain<fr>&);
template void coset_fft<fr>(std::vector<fr*>, const EvaluationDomain<fr>&);
template void coset_fft<fr>(fr*, const EvaluationDomain<fr>&, const EvaluationDomain<fr>&, const size_t);
template void coset_fft_with_constant<fr>(fr*, const EvaluationDomain<fr>&, const fr&);
template void coset_fft_with_generator_shift<fr>(fr*, const EvaluationDomain<fr>&, const fr&);
template void ifft<fr>(fr*, const EvaluationDomain<fr>&);
template void ifft<fr>(fr*, fr*, const EvaluationDomain<fr>&);
template void ifft<fr>(std::vector<fr*>, const EvaluationDomain<fr>&);
template void ifft_with_constant<fr>(fr*, const EvaluationDomain<fr>&, const fr&);
template void coset_ifft<fr>(fr*, const EvaluationDomain<fr>&);
template void coset_ifft<fr>(std::vector<fr*>, const EvaluationDomain<fr>&);
template fr compute_kate_opening_coefficients<fr>(const fr*, fr*, const fr&, const size_t);
template fr compute_sum<fr>(const fr*, const size_t);
template void compute_linear_polynomial_product<fr>(const fr*, fr*, const size_t);
template void compute_interpolation<fr>(const fr*, fr*, const fr*, const size_t);
template void compute_efficient_interpolation<fr>(const fr*, fr*, const fr*, const size_t);

template grumpkin::fr evaluate<grumpkin::fr>(const grumpkin::fr*, const grumpkin::fr&, const size_t);
template grumpkin::fr evaluate<grumpkin::fr>(const std::vector<grumpkin::fr*>, const grumpkin::fr&, const size_t);
template void copy_polynomial<grumpkin::fr>(const grumpkin::fr*, grumpkin::fr*, size_t, size_t);
template grumpkin::fr compute_sum<grumpkin::fr>(const grumpkin::fr*, const size_t);
template void compute_linear_polynomial_product<grumpkin::fr>(const grumpkin::fr*, grumpkin::fr*, const size_t);
template void compute_interpolation<grumpkin::fr>(const grumpkin::fr*,
                                                  grumpkin::fr*,
                                                  const grumpkin::fr*,
                                                  const size_t);
template void compute_efficient_interpolation<grumpkin::fr>(const grumpkin::fr*,
                                                            grumpkin::fr*,
                                                            const grumpkin::fr*,
                                                            const size_t);

} // namespace bb::polynomial_arithmetic

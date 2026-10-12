#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"

#include <algorithm>
#include <cstddef>
#include <span>
#include <vector>

namespace bb {

/**
 * @brief One term ν⋅(p(X) − v)/(X − x) of a batched linear quotient, where v = p(x).
 */
template <typename Fr> struct LinearQuotientTerm {
    std::span<const Fr> coefficients; // p(X) = ∑ᵢ pᵢ⋅Xⁱ, starting from X⁰
    Fr root;                          // x
    Fr evaluation;                    // v
    Fr scalar;                        // ν
};

/**
 * @brief Adds ∑ⱼ νⱼ⋅(pⱼ(X) − vⱼ)/(X − xⱼ) to `quotient`, asserting that every division is exact (pⱼ(xⱼ) = vⱼ).
 *
 * @details For p of size s, the quotient q(X) = ∑ᵢ qᵢ⋅Xⁱ of (p(X) − v) by (X − x) has q_{s−1} = 0 and
 * qᵢ = pᵢ₊₁ + x⋅qᵢ₊₁, i.e. qᵢ = ∑_{k>i} pₖ⋅x^{k−i−1}; v only enters the remainder p₀ − v + x⋅q₀, which must vanish.
 * The quotient index range is split into chunks that are processed in parallel:
 *   1. every chunk except the lowest Horner-evaluates its own coefficients, Hᶜ = ∑_{lo<k≤hi} pₖ⋅x^{k−lo−1};
 *   2. the values of q at the chunk boundaries follow serially from the top, q_lo = Hᶜ + x^{hi−lo}⋅q_hi;
 *   3. every chunk runs the descending recurrence from its upper boundary value and accumulates νⱼ⋅qᵢ.
 * The result is the same polynomial as dividing each term separately with `factor_roots` and summing.
 *
 * @param quotient Output coefficients; must hold at least max(sⱼ) − 1 entries.
 */
template <typename Fr>
void add_batched_linear_quotients(std::span<Fr> quotient, std::span<const LinearQuotientTerm<Fr>> terms)
{
    // Coefficient count of the quotient of each term
    auto quotient_size = [](const LinearQuotientTerm<Fr>& term) {
        return term.coefficients.empty() ? size_t{ 0 } : term.coefficients.size() - 1;
    };

    size_t length = 0;
    for (const auto& term : terms) {
        length = std::max(length, quotient_size(term));
    }
    BB_ASSERT_LTE(length, quotient.size());

    // Work below index i, counted in quotient coefficients over all terms
    auto work_below = [&](size_t i) {
        size_t work = 0;
        for (const auto& term : terms) {
            work += std::min(i, quotient_size(term));
        }
        return work;
    };
    const size_t total_work = work_below(length);

    // Chunks with less work than this are not worth the extra Horner pass of the parallel split
    constexpr size_t MIN_CHUNK_WORK = size_t{ 1 } << 13;
    const size_t num_chunks = std::clamp<size_t>(total_work / MIN_CHUNK_WORK, 1, get_num_cpus());
    // Chunk boundaries split the total work evenly; terms are of different sizes, so the low indices carry more.
    std::vector<size_t> chunk_starts(num_chunks + 1, length);
    chunk_starts[0] = 0;
    for (size_t chunk = 1; chunk < num_chunks; ++chunk) {
        const size_t target = (total_work / num_chunks) * chunk;
        size_t lo = chunk_starts[chunk - 1];
        size_t hi = length;
        while (lo < hi) {
            const size_t mid = lo + ((hi - lo) / 2);
            if (work_below(mid) < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        chunk_starts[chunk] = lo;
    }
    auto chunk_start = [&](size_t chunk) { return chunk_starts[chunk]; };

    const size_t num_terms = terms.size();
    // boundary_values[chunk * num_terms + j] = q⁽ʲ⁾ at the upper boundary of the chunk
    std::vector<Fr> boundary_values(num_chunks * num_terms, Fr::zero());
    if (num_chunks > 1) {
        std::vector<Fr> chunk_horner(num_chunks * num_terms, Fr::zero());
        parallel_for(num_chunks - 1, [&](size_t idx) {
            const size_t chunk = idx + 1;
            const size_t lo = chunk_start(chunk);
            const size_t hi = chunk_start(chunk + 1);
            for (size_t j = 0; j < num_terms; ++j) {
                const auto& term = terms[j];
                const size_t end = std::min(hi, quotient_size(term));
                Fr acc = Fr::zero();
                for (size_t k = end; k > lo; --k) {
                    acc = acc * term.root + term.coefficients[k];
                }
                chunk_horner[(chunk * num_terms) + j] = acc;
            }
        });
        for (size_t j = 0; j < num_terms; ++j) {
            const Fr& root = terms[j].root;
            for (size_t chunk = num_chunks - 1; chunk > 0; --chunk) {
                const size_t lo = chunk_start(chunk);
                const size_t hi = chunk_start(chunk + 1);
                boundary_values[((chunk - 1) * num_terms) + j] =
                    chunk_horner[(chunk * num_terms) + j] +
                    (root.pow(hi - lo) * boundary_values[(chunk * num_terms) + j]);
            }
        }
    }

    // q⁽ʲ⁾₀ for the remainder check
    std::vector<Fr> lowest_coefficients(num_terms, Fr::zero());
    parallel_for(num_chunks, [&](size_t chunk) {
        const size_t lo = chunk_start(chunk);
        const size_t hi = chunk_start(chunk + 1);
        for (size_t j = 0; j < num_terms; ++j) {
            const auto& term = terms[j];
            const size_t end = std::min(hi, quotient_size(term));
            Fr q = boundary_values[(chunk * num_terms) + j];
            if (term.scalar == Fr::one()) {
                for (size_t i = end; i > lo; --i) {
                    q = q * term.root + term.coefficients[i];
                    quotient[i - 1] += q;
                }
            } else {
                for (size_t i = end; i > lo; --i) {
                    q = q * term.root + term.coefficients[i];
                    quotient[i - 1] += term.scalar * q;
                }
            }
            if (chunk == 0) {
                lowest_coefficients[j] = q;
            }
        }
    });

    for (size_t j = 0; j < num_terms; ++j) {
        const auto& term = terms[j];
        if (!term.coefficients.empty() && !term.root.is_zero()) {
            // Exact-division precondition: p(X) − v = (X − x)⋅q(X), i.e. p₀ − v + x⋅q₀ = 0
            BB_ASSERT(term.coefficients[0] - term.evaluation + (term.root * lowest_coefficients[j]) == Fr::zero());
        }
    }
}

} // namespace bb

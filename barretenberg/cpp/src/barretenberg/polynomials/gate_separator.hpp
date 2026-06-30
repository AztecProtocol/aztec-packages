// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"

#include <cstddef>
#include <vector>
namespace bb {

template <typename FF> struct GateSeparatorPolynomial {
    /**
     * @brief The challenges \f$(\beta_0,\ldots, \beta_{d-1}) \f$
     *
     */
    std::vector<FF> betas;

    /**
     * @brief The consecutive evaluations \f$ pow_{\ell}(\beta) =  pow_{\beta}(\vec \ell) \f$ for \f$\vec \ell\f$
     * identified with the integers \f$\ell = 0,\ldots, 2^d-1\f$
     *
     */
    Polynomial<FF> beta_products;
    /**
     * @brief In Round \f$ i\f$ of Sumcheck, it points to the \f$ i \f$-th element in \f$ \vec \beta \f$
     *
     */
    size_t current_element_idx = 0;
    /**
     * @brief In Round \f$ i\f$ of Sumcheck, the periodicity equals to \f$ 2^{i+1}\f$ and represents the fixed interval
     * at which elements not containing either of \f$ (\beta_0,\ldots ,β_i)\f$ appear in #beta_products.
     *
     */
    size_t periodicity = 2;
    /**
     * @brief  The value \f$c_i\f$ obtained by partially evaluating one variable in the power polynomial at each round.
     * At the end of Round \f$ i \f$ in the sumcheck protocol, variable \f$X_i\f$ is replaced by the challenge \f$u_i
     * \f$. The partial evaluation result is updated to represent \f$ pow_{\beta}(u_0,.., u_{i}) = \prod_{k=0}^{i} (
     * (1-u_k) + u_k\cdot \beta_k) \f$.
     *
     */
    FF partial_evaluation_result = FF(1);

    /**
     * @brief Construct a new GateSeparatorPolynomial
     *
     * @param betas
     * @param log_num_monomials
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas, const size_t log_num_monomials)
        : betas(betas)
        , beta_products(compute_beta_products(betas, log_num_monomials))
    {}

    /**
     * @brief Construct a new GateSeparatorPolynomial object without expanding to a vector of monomials
     * @details The sumcheck verifier does not use beta_products
     *
     * @param betas
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas)
        : betas(betas)
    {}

    /**
     * @brief Constructs a virtual GateSeparator used by the prover in rounds k > d - 1, and computes its partial
     * evaluation at (u_0, ..., u_{d-1}).
     *
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas, const std::vector<FF>& challenge)
        : betas(betas)
    {
        if (!betas.empty()) {
            for (const auto& u_k : challenge) {
                partially_evaluate(u_k);
            }
        }
    }

    /**
     * @brief Retruns the element in #beta_products at place #idx.
     *
     * @param idx
     * @return FF const&
     */
    FF const& operator[](size_t idx) const
    {
        // At round i, we only iterate over beta_products of indices that are multiples of 2^i,
        // Hence for the idx-th element we need to get the (idx * 2^i)-th element in #beta_products.
        return beta_products.at((idx >> 1) * periodicity);
    }
    /**
     * @brief Computes the component  at index #current_element_idx in #betas.
     *
     * @return FF
     */
    FF current_element() const
    {
        if (betas.empty()) {
            return FF(1);
        };
        return betas[current_element_idx];
    }

    /**
     * @brief The pow_β per-variable factor \f$ (1 - X) + X\cdot \beta \f$ at \f$ X = \mathrm{challenge} \f$.
     * @details The building block of every pow_β / eq / shifted-eq fold; shared with `ShiftedEqPolynomial` so the
     * factor has a single definition.
     */
    static FF univariate_factor(const FF& challenge, const FF& beta) { return FF(1) + (challenge * (beta - FF(1))); }

    /**
     * @brief Evaluate  \f$ ((1−X_{i}) + X_{i}\cdot \beta_{i})\f$ at the challenge point \f$ X_{i}=u_{i} \f$.
     */
    FF univariate_eval(FF challenge) const { return univariate_factor(challenge, betas[current_element_idx]); };

    /**
     * @brief Partially evaluate the \f$pow_{\beta} \f$-polynomial at the new challenge and update \f$ c_i \f$
     * @details Update the constant \f$c_{i} \to c_{i+1} \f$ multiplying it by \f$pow_{\beta}\f$'s factor \f$\left(
     * (1-X_i) + X_i\cdot \beta_i\right)\vert_{X_i = u_i}\f$ computed by \ref univariate_eval.
     * @param challenge \f$ i \f$-th verifier challenge \f$ u_{i}\f$
     */
    void partially_evaluate(FF challenge)
    {
        if (!betas.empty()) {
            FF current_univariate_eval = univariate_eval(challenge);
            partial_evaluation_result *= current_univariate_eval;
            current_element_idx++;
            periodicity *= 2;
        }
    }

    /**
     * @brief Given \f$ \vec\beta = (\beta_0,...,\beta_{d-1})\f$ compute \f$ pow_{\ell}(\vec \beta) = pow_{\beta}(\vec
     * \ell)\f$ for \f$ \ell =0,\ldots,2^{d}-1\f$.
     *
     * @param log_num_monomials Determines the number of beta challenges used to compute beta_products (required because
     * when we generate CONST_SIZE_PROOF_LOG_N, currently 28, challenges but the real circuit size is less than 1 <<
     * CONST_SIZE_PROOF_LOG_N, we should compute unnecessarily a vector of beta_products of length 1 << 28 )
     */
    BB_PROFILE static Polynomial<FF> compute_beta_products(const std::vector<FF>& betas,
                                                           const size_t log_num_monomials,
                                                           const FF& scaling_factor = FF(1))
    {
        if (betas.empty()) {
            Polynomial<FF> out(1);
            return out;
        }

        BB_BENCH_NAME("GateSeparatorPolynomial::compute_beta_products");
        size_t pow_size = static_cast<size_t>(1) << log_num_monomials;
        Polynomial<FF> beta_products(pow_size, Polynomial<FF>::DontZeroMemory::FLAG);

        // Explanations of the algorithm:
        // The product of the betas at index i (beta_products[i]) contains the multiplicative factor betas[j] if and
        // only if the jth bit of i is 1 (j starting with 0 for the least significant bit). For instance, i = 13 = 1101
        // in binary, so the product is betas[0] * betas[2] * betas[3].
        //
        // Key insight: beta_products[i] = beta_products[predecessor] * betas[lsb_position], where predecessor is i
        // with the least significant bit cleared. For example:
        //   - i = 6 (binary 110): LSB is at position 1, predecessor = 4 (binary 100)
        //     beta_products[6] = beta_products[4] * betas[1]
        //   - i = 12 (binary 1100): LSB is at position 2, predecessor = 8 (binary 1000)
        //     beta_products[12] = beta_products[8] * betas[2]
        //
        // For each index i, if the predecessor falls within our thread's range [start, start + chunk_size), we use
        // this O(1) recurrence. Otherwise, we compute directly by iterating over all set bits in i, which requires
        // O(popcount(i)) multiplications. This direct computation handles boundary cases between thread chunks.
        //
        // This algorithm works with any number of threads (not just powers of 2), unlike the previous prefix/suffix
        // approach which required power-of-2 thread counts to ensure even work distribution.

        // Cost per iteration: typically 1 multiplication (when predecessor is in range),
        // occasionally O(popcount) multiplications at chunk boundaries
        constexpr size_t iteration_cost = thread_heuristics::FF_MULTIPLICATION_COST;
        parallel_for_heuristic(
            pow_size,
            [&](size_t start, size_t end, BB_UNUSED size_t chunk_index) {
                BB_BENCH_TRACY_NAME("GateSeparator::beta_products/chunk");
                for (size_t i = start; i < end; i++) {
                    if (i == 0) {
                        beta_products.at(0) = scaling_factor;
                        continue;
                    }

                    // Find the lowest set bit position and the predecessor index
                    size_t lsb_pos = numeric::get_lsb(i);
                    size_t predecessor = i ^ (static_cast<size_t>(1) << lsb_pos); // clear the lowest set bit

                    if (predecessor >= start) {
                        // Predecessor is in our range, O(1) computation
                        beta_products.at(i) = beta_products.at(predecessor) * betas[lsb_pos];
                    } else {
                        // Predecessor is not in our range, compute directly from set bits only
                        FF result = scaling_factor;
                        size_t remaining = i;
                        while (remaining != 0) {
                            size_t bit = numeric::get_lsb(remaining);
                            result *= betas[bit];
                            remaining ^= static_cast<size_t>(1) << bit; // clear this bit
                        }
                        beta_products.at(i) = result;
                    }
                }
            },
            iteration_cost);

        return beta_products;
    }
};
} // namespace bb

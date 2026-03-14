#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>

namespace bb {

/**
 * @brief Stores ZK masking values for witness polynomials and manages their folding across sumcheck rounds.
 *
 * @details When witness polynomials are allocated to trace_active_range (not full dyadic_size), the masking
 * values at the last NUM_MASKED_ROWS positions are stored here as small "tail" polynomials. This struct:
 * 1. Holds the tail polynomials (3 coefficients at positions {n-3, n-2, n-1}, full virtual_size)
 * 2. Tracks which entities are masked via an AllEntities<bool> flag
 * 3. Manages folded masking values across sumcheck rounds
 * 4. Computes claimed evaluation corrections via Lagrange products of challenges
 * 5. Provides tail polynomials for PCS batching
 *
 * Uses the AllEntities pattern: parallel structures indexed identically to ProverPolynomials.
 */
template <typename Flavor> struct MaskingTailData {
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    template <typename DataType> using AllEntities = typename Flavor::template AllEntities<DataType>;

    // Which entities are masked (parallel to ProverPolynomials.get_all())
    AllEntities<bool> is_masked{};

    // Tail polynomials: small polys with NUM_MASKED_ROWS coefficients at positions {n-3, n-2, n-1}.
    // virtual_size = dyadic_size. Empty for non-masked entities.
    AllEntities<Polynomial> tails{};

    // Folded masking values tracked across sumcheck rounds.
    // [0]=even position value, [1]=odd position value.
    // After round 0: both values valid (folded_count=2).
    // After round 1+: only [0] valid (folded_count=1).
    // Non-masked entities have {0, 0} (never read due to is_masked guard).
    AllEntities<std::array<FF, 2>> folded{};

    // Global folding state: 0 = not yet folded, 2 = after round 0, 1 = after round 1+.
    size_t folded_count = 0;

    size_t dyadic_size = 0;

    bool is_active() const
    {
        for (const auto& flag : is_masked.get_all()) {
            if (flag) {
                return true;
            }
        }
        return false;
    }

    size_t get_folded_count() const { return folded_count; }

    /**
     * @brief Register a polynomial as masked with the given mask values.
     * @details Creates a tail polynomial and sets the is_masked flag. The caller provides pre-generated
     * random mask values (typically from CommitBatch::add_to_batch).
     *
     * @param poly Reference to the polynomial in ProverPolynomials (used only to find the matching entity).
     * @param mask_vals The NUM_MASKED_ROWS random values for positions {n-3, n-2, n-1}.
     */
    template <typename ProverPolynomials>
    void register_masked_poly(ProverPolynomials& polys,
                              const Polynomial& poly,
                              const std::array<FF, NUM_MASKED_ROWS>& mask_vals)
    {
        auto all_polys = polys.get_all();
        auto all_masked = is_masked.get_all();
        auto all_tails = tails.get_all();

        for (size_t i = 0; i < all_polys.size(); i++) {
            if (all_polys[i].data() == poly.data() && all_polys[i].start_index() == poly.start_index()) {
                all_masked[i] = true;
                size_t start = dyadic_size - NUM_MASKED_ROWS;
                all_tails[i] = Polynomial(NUM_MASKED_ROWS, dyadic_size, start);
                for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                    all_tails[i].at(start + j) = mask_vals[j];
                }
                return;
            }
        }
        throw_or_abort("MaskingTailData::register_masked_poly: polynomial not found in get_all()");
    }

    /**
     * @brief Register all shifted polynomials whose to-be-shifted source is already masked.
     * @details For each (to_be_shifted, shifted) pair, if the to_be_shifted poly is masked,
     * derive the shifted tail: shift[i] = unshifted[i+1], so:
     *   shift[n-4] = mask[0], shift[n-3] = mask[1], shift[n-2] = mask[2], shift[n-1] = 0
     */
    template <typename ProverPolynomials> void register_shifted_polys(ProverPolynomials& polys)
    {
        auto all_polys = polys.get_all();
        auto all_masked = is_masked.get_all();
        auto all_tails = tails.get_all();
        auto to_be_shifted = polys.get_to_be_shifted();
        auto shifted = polys.get_shifted();

        for (size_t s = 0; s < to_be_shifted.size(); s++) {
            // Find the to_be_shifted poly's index in get_all()
            for (size_t i = 0; i < all_polys.size(); i++) {
                if (all_polys[i].data() == to_be_shifted[s].data() &&
                    all_polys[i].start_index() == to_be_shifted[s].start_index() && all_masked[i]) {
                    // Found a masked to-be-shifted poly. Now find the shifted poly's index.
                    for (size_t j = 0; j < all_polys.size(); j++) {
                        if (all_polys[j].data() == shifted[s].data() &&
                            all_polys[j].start_index() == shifted[s].start_index()) {
                            // Derive shifted tail from source tail
                            // shift[k] = unshifted[k+1], so shifted positions are {n-4, n-3, n-2}
                            // with values {mask[0], mask[1], mask[2]} and shift[n-1] = 0
                            size_t src_start = dyadic_size - NUM_MASKED_ROWS;
                            size_t shift_start = src_start - 1; // n-4
                            all_masked[j] = true;
                            all_tails[j] = Polynomial(NUM_MASKED_ROWS, dyadic_size, shift_start);
                            for (size_t k = 0; k < NUM_MASKED_ROWS; k++) {
                                all_tails[j].at(shift_start + k) = all_tails[i].at(src_start + k);
                            }
                            break;
                        }
                    }
                    break;
                }
            }
        }
    }

    /**
     * @brief Fold masking values after a sumcheck round challenge.
     * @details Maintains the values that SHOULD be at disabled positions in PE multivariates,
     * even though the actual PE has zeros there (because witness polys are short).
     *
     * @param challenge The round challenge u_i.
     * @param round_idx The sumcheck round index (0-based).
     * @param round_size The round size BEFORE halving (2^{d-i}).
     * @param pe Optional pointer to PE multivariates (needed for rounds 2+).
     */
    template <typename PolynomialCollection>
    void fold_masking_values(FF challenge,
                             size_t round_idx,
                             size_t round_size,
                             const PolynomialCollection* pe = nullptr)
    {
        if (!is_active()) {
            return;
        }

        auto all_masked = is_masked.get_all();
        auto all_tails = tails.get_all();
        auto all_folded = folded.get_all();

        if (round_idx == 0) {
            // Fold the 4 disabled positions (2 edge pairs) into 2 values per entity.
            size_t start = dyadic_size - NUM_MASKED_ROWS;
            for (size_t i = 0; i < all_masked.size(); i++) {
                if (!all_masked[i]) {
                    continue;
                }
                const auto& tail = all_tails[i];
                bool is_shifted = (tail.start_index() == start - 1); // shifted tails start at n-4

                if (!is_shifted) {
                    // Unshifted: pos n-4=0, n-3=mask[0], n-2=mask[1], n-1=mask[2]
                    FF m0 = tail.at(start);
                    FF m1 = tail.at(start + 1);
                    FF m2 = tail.at(start + 2);
                    all_folded[i][0] = challenge * m0;             // fold(0, mask[0])
                    all_folded[i][1] = m1 + challenge * (m2 - m1); // fold(mask[1], mask[2])
                } else {
                    // Shifted: pos n-4=mask[0], n-3=mask[1], n-2=mask[2], n-1=0
                    FF m0 = tail.at(start - 1);
                    FF m1 = tail.at(start);
                    FF m2 = tail.at(start + 1);
                    all_folded[i][0] = m0 + challenge * (m1 - m0);   // fold(mask[0], mask[1])
                    all_folded[i][1] = m2 * (FF::one() - challenge); // fold(mask[2], 0)
                }
            }
            folded_count = 2;
        } else if (round_idx == 1) {
            // Fold the 2 values into 1 per entity.
            for (size_t i = 0; i < all_masked.size(); i++) {
                if (!all_masked[i]) {
                    continue;
                }
                all_folded[i][0] = all_folded[i][0] + challenge * (all_folded[i][1] - all_folded[i][0]);
            }
            folded_count = 1;
        } else {
            // Rounds 2+: fold single disabled value with its active PE neighbor.
            BB_ASSERT(pe != nullptr);
            size_t even_pos = round_size - 2;
            auto all_pe = pe->get_all();

            for (size_t i = 0; i < all_masked.size(); i++) {
                if (!all_masked[i]) {
                    continue;
                }
                FF even_val = all_pe[i][even_pos];
                all_folded[i][0] = even_val + challenge * (all_folded[i][0] - even_val);
            }
        }
    }

    /**
     * @brief Compute the unshifted tail's contribution to the claimed evaluation.
     * @details Uses Lagrange basis at masking row positions:
     *   L_{n-3}(u) = u_0 * (1-u_1) * u_2 * ... * u_{d-1}
     *   L_{n-2}(u) = (1-u_0) * u_1 * u_2 * ... * u_{d-1}
     *   L_{n-1}(u) = u_0 * u_1 * u_2 * ... * u_{d-1}
     */
    FF compute_unshifted_correction(const Polynomial& tail, std::span<const FF> challenges) const
    {
        size_t start = dyadic_size - NUM_MASKED_ROWS;
        FF m0 = tail.at(start);
        FF m1 = tail.at(start + 1);
        FF m2 = tail.at(start + 2);

        FF common = FF::one();
        for (size_t i = 2; i < challenges.size(); i++) {
            common *= challenges[i];
        }
        FF u0 = challenges[0];
        FF u1 = challenges[1];
        return common * (m0 * u0 * (FF::one() - u1) + m1 * (FF::one() - u0) * u1 + m2 * u0 * u1);
    }

    /**
     * @brief Compute the shifted tail's contribution to the claimed evaluation.
     * @details Shifted poly: shift[i] = unshifted[i+1]. Masking positions shift down by 1:
     *   L_{n-4}(u) = (1-u_0)*(1-u_1) * common
     *   L_{n-3}(u) = u_0*(1-u_1) * common
     *   L_{n-2}(u) = (1-u_0)*u_1 * common
     */
    FF compute_shifted_correction(const Polynomial& tail, std::span<const FF> challenges) const
    {
        size_t start = dyadic_size - NUM_MASKED_ROWS - 1; // shifted tail starts at n-4
        FF m0 = tail.at(start);
        FF m1 = tail.at(start + 1);
        FF m2 = tail.at(start + 2);

        FF common = FF::one();
        for (size_t i = 2; i < challenges.size(); i++) {
            common *= challenges[i];
        }
        FF u0 = challenges[0];
        FF u1 = challenges[1];
        return common *
               (m0 * (FF::one() - u0) * (FF::one() - u1) + m1 * u0 * (FF::one() - u1) + m2 * (FF::one() - u0) * u1);
    }

    /**
     * @brief Apply claimed evaluation corrections to multivariate evaluations after sumcheck.
     */
    template <typename ClaimedEvaluations>
    void apply_claimed_eval_corrections(ClaimedEvaluations& evaluations, std::span<const FF> challenges) const
    {
        auto evals = evaluations.get_all();
        auto all_masked = is_masked.get_all();
        auto all_tails = tails.get_all();
        size_t start = dyadic_size - NUM_MASKED_ROWS;

        for (size_t i = 0; i < all_masked.size(); i++) {
            if (!all_masked[i]) {
                continue;
            }
            bool is_shifted = (all_tails[i].start_index() == start - 1);
            if (!is_shifted) {
                evals[i] += compute_unshifted_correction(all_tails[i], challenges);
            } else {
                evals[i] += compute_shifted_correction(all_tails[i], challenges);
            }
        }
    }

    /**
     * @brief Register tail polynomials with the PCS batcher.
     * @details Finds each masked entity's polynomial in the batcher's unshifted/shifted lists by data pointer
     * and adds the corresponding tail polynomial for joint batching with the same rho scalar.
     */
    template <typename ProverPolynomials, typename PolynomialBatcher>
    void add_tails_to_batcher(const ProverPolynomials& prover_polynomials, PolynomialBatcher& batcher) const
    {
        if (!is_active()) {
            return;
        }

        auto all_polys = prover_polynomials.get_all();
        auto all_masked = is_masked.get_all();
        auto all_tails = tails.get_all();

        for (size_t i = 0; i < all_masked.size(); i++) {
            if (!all_masked[i]) {
                continue;
            }
            const auto& source_poly = all_polys[i];
            bool is_shifted = (all_tails[i].start_index() == dyadic_size - NUM_MASKED_ROWS - 1);

            if (!is_shifted) {
                // Find in batcher's unshifted list
                for (size_t u = 0; u < batcher.unshifted.size(); u++) {
                    if (batcher.unshifted[u].data() == source_poly.data()) {
                        batcher.add_unshifted_tail(u, Polynomial(all_tails[i]));
                        break;
                    }
                }
                // Also check to_be_shifted list (unshifted poly may appear there too)
                for (size_t s = 0; s < batcher.to_be_shifted_by_one.size(); s++) {
                    if (batcher.to_be_shifted_by_one[s].data() == source_poly.data()) {
                        batcher.add_shifted_tail(s, Polynomial(all_tails[i]));
                        break;
                    }
                }
            }
            // Shifted tails are not added to batcher separately — the unshifted source's tail
            // already covers the shifted version via the batcher's shift mechanism.
        }
    }
};

} // namespace bb

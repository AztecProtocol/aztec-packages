#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>

namespace bb {

/**
 * @brief Stores ZK masking values for witness polynomials and manages their folding across sumcheck rounds.
 *
 * @details When witness polynomials are allocated to trace_active_range (not full dyadic_size), the masking
 * values at the tail positions are stored here as small polynomials. This struct:
 * 1. Holds tail polynomials (NUM_MASKED_ROWS coefficients; unshifted at {n-3,n-2,n-1}, shifted at {n-4,n-3,n-2})
 * 2. Tracks which entities are masked via AllEntities<bool> (used by compute_disabled_contribution)
 * 3. Manages folded masking values across sumcheck rounds
 * 4. Computes claimed evaluation corrections via Lagrange products of challenges
 * 5. Stores tails for PCS commitment adjustment and Gemini batching
 *
 * Only used for flavors with UseRowDisablingPolynomial (not Translator, which uses a different ZK technique).
 * Uses the AllEntities pattern: callers access tails by named field (e.g. tails.w_l) or via
 * get_masked()/get_shifted() for iteration — no pointer-matching lookups needed.
 */
template <typename Flavor> struct MaskingTailData {
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    template <typename DataType> using AllEntities = typename Flavor::template AllEntities<DataType>;

    // Which entities are masked (parallel to ProverPolynomials.get_all())
    AllEntities<bool> is_masked{};

    // Tail polynomials: small polys with NUM_MASKED_ROWS coefficients at positions {n-3, n-2, n-1}.
    // virtual_size = dyadic_size. Empty for non-masked entities.
    // Shifted tails start at n-4 instead of n-3 (shift[k] = unshifted[k+1]).
    AllEntities<Polynomial> tails{};

    // Folded masking values tracked across sumcheck rounds.
    // [0]=even position value, [1]=odd position value. Default {0,0} for non-masked entities.
    AllEntities<std::array<FF, 2>> folded{};

    // Number of valid entries in each folded[i] array:
    //   0 — before any folding (round 0 input); no overrides needed since (1-L)=0 zeroes the tail.
    //   2 — after round 0; both f[0] (even) and f[1] (odd) hold independent folded values.
    //   1 — after round 1+; f[1] was collapsed into f[0], only f[0] is valid.
    size_t num_folded_values = 0;

    size_t dyadic_size = 0;
    bool active = false;

    bool is_active() const { return active; }
    size_t get_num_folded_values() const { return num_folded_values; }

    /**
     * @brief Register all masked polynomials and their shifted counterparts at once.
     * @details Uses get_masked() on the parallel AllEntities structs (is_masked, tails) to directly
     * access the right slots without pointer matching. Shifted tails are derived via get_to_be_shifted()
     * / get_shifted() which are guaranteed parallel arrays.
     * Call once before any commits (e.g., at start of OinkProver::prove()).
     */
    void register_all_masked_polys()
    {
        size_t start = dyadic_size - NUM_MASKED_ROWS;

        // 1. Mark masked entities and generate random tail values
        for (auto [flag, tail] : zip_view(is_masked.get_masked(), tails.get_masked())) {
            flag = true;
            tail = Polynomial(NUM_MASKED_ROWS, dyadic_size, start);
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                tail.at(start + j) = FF::random_element();
            }
        }
        active = true;

        // 2. Derive shifted tails: get_to_be_shifted() and get_shifted() are parallel arrays.
        // All to-be-shifted sources are in get_masked(), so all shifted entries are active.
        size_t shift_start = start - 1;
        for (auto [src_tail, shifted_flag, shifted_tail] :
             zip_view(tails.get_to_be_shifted(), is_masked.get_shifted(), tails.get_shifted())) {
            shifted_flag = true;
            shifted_tail = Polynomial(NUM_MASKED_ROWS, dyadic_size, shift_start);
            for (size_t k = 0; k < NUM_MASKED_ROWS; k++) {
                shifted_tail.at(shift_start + k) = src_tail.at(start + k);
            }
        }
    }

    /**
     * @brief Fold masking values after a sumcheck round challenge.
     * @param challenge The round challenge u_i.
     * @param round_idx The sumcheck round index (0-based).
     * @param round_size The round size BEFORE halving (2^{d-i}).
     * @param pe Pointer to PE multivariates (needed for rounds 2+: the even-position
     *        value comes from the partially-evaluated table, not from folded masking state).
     */
    template <typename PolynomialCollection>
    void fold_masking_values(FF challenge,
                             size_t round_idx,
                             size_t round_size,
                             const PolynomialCollection* pe = nullptr)
    {
        if (!active) {
            return;
        }

        if (round_idx == 0) {
            size_t start = dyadic_size - NUM_MASKED_ROWS;

            // Unshifted masked: positions {n-3, n-2, n-1} have values {m0, m1, m2}, position n-4 = 0
            for (auto [tail, f] : zip_view(tails.get_masked(), folded.get_masked())) {
                FF m0 = tail.at(start);
                FF m1 = tail.at(start + 1);
                FF m2 = tail.at(start + 2);
                f[0] = challenge * m0;
                f[1] = m1 + challenge * (m2 - m1);
            }

            // Shifted: positions {n-4, n-3, n-2} have values {m0, m1, m2}, position n-1 = 0
            for (auto [tail, f] : zip_view(tails.get_shifted(), folded.get_shifted())) {
                FF m0 = tail.at(start - 1);
                FF m1 = tail.at(start);
                FF m2 = tail.at(start + 1);
                f[0] = m0 + challenge * (m1 - m0);
                f[1] = m2 * (FF::one() - challenge);
            }
            num_folded_values = 2;
        } else if (round_idx == 1) {
            // Same formula for both unshifted and shifted: collapse two folded values into one
            auto fold = [&](auto folded_refs) {
                for (auto& f : folded_refs) {
                    f[0] += challenge * (f[1] - f[0]);
                }
            };
            fold(folded.get_masked());
            fold(folded.get_shifted());
            num_folded_values = 1;
        } else {
            BB_ASSERT(pe != nullptr);
            size_t even_pos = round_size - 2;
            // Interpolate between PE value and folded value
            auto fold = [&](auto folded_refs, auto pe_refs) {
                for (auto [f, p] : zip_view(folded_refs, pe_refs)) {
                    FF even_val = p[even_pos];
                    f[0] = even_val + challenge * (f[0] - even_val);
                }
            };
            fold(folded.get_masked(), pe->get_masked());
            fold(folded.get_shifted(), pe->get_shifted());
        }
    }

    /**
     * @brief Apply claimed evaluation corrections to multivariate evaluations after sumcheck.
     * @details Computes Lagrange-basis corrections from the NUM_MASKED_ROWS mask values in each tail polynomial.
     * Unshifted tails use positions {n-3, n-2, n-1}; shifted tails use {n-4, n-3, n-2}.
     */
    template <typename ClaimedEvaluations>
    void apply_claimed_eval_corrections(ClaimedEvaluations& evaluations, std::span<const FF> challenges) const
    {
        FF common = FF::one();
        for (size_t k = 2; k < challenges.size(); k++) {
            common *= challenges[k];
        }
        FF u0 = challenges[0];
        FF u1 = challenges[1];
        size_t start = dyadic_size - NUM_MASKED_ROWS;

        // Unshifted masked: Lagrange basis at positions {n-3, n-2, n-1}
        for (auto [eval, tail] : zip_view(evaluations.get_masked(), tails.get_masked())) {
            FF m0 = tail.at(start);
            FF m1 = tail.at(start + 1);
            FF m2 = tail.at(start + 2);
            eval += common * (m0 * u0 * (FF::one() - u1) + m1 * (FF::one() - u0) * u1 + m2 * u0 * u1);
        }

        // Shifted: Lagrange basis at positions {n-4, n-3, n-2}
        for (auto [eval, tail] : zip_view(evaluations.get_shifted(), tails.get_shifted())) {
            FF m0 = tail.at(start - 1);
            FF m1 = tail.at(start);
            FF m2 = tail.at(start + 1);
            eval += common * (m0 * (FF::one() - u0) * (FF::one() - u1) + m1 * u0 * (FF::one() - u1) +
                              m2 * (FF::one() - u0) * u1);
        }
    }

    /**
     * @brief Register tail polynomials with the PCS batcher.
     * @details Iterates only masked (unshifted) entities. For each, registers the tail with both
     * batcher.unshifted and batcher.to_be_shifted_by_one if the source poly appears there.
     * The batcher's shift mechanism handles producing the shifted version.
     */
    template <typename ProverPolynomials, typename PolynomialBatcher>
    void add_tails_to_batcher(const ProverPolynomials& prover_polynomials, PolynomialBatcher& batcher) const
    {
        if (!active) {
            return;
        }

        // Pointer-matching against batcher lists is needed here since the batcher is an external
        // structure without flavor-aware getters.
        for (auto [poly, tail] : zip_view(prover_polynomials.get_masked(), tails.get_masked())) {
            for (size_t u = 0; u < batcher.unshifted.size(); u++) {
                if (batcher.unshifted[u].data() == poly.data()) {
                    batcher.add_unshifted_tail(u, Polynomial(tail));
                    break;
                }
            }
            for (size_t s = 0; s < batcher.to_be_shifted_by_one.size(); s++) {
                if (batcher.to_be_shifted_by_one[s].data() == poly.data()) {
                    batcher.add_shifted_tail(s, Polynomial(tail));
                    break;
                }
            }
        }
    }
};

} // namespace bb

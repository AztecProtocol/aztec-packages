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
    // Shifted tails start at n-4 instead of n-3 (shift[k] = unshifted[k+1]).
    AllEntities<Polynomial> tails{};

    // Folded masking values tracked across sumcheck rounds.
    // [0]=even position value, [1]=odd position value.
    // Non-masked entities have {0, 0} (never read due to is_masked guard).
    AllEntities<std::array<FF, 2>> folded{};

    // Global folding state: 0 = not yet folded, 2 = after round 0, 1 = after round 1+.
    size_t folded_count = 0;

    size_t dyadic_size = 0;
    bool active = false;

    bool is_active() const { return active; }
    size_t get_folded_count() const { return folded_count; }

    // Unshifted tails start at n-3, shifted tails at n-4
    bool is_shifted_tail(size_t entity_idx) const
    {
        return tails.get_all()[entity_idx].start_index() == dyadic_size - NUM_MASKED_ROWS - 1;
    }

    /**
     * @brief Register all masked polynomials and their shifted counterparts at once.
     * @details Uses get_masked() from ProverPolynomials to determine which entities to mask.
     * Generates random tail values for each, then derives shifted tails from to-be-shifted sources.
     * Call once before any commits (e.g., at start of OinkProver::prove()).
     */
    template <typename ProverPolynomials> void register_all_masked_polys(ProverPolynomials& polys)
    {
        auto all_polys = polys.get_all();
        auto all_flags = is_masked.get_all();
        auto all_tails = tails.get_all();
        auto masked_polys = polys.get_masked();
        size_t start = dyadic_size - NUM_MASKED_ROWS;

        // 1. Register each masked polynomial with random tail values
        for (auto& masked_poly : masked_polys) {
            for (size_t i = 0; i < all_polys.size(); i++) {
                if (all_polys[i].data() == masked_poly.data() &&
                    all_polys[i].start_index() == masked_poly.start_index()) {
                    active = true;
                    all_flags[i] = true;
                    all_tails[i] = Polynomial(NUM_MASKED_ROWS, dyadic_size, start);
                    for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                        all_tails[i].at(start + j) = FF::random_element();
                    }
                    break;
                }
            }
        }

        // 2. Register shifted polys: for each masked to-be-shifted source, derive the shifted tail
        auto to_be_shifted = polys.get_to_be_shifted();
        auto shifted = polys.get_shifted();
        for (size_t s = 0; s < to_be_shifted.size(); s++) {
            for (size_t i = 0; i < all_polys.size(); i++) {
                if (all_polys[i].data() == to_be_shifted[s].data() &&
                    all_polys[i].start_index() == to_be_shifted[s].start_index() && all_flags[i]) {
                    // Found masked source. Find the shifted poly and derive its tail.
                    for (size_t j = 0; j < all_polys.size(); j++) {
                        if (all_polys[j].data() == shifted[s].data() &&
                            all_polys[j].start_index() == shifted[s].start_index()) {
                            // shift[k] = unshifted[k+1]: positions {n-4, n-3, n-2} with source values
                            size_t shift_start = start - 1;
                            all_flags[j] = true;
                            all_tails[j] = Polynomial(NUM_MASKED_ROWS, dyadic_size, shift_start);
                            for (size_t k = 0; k < NUM_MASKED_ROWS; k++) {
                                all_tails[j].at(shift_start + k) = all_tails[i].at(start + k);
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
     * @brief Get the tail polynomial for a given prover polynomial (by data pointer match).
     * @return Pointer to the tail polynomial, or nullptr if not masked.
     */
    template <typename ProverPolynomials>
    const Polynomial* get_tail_for_poly(const ProverPolynomials& polys, const Polynomial& poly) const
    {
        auto all_polys = polys.get_all();
        auto all_flags = is_masked.get_all();
        auto all_tails_ref = tails.get_all();
        for (size_t i = 0; i < all_polys.size(); i++) {
            if (all_polys[i].data() == poly.data() && all_polys[i].start_index() == poly.start_index() &&
                all_flags[i]) {
                return &all_tails_ref[i];
            }
        }
        return nullptr;
    }

    /**
     * @brief Fold masking values after a sumcheck round challenge.
     * @param challenge The round challenge u_i.
     * @param round_idx The sumcheck round index (0-based).
     * @param round_size The round size BEFORE halving (2^{d-i}).
     * @param pe Pointer to PE multivariates (needed for rounds 2+).
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

        auto all_flags = is_masked.get_all();
        auto all_tails = tails.get_all();
        auto all_folded = folded.get_all();

        if (round_idx == 0) {
            size_t start = dyadic_size - NUM_MASKED_ROWS;
            for (size_t i = 0; i < all_flags.size(); i++) {
                if (!all_flags[i]) {
                    continue;
                }
                const auto& tail = all_tails[i];
                if (!is_shifted_tail(i)) {
                    // Unshifted: pos n-4=0, n-3=m0, n-2=m1, n-1=m2
                    FF m0 = tail.at(start), m1 = tail.at(start + 1), m2 = tail.at(start + 2);
                    all_folded[i][0] = challenge * m0;
                    all_folded[i][1] = m1 + challenge * (m2 - m1);
                } else {
                    // Shifted: pos n-4=m0, n-3=m1, n-2=m2, n-1=0
                    FF m0 = tail.at(start - 1), m1 = tail.at(start), m2 = tail.at(start + 1);
                    all_folded[i][0] = m0 + challenge * (m1 - m0);
                    all_folded[i][1] = m2 * (FF::one() - challenge);
                }
            }
            folded_count = 2;
        } else if (round_idx == 1) {
            for (size_t i = 0; i < all_flags.size(); i++) {
                if (!all_flags[i]) {
                    continue;
                }
                all_folded[i][0] += challenge * (all_folded[i][1] - all_folded[i][0]);
            }
            folded_count = 1;
        } else {
            BB_ASSERT(pe != nullptr);
            size_t even_pos = round_size - 2;
            auto all_pe = pe->get_all();
            for (size_t i = 0; i < all_flags.size(); i++) {
                if (!all_flags[i]) {
                    continue;
                }
                FF even_val = all_pe[i][even_pos];
                all_folded[i][0] = even_val + challenge * (all_folded[i][0] - even_val);
            }
        }
    }

    /**
     * @brief Apply claimed evaluation corrections to multivariate evaluations after sumcheck.
     * @details Computes Lagrange-basis corrections from the 3 mask values in each tail polynomial.
     * Unshifted tails use positions {n-3, n-2, n-1}; shifted tails use {n-4, n-3, n-2}.
     */
    template <typename ClaimedEvaluations>
    void apply_claimed_eval_corrections(ClaimedEvaluations& evaluations, std::span<const FF> challenges) const
    {
        auto evals = evaluations.get_all();
        auto all_flags = is_masked.get_all();
        auto all_tails = tails.get_all();

        FF common = FF::one();
        for (size_t k = 2; k < challenges.size(); k++) {
            common *= challenges[k];
        }
        FF u0 = challenges[0], u1 = challenges[1];

        for (size_t i = 0; i < all_flags.size(); i++) {
            if (!all_flags[i]) {
                continue;
            }
            size_t start = all_tails[i].start_index();
            FF m0 = all_tails[i].at(start), m1 = all_tails[i].at(start + 1), m2 = all_tails[i].at(start + 2);

            if (!is_shifted_tail(i)) {
                evals[i] += common * (m0 * u0 * (FF::one() - u1) + m1 * (FF::one() - u0) * u1 + m2 * u0 * u1);
            } else {
                evals[i] += common * (m0 * (FF::one() - u0) * (FF::one() - u1) + m1 * u0 * (FF::one() - u1) +
                                      m2 * (FF::one() - u0) * u1);
            }
        }
    }

    /**
     * @brief Register tail polynomials with the PCS batcher.
     * @details Only registers unshifted tails. The batcher's shift mechanism handles shifted versions.
     */
    template <typename ProverPolynomials, typename PolynomialBatcher>
    void add_tails_to_batcher(const ProverPolynomials& prover_polynomials, PolynomialBatcher& batcher) const
    {
        if (!active) {
            return;
        }

        auto all_polys = prover_polynomials.get_all();
        auto all_flags = is_masked.get_all();
        auto all_tails = tails.get_all();

        for (size_t i = 0; i < all_flags.size(); i++) {
            if (!all_flags[i] || is_shifted_tail(i)) {
                continue;
            }
            const auto& source_poly = all_polys[i];
            for (size_t u = 0; u < batcher.unshifted.size(); u++) {
                if (batcher.unshifted[u].data() == source_poly.data()) {
                    batcher.add_unshifted_tail(u, Polynomial(all_tails[i]));
                    break;
                }
            }
            for (size_t s = 0; s < batcher.to_be_shifted_by_one.size(); s++) {
                if (batcher.to_be_shifted_by_one[s].data() == source_poly.data()) {
                    batcher.add_shifted_tail(s, Polynomial(all_tails[i]));
                    break;
                }
            }
        }
    }
};

} // namespace bb

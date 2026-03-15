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
 * 1. Holds the tail polynomials (NUM_MASKED_ROWS coefficients at positions {n-3, n-2, n-1}, full virtual_size)
 * 2. Tracks which entities are masked via an AllEntities<bool> flag
 * 3. Manages folded masking values across sumcheck rounds
 * 4. Computes claimed evaluation corrections via Lagrange products of challenges
 * 5. Provides tail polynomials for PCS batching
 *
 * Only used for flavors with UseRowDisablingPolynomial (not Translator, which uses a different ZK technique).
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
    AllEntities<std::array<FF, 2>> folded{};

    // Global folding state: 0 = not yet folded, 2 = after round 0, 1 = after round 1+.
    size_t folded_count = 0;

    size_t dyadic_size = 0;
    bool active = false;

    bool is_active() const { return active; }
    size_t get_folded_count() const { return folded_count; }

    /**
     * @brief Register all masked polynomials and their shifted counterparts at once.
     * @details Uses get_masked() on the parallel AllEntities structs (is_masked, tails) to directly
     * access the right slots without pointer matching. Shifted tails are derived via get_to_be_shifted()
     * / get_shifted() which are guaranteed parallel arrays.
     * Call once before any commits (e.g., at start of OinkProver::prove()).
     */
    template <typename ProverPolynomials> void register_all_masked_polys([[maybe_unused]] ProverPolynomials& polys)
    {
        size_t start = dyadic_size - NUM_MASKED_ROWS;

        // 1. Mark masked entities and generate random tail values
        auto masked_flags = is_masked.get_masked();
        auto masked_tails = tails.get_masked();
        for (size_t i = 0; i < masked_flags.size(); i++) {
            masked_flags[i] = true;
            masked_tails[i] = Polynomial(NUM_MASKED_ROWS, dyadic_size, start);
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                masked_tails[i].at(start + j) = FF::random_element();
            }
        }
        active = true;

        // 2. Derive shifted tails: get_to_be_shifted() and get_shifted() are parallel arrays.
        // All to-be-shifted sources are in get_masked(), so all shifted entries are active.
        auto src_tails = tails.get_to_be_shifted();
        auto shifted_flags = is_masked.get_shifted();
        auto shifted_tails = tails.get_shifted();
        size_t shift_start = start - 1;
        for (size_t s = 0; s < shifted_tails.size(); s++) {
            shifted_flags[s] = true;
            shifted_tails[s] = Polynomial(NUM_MASKED_ROWS, dyadic_size, shift_start);
            for (size_t k = 0; k < NUM_MASKED_ROWS; k++) {
                shifted_tails[s].at(shift_start + k) = src_tails[s].at(start + k);
            }
        }
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

        if (round_idx == 0) {
            size_t start = dyadic_size - NUM_MASKED_ROWS;

            // Unshifted masked: positions {n-3, n-2, n-1} have values {m0, m1, m2}, position n-4 = 0
            auto masked_tails = tails.get_masked();
            auto masked_folded = folded.get_masked();
            for (size_t i = 0; i < masked_tails.size(); i++) {
                FF m0 = masked_tails[i].at(start);
                FF m1 = masked_tails[i].at(start + 1);
                FF m2 = masked_tails[i].at(start + 2);
                masked_folded[i][0] = challenge * m0;
                masked_folded[i][1] = m1 + challenge * (m2 - m1);
            }

            // Shifted: positions {n-4, n-3, n-2} have values {m0, m1, m2}, position n-1 = 0
            auto shifted_tails = tails.get_shifted();
            auto shifted_folded = folded.get_shifted();
            for (size_t s = 0; s < shifted_tails.size(); s++) {
                FF m0 = shifted_tails[s].at(start - 1);
                FF m1 = shifted_tails[s].at(start);
                FF m2 = shifted_tails[s].at(start + 1);
                shifted_folded[s][0] = m0 + challenge * (m1 - m0);
                shifted_folded[s][1] = m2 * (FF::one() - challenge);
            }
            folded_count = 2;
        } else if (round_idx == 1) {
            // Same formula for both unshifted and shifted: collapse two folded values into one
            auto fold_round1 = [&](auto folded_refs) {
                for (size_t i = 0; i < folded_refs.size(); i++) {
                    folded_refs[i][0] += challenge * (folded_refs[i][1] - folded_refs[i][0]);
                }
            };
            fold_round1(folded.get_masked());
            fold_round1(folded.get_shifted());
            folded_count = 1;
        } else {
            BB_ASSERT(pe != nullptr);
            size_t even_pos = round_size - 2;
            // Interpolate between PE value and folded value
            auto fold_round2_plus = [&](auto folded_refs, auto pe_refs) {
                for (size_t i = 0; i < folded_refs.size(); i++) {
                    FF even_val = pe_refs[i][even_pos];
                    folded_refs[i][0] = even_val + challenge * (folded_refs[i][0] - even_val);
                }
            };
            fold_round2_plus(folded.get_masked(), pe->get_masked());
            fold_round2_plus(folded.get_shifted(), pe->get_shifted());
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
        auto masked_evals = evaluations.get_masked();
        auto masked_tails = tails.get_masked();
        for (size_t i = 0; i < masked_tails.size(); i++) {
            FF m0 = masked_tails[i].at(start);
            FF m1 = masked_tails[i].at(start + 1);
            FF m2 = masked_tails[i].at(start + 2);
            masked_evals[i] += common * (m0 * u0 * (FF::one() - u1) + m1 * (FF::one() - u0) * u1 + m2 * u0 * u1);
        }

        // Shifted: Lagrange basis at positions {n-4, n-3, n-2}
        auto shifted_evals = evaluations.get_shifted();
        auto shifted_tails = tails.get_shifted();
        for (size_t s = 0; s < shifted_tails.size(); s++) {
            FF m0 = shifted_tails[s].at(start - 1);
            FF m1 = shifted_tails[s].at(start);
            FF m2 = shifted_tails[s].at(start + 1);
            shifted_evals[s] += common * (m0 * (FF::one() - u0) * (FF::one() - u1) + m1 * u0 * (FF::one() - u1) +
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

        auto masked_polys = prover_polynomials.get_masked();
        auto masked_tails = tails.get_masked();

        for (size_t i = 0; i < masked_polys.size(); i++) {
            const auto& poly = masked_polys[i];
            for (size_t u = 0; u < batcher.unshifted.size(); u++) {
                if (batcher.unshifted[u].data() == poly.data()) {
                    batcher.add_unshifted_tail(u, Polynomial(masked_tails[i]));
                    break;
                }
            }
            for (size_t s = 0; s < batcher.to_be_shifted_by_one.size(); s++) {
                if (batcher.to_be_shifted_by_one[s].data() == poly.data()) {
                    batcher.add_shifted_tail(s, Polynomial(masked_tails[i]));
                    break;
                }
            }
        }
    }
};

} // namespace bb

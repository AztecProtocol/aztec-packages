// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
#include <optional>

namespace bb {

/**
 * @brief Logic to support batching opening claims for unshifted and shifted polynomials in Shplemini
 * @details Stores references to the commitments/evaluations of unshifted and shifted polynomials to be
 * batch opened via Shplemini. Aggregates the commitments and batching scalars for each batch into the corresponding
 * containers for Shplemini. Computes the batched evaluation. Contains logic for computing the per-batch scalars
 * used to batch each set of claims (see details below).
 * @note This class performs the actual batching of the evaluations but not of the commitments. The latter are
 * simply appended to a larger container, along with the scalars used to batch them. This is because Shplemini
 * is optimized to perform a single batch mul that includes all commitments from each stage of the PCS. See
 * description of ShpleminiVerifier for more details.
 *
 */
template <typename Curve> struct ClaimBatcher_ {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    struct Batch {
        RefVector<Commitment> commitments;
        RefVector<Fr> evaluations;
        // scalar used for batching the claims, excluding the power of batching challenge \rho
        Fr scalar = 0;
    };

    std::optional<Batch> unshifted; // commitments and evaluations of unshifted polynomials
    std::optional<Batch> shifted;   // commitments of to-be-shifted polys, evals of their shifts
    size_t shift_exponent = 1;      // shift depth: 1 for standard (G/X), k for interleaved (G/X^k)

    Batch get_unshifted() { return (unshifted) ? *unshifted : Batch{}; }
    Batch get_shifted() { return (shifted) ? *shifted : Batch{}; }

    Fr get_unshifted_batch_scalar() const { return unshifted ? unshifted->scalar : Fr{ 0 }; }

    /**
     * @brief Compute scalars used to batch each set of claims, excluding contribution from batching challenge \rho
     * @details Computes scalars s_0, s_1 given by
     * \f[
     * - s_0 = \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right) \f],
     * - s_1 = \frac{1}{r^k} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
     * \f]
     * where k is the shift_exponent member (1 for standard shifts, 4 for interleaved polynomials with batch_size=4),
     * and the scalars used to batch the claims are given by
     * \f[
     * \left(
     * - s_0,
     * \ldots,
     * - \rho^{i+k-1} \times s_0,
     * - \rho^{i+k} \times s_1,
     * \ldots,
     * - \rho^{k+m-1} \times s_1
     * \right)
     * \f]
     *
     * @param inverse_vanishing_evals 1/(z-r), 1/(z+r), 1/(z-r²), 1/(z+r²), ..., 1/(z-r^{2^{d-1}}), 1/(z+r^{2^{d-1}})
     * @param nu_challenge ν (shplonk batching challenge)
     * @param r_challenge r (gemini evaluation challenge)
     */
    void compute_scalars_for_each_batch(std::span<const Fr> inverted_vanishing_evals,
                                        const Fr& nu_challenge,
                                        const Fr& r_challenge)
    {
        const Fr& inverse_vanishing_eval_pos = inverted_vanishing_evals[0];
        const Fr& inverse_vanishing_eval_neg = inverted_vanishing_evals[1];

        if (unshifted) {
            // (1/(z−r) + ν/(z+r))
            unshifted->scalar = inverse_vanishing_eval_pos + nu_challenge * inverse_vanishing_eval_neg;
        }
        if (shifted) {
            // r⁻ᵏ ⋅ (1/(z−r) + (-1)^k ⋅ ν/(z+r)) where k is the shift_exponent
            // This comes from A₀₋(X) = F(X) + (-1)^k · G(X)/r^k, needed because (-r)^k = (-1)^k · r^k
            // For standard shifts k=1 (odd): r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            // For interleaved shifts k=4 (even): r⁻⁴ ⋅ (1/(z−r) + ν/(z+r))
            if (shift_exponent == 1) {
                // Fast path: avoid extra multiplication by neg_sign (important for recursive verifiers)
                shifted->scalar =
                    r_challenge.invert() * (inverse_vanishing_eval_pos - nu_challenge * inverse_vanishing_eval_neg);
            } else {
                Fr r_power = r_challenge;
                for (size_t i = 1; i < shift_exponent; ++i) {
                    r_power *= r_challenge;
                }
                const Fr r_inv_shift = r_power.invert();
                // (-1)^k: even k gives +1, odd k gives -1 (but k=1 handled above)
                const Fr neg_sign = (shift_exponent % 2 == 0) ? Fr(1) : Fr(-1);
                shifted->scalar =
                    r_inv_shift * (inverse_vanishing_eval_pos + neg_sign * nu_challenge * inverse_vanishing_eval_neg);
            }
        }
    }
    /**
     * @brief Append the commitments and scalars from each batch of claims to the Shplemini vectors which subsequently
     * will be inputs to the batch mul;
     * update the batched evaluation and the running batching challenge (power of rho) in place.
     *
     * @param commitments commitment inputs to the single Shplemini batch mul
     * @param scalars scalar inputs to the single Shplemini batch mul
     * @param batched_evaluation running batched evaluation of the committed multilinear polynomials
     * @param rho multivariate batching challenge \rho
     */
    void update_batch_mul_inputs_and_batched_evaluation(std::vector<Commitment>& commitments,
                                                        std::vector<Fr>& scalars,
                                                        Fr& batched_evaluation,
                                                        const Fr& rho)
    {
        size_t num_powers = 0;
        num_powers += unshifted.has_value() ? unshifted->commitments.size() : 0;
        num_powers += shifted.has_value() ? shifted->commitments.size() : 0;

        Fr rho_power = Fr(1);
        size_t power_idx = 0;

        // Append the commitments/scalars from a given batch to the corresponding containers; update the batched
        // evaluation and the running batching challenge in place
        auto aggregate_claim_data_and_update_batched_evaluation = [&](const Batch& batch) {
            for (auto [commitment, evaluation] : zip_view(batch.commitments, batch.evaluations)) {
                commitments.emplace_back(std::move(commitment));
                scalars.emplace_back(-batch.scalar * rho_power);
                batched_evaluation += evaluation * rho_power;
                power_idx++;
                if (power_idx < num_powers) {
                    rho_power *= rho;
                }
            }
        };

        // Incorporate the claim data from each batch of claims that is present in the vectors of commitments and
        // scalars for the batch mul
        if (unshifted) {
            // i-th Unshifted commitment will be multiplied by ρ^i and (1/(z−r) + ν/(z+r))
            aggregate_claim_data_and_update_batched_evaluation(*unshifted);
        }
        if (shifted) {
            // i-th shifted commitments will be multiplied by ρ^{num_unshifted + i} and r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            aggregate_claim_data_and_update_batched_evaluation(*shifted);
        }

        BB_ASSERT_EQ(power_idx, num_powers);
    }
};

} // namespace bb

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include <optional>

namespace bb {

/**
 * @brief Logic to support batching opening claims for unshifted and shifted polynomials in Shplemini
 * @details Stores references to the commitments/evaluations of unshifted and shifted polynomials to be batched
 * opened via Shplemini. Aggregates the commitments and batching scalars for each batch into the corresponding
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
    std::optional<Batch> shifted;   // commitments of to-be-shifted-by-1 polys, evals of their shifts

    Fr get_unshifted_batch_scalar() const { return unshifted ? unshifted->scalar : Fr{ 0 }; }

    /**
     * @brief Compute scalars used to batch each set of claims, excluding contribution from batching challenge \rho
     * @details Computes scalars s_0 and s_1 given by
     * \f[
     * - s_0 = \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right) \f],
     * - s_1 = \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
     * \f]
     * where the scalars used to batch the claims are given by
     * \f[
     * \left(
     * - s_0,
     * \ldots,
     * - \rho^{i+k-1} \times s_0,
     * - \rho^{i+k} \times \frac{1}{r} \times s_1,
     * \ldots,
     * - \rho^{k+m-1} \times \frac{1}{r} \times s_1
     * \right)
     * \f]
     *
     * @param inverse_vanishing_eval_pos 1/(z-r)
     * @param inverse_vanishing_eval_neg 1/(z+r)
     * @param nu_challenge ν (shplonk batching challenge)
     * @param r_challenge r (gemini evaluation challenge)
     */
    void compute_scalars_for_each_batch(const Fr& inverse_vanishing_eval_pos,
                                        const Fr& inverse_vanishing_eval_neg,
                                        const Fr& nu_challenge,
                                        const Fr& r_challenge)
    {
        if (unshifted) {
            // (1/(z−r) + ν/(z+r))
            unshifted->scalar = inverse_vanishing_eval_pos + nu_challenge * inverse_vanishing_eval_neg;
        }
        if (shifted) {
            // r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            shifted->scalar =
                r_challenge.invert() * (inverse_vanishing_eval_pos - nu_challenge * inverse_vanishing_eval_neg);
        }
    }

    /**
     * @brief Append the commitments and scalars from each batch of claims to the Shplemini batch mul input vectors;
     * update the batched evaluation and the running batching challenge (power of rho) in place.
     *
     * @param commitments commitment inputs to the single Shplemini batch mul
     * @param scalars scalar inputs to the single Shplemini batch mul
     * @param batched_evaluation running batched evaluation of the committed multilinear polynomials
     * @param rho multivariate batching challenge \rho
     * @param rho_power current power of \rho used in the batching scalar
     */
    void update_batch_mul_inputs_and_batched_evaluation(std::vector<Commitment>& commitments,
                                                        std::vector<Fr>& scalars,
                                                        Fr& batched_evaluation,
                                                        const Fr& rho,
                                                        Fr& rho_power)
    {
        // Append the commitments/scalars from a given batch to the corresponding containers; update the batched
        // evaluation and the running batching challenge in place
        auto aggregate_claim_data_and_update_batched_evaluation = [&](const Batch& batch, Fr& rho_power) {
            for (auto [commitment, evaluation] : zip_view(batch.commitments, batch.evaluations)) {
                commitments.emplace_back(std::move(commitment));
                scalars.emplace_back(-batch.scalar * rho_power);
                batched_evaluation += evaluation * rho_power;
                rho_power *= rho;
            }
        };

        // Incorporate the claim data from each batch of claims that is present
        if (unshifted) {
            aggregate_claim_data_and_update_batched_evaluation(*unshifted, rho_power);
        }
        if (shifted) {
            aggregate_claim_data_and_update_batched_evaluation(*shifted, rho_power);
        }
    }
};

} // namespace bb
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

    std::optional<Batch> unshifted;          // commitments and evaluations of unshifted polynomials
    std::optional<Batch> shifted;            // commitments of to-be-shifted-by-1 polys, evals of their shifts
    std::optional<Batch> right_shifted_by_k; // commitments of to-be-right-shifted-by-k polys, evals of their shifts

    Batch get_unshifted() { return (unshifted) ? *unshifted : Batch{}; }
    Batch get_shifted() { return (shifted) ? *shifted : Batch{}; }
    Batch get_right_shifted_by_k() { return (right_shifted_by_k) ? *right_shifted_by_k : Batch{}; }

    size_t k_shift_magnitude = 0; // magnitude of right-shift-by-k (assumed even)

    Fr get_unshifted_batch_scalar() const { return unshifted ? unshifted->scalar : Fr{ 0 }; }

    /**
     * @brief Compute scalars used to batch each set of claims, excluding contribution from batching challenge \rho
     * @details Computes scalars s_0, s_1, s_2 given by
     * \f[
     * - s_0 = \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right) \f],
     * - s_1 = \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
     * - s_2 = r^{k} \times \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right)
     * \f]
     * where the scalars used to batch the claims are given by
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
        if (right_shifted_by_k) {
            // r^k ⋅ (1/(z−r) + ν/(z+r))
            right_shifted_by_k->scalar = r_challenge.pow(k_shift_magnitude) *
                                         (inverse_vanishing_eval_pos + nu_challenge * inverse_vanishing_eval_neg);
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
        if (right_shifted_by_k) {
            aggregate_claim_data_and_update_batched_evaluation(*right_shifted_by_k, rho_power);
        }
    }

    /**
     * @brief The verifier needs to compute 2^{num_polys_in_group} evaluations of the multilinear Lagranges at (u_{n},
     * u_{n+1}, ..., u_{n + num_polys_in_group -1 }). Here is the optimal solution in terms of field ops.
     *
     * @param extra_challenges
     * @return std::vector<Fr>
     */
    static std::vector<Fr> compute_lagranges_for_multi_claim(std::vector<Fr>& extra_challenges)
    {
        std::vector<Fr> lagrange_coeffs(1);

        lagrange_coeffs[0] = Fr{ 1 };

        // Repeatedly "double" the vector by multiplying half by (1 - u_j) and half by u_j
        for (size_t j = 0; j < extra_challenges.size(); ++j) {
            Fr current_challenge = extra_challenges[j];
            size_t old_size = lagrange_coeffs.size();
            std::vector<Fr> lagrange_coeffs_next(old_size * 2);

            for (size_t i = 0; i < old_size; ++i) {
                lagrange_coeffs_next[i] = lagrange_coeffs[i] * (Fr(1) - current_challenge);
                lagrange_coeffs_next[i + old_size] = lagrange_coeffs[i] * current_challenge;
            }
            lagrange_coeffs = std::move(lagrange_coeffs_next);
        }

        return lagrange_coeffs;
    }

    /**
     * @brief The verifier needs to `parse` prover's claimed evaluations by grouping them by 2^{num_polys_in_group} and
     * taking the sums of elements in each group multiplied by the corresponding Lagrange coefficient. I.e. the
     * evaluation of the i'th poly in a group is multiplied by L_i evaluated at the `extra_challenges`.
     *
     * @param num_polys_in_group
     * @param lagrange_coeffs
     */
    static std::pair<RefVector<Fr>, RefVector<Fr>> combine_from_chunks(RefVector<Fr> unshifted_evaluations,
                                                                       RefVector<Fr> shifted_evaluations,
                                                                       const size_t num_polys_in_group,
                                                                       std::vector<Fr>& lagrange_coeffs)
    {
        size_t num_unshifted_concatenated = unshifted_evaluations.size() / num_polys_in_group;

        std::vector<Fr> unshifted_concatenated_evaluations;
        for (size_t group_idx = 0; group_idx < num_unshifted_concatenated; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval +=
                    unshifted_evaluations[chunk_idx + num_polys_in_group * group_idx] * lagrange_coeffs[chunk_idx];
            }

            unshifted_concatenated_evaluations.push_back(combined_eval);
        }

        const size_t num_shifted_evals = shifted_evaluations.size() / num_polys_in_group;
        std::vector<Fr> shifted_concatenated_evaluations;

        for (size_t group_idx = 0; group_idx < num_shifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };

            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval +=
                    shifted_evaluations[chunk_idx + num_polys_in_group * group_idx] * lagrange_coeffs[chunk_idx];
            }

            shifted_concatenated_evaluations.push_back(combined_eval);
        }

        return std::make_pair<RefVector<Fr>, RefVector<Fr>>(RefVector(unshifted_concatenated_evaluations),
                                                            RefVector(shifted_concatenated_evaluations));
    }
};

} // namespace bb
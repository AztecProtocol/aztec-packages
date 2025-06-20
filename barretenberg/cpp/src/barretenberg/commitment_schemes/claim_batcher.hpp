// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
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
    struct InterleavedBatch {
        std::vector<RefVector<Commitment>> commitments_groups;
        RefVector<Fr> evaluations;
        std::vector<Fr> scalars_pos;
        std::vector<Fr> scalars_neg;
        Fr shplonk_denominator;
    };

    std::optional<Batch> unshifted;              // commitments and evaluations of unshifted polynomials
    std::optional<Batch> shifted;                // commitments of to-be-shifted-by-1 polys, evals of their shifts
    std::optional<Batch> right_shifted_by_k;     // commitments of to-be-right-shifted-by-k polys, evals of their shifts
    std::optional<InterleavedBatch> interleaved; // commitments to groups of polynomials to be combined by interleaving
                                                 // and evaluations of the resulting interleaved polynomials

    Batch get_unshifted() { return (unshifted) ? *unshifted : Batch{}; }
    Batch get_shifted() { return (shifted) ? *shifted : Batch{}; }
    Batch get_right_shifted_by_k() { return (right_shifted_by_k) ? *right_shifted_by_k : Batch{}; }
    InterleavedBatch get_interleaved() { return (interleaved) ? *interleaved : InterleavedBatch{}; }
    uint32_t get_groups_to_be_interleaved_size()
    {
        return (interleaved) ? static_cast<uint32_t>(interleaved->commitments_groups[0].size()) : 0;
    }

    uint32_t k_shift_magnitude = 0; // magnitude of right-shift-by-k (assumed even)

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
            // r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            shifted->scalar =
                r_challenge.invert() * (inverse_vanishing_eval_pos - nu_challenge * inverse_vanishing_eval_neg);
        }
        if (right_shifted_by_k) {
            // r^k ⋅ (1/(z−r) + ν/(z+r))
            right_shifted_by_k->scalar = r_challenge.pow(k_shift_magnitude) *
                                         (inverse_vanishing_eval_pos + nu_challenge * inverse_vanishing_eval_neg);
        }

        if (interleaved) {
            const size_t interleaving_denominator_index = 2 * numeric::get_msb(get_groups_to_be_interleaved_size());

            if (get_groups_to_be_interleaved_size() % 2 != 0) {
                throw_or_abort("Interleaved groups size must be even");
            }

            Fr r_shift_pos = Fr(1);
            Fr r_shift_neg = Fr(1);
            interleaved->shplonk_denominator = inverted_vanishing_evals[interleaving_denominator_index];
            for (size_t i = 0; i < get_groups_to_be_interleaved_size(); i++) {
                interleaved->scalars_pos.push_back(r_shift_pos);
                interleaved->scalars_neg.push_back(r_shift_neg);
                r_shift_pos *= r_challenge;
                r_shift_neg *= (-r_challenge);
            }
        }
    }
    /**
     * @brief Append the commitments and scalars from each batch of claims to the Shplemini, vectors which subsequently
     * will be inputs to the batch mul;
     * update the batched evaluation and the running batching challenge (power of rho) in place.
     *
     * @param commitments commitment inputs to the single Shplemini batch mul
     * @param scalars scalar inputs to the single Shplemini batch mul
     * @param batched_evaluation running batched evaluation of the committed multilinear polynomials
     * @param rho multivariate batching challenge \rho
     * @param rho_power current power of \rho used in the batching scalar
     * @param shplonk_batching_pos and @param shplonk_batching_neg consecutive powers of the Shplonk batching
     * challenge ν for the interleaved contributions
     */
    void update_batch_mul_inputs_and_batched_evaluation(std::vector<Commitment>& commitments,
                                                        std::vector<Fr>& scalars,
                                                        Fr& batched_evaluation,
                                                        const Fr& rho,
                                                        Fr& rho_power,
                                                        Fr shplonk_batching_pos = { 0 },
                                                        Fr shplonk_batching_neg = { 0 })
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

        // Incorporate the claim data from each batch of claims that is present in the vectors of commitments and
        // scalars for the batch mul
        if (unshifted) {
            // i-th Unshifted commitment will be multiplied by ρ^i and (1/(z−r) + ν/(z+r))
            aggregate_claim_data_and_update_batched_evaluation(*unshifted, rho_power);
        }
        if (shifted) {
            // i-th shifted commitments will be multiplied by p^{k+i} and r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            aggregate_claim_data_and_update_batched_evaluation(*shifted, rho_power);
        }
        if (right_shifted_by_k) {
            // i-th right-shifted-by-k commitments will be multiplied by ρ^{k+m+i} and r^k ⋅ (1/(z−r) + ν/(z+r))
            aggregate_claim_data_and_update_batched_evaluation(*right_shifted_by_k, rho_power);
        }
        if (interleaved) {
            if (get_groups_to_be_interleaved_size() % 2 != 0) {
                throw_or_abort("Interleaved groups size must be even");
            }

            size_t group_idx = 0;
            for (auto group : interleaved->commitments_groups) {
                for (size_t i = 0; i < get_groups_to_be_interleaved_size(); i++) {
                    // The j-th commitment in group i is multiplied by ρ^{k+m+i} and ν^{n+1} \cdot r^j + ν^{n+2} ⋅(-r)^j
                    //  where k is the number of unshifted, m is number of shifted and n is the log_circuit_size
                    //  (assuming to right-shifted-by-k commitments in this example)
                    commitments.emplace_back(std::move(group[i]));
                    scalars.emplace_back(-rho_power * interleaved->shplonk_denominator *
                                         (shplonk_batching_pos * interleaved->scalars_pos[i] +
                                          shplonk_batching_neg * interleaved->scalars_neg[i]));
                }
                batched_evaluation += interleaved->evaluations[group_idx] * rho_power;
                rho_power *= rho;
                group_idx++;
            }
        }
    }
};

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <optional>

namespace bb {

/**
 * @brief Logic to support batching opening claims for unshifted, shifted and interleaved polynomials in Shplemini
 * @details Stores references to the commitments/evaluations of unshifted, shifted and interleaved polynomials to be
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
    struct InterleavedBatch {
        std::vector<RefVector<Commitment>> commitments_groups;
        RefVector<Fr> evaluations;
        std::vector<Fr> scalars_pos;
        std::vector<Fr> scalars_neg;
        Fr shplonk_denominator;
    };

    std::optional<Batch> unshifted;              // commitments and evaluations of unshifted polynomials
    std::optional<Batch> shifted;                // commitments of to-be-shifted-by-1 polys, evals of their shifts
    std::optional<InterleavedBatch> interleaved; // commitments to groups of polynomials to be combined by interleaving
                                                 // and evaluations of the resulting interleaved polynomials

    Batch get_unshifted() { return (unshifted) ? *unshifted : Batch{}; }
    Batch get_shifted() { return (shifted) ? *shifted : Batch{}; }
    InterleavedBatch get_interleaved() { return (interleaved) ? *interleaved : InterleavedBatch{}; }
    uint32_t get_groups_to_be_interleaved_size()
    {
        return (interleaved) ? static_cast<uint32_t>(interleaved->commitments_groups[0].size()) : 0;
    }

    Fr get_unshifted_batch_scalar() const { return unshifted ? unshifted->scalar : Fr{ 0 }; }

    /**
     * @brief Compute scalars used to batch each set of claims, excluding contribution from batching challenge \rho
     * @details Computes scalars s_0, s_1 given by
     * \f[
     * - s_0 = \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right) \f],
     * - s_1 = \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
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
            // r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
            shifted->scalar =
                r_challenge.invert() * (inverse_vanishing_eval_pos - nu_challenge * inverse_vanishing_eval_neg);
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
                if (i < get_groups_to_be_interleaved_size() - 1) {
                    // to avoid unnecessary multiplication gates in a circuit
                    r_shift_pos *= r_challenge;
                    r_shift_neg *= (-r_challenge);
                }
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
                                                        Fr shplonk_batching_pos = { 0 },
                                                        Fr shplonk_batching_neg = { 0 })
    {
        size_t num_powers = 0;
        num_powers += unshifted.has_value() ? unshifted->commitments.size() : 0;
        num_powers += shifted.has_value() ? shifted->commitments.size() : 0;
        num_powers += interleaved.has_value() ? interleaved->evaluations.size() : 0;

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
        if (interleaved) {
            if (get_groups_to_be_interleaved_size() % 2 != 0) {
                throw_or_abort("Interleaved groups size must be even");
            }

            size_t group_idx = 0;
            for (size_t j = 0; j < interleaved->commitments_groups.size(); j++) {
                for (size_t i = 0; i < get_groups_to_be_interleaved_size(); i++) {
                    // The j-th commitment in group i is multiplied by ρ^{m+i} and ν^{d+1} \cdot r^j + ν^{d+2} ⋅(-r)^j
                    //  where d is the log_circuit_size
                    commitments.emplace_back(std::move(interleaved->commitments_groups[j][i]));
                    scalars.emplace_back(-rho_power * interleaved->shplonk_denominator *
                                         (shplonk_batching_pos * interleaved->scalars_pos[i] +
                                          shplonk_batching_neg * interleaved->scalars_neg[i]));
                }
                batched_evaluation += interleaved->evaluations[group_idx] * rho_power;
                power_idx++;
                if (power_idx < num_powers) {
                    rho_power *= rho;
                }
                group_idx++;
            }
        }

        BB_ASSERT_EQ(power_idx, num_powers);
    }
};

} // namespace bb

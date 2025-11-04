// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

#include <vector>

namespace bb {

template <typename Flavor_> class MultilinearBatchingVerifier {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Transcript = typename Flavor::Transcript;

    using Commitment = typename Flavor::Commitment;
    using Sumcheck = SumcheckVerifier<Flavor>;
    using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
    using Proof = std::vector<FF>;

    using InstanceFlavor = std::conditional_t<std::is_same_v<Flavor, MultilinearBatchingFlavor>,
                                              MegaFlavor,
                                              MegaRecursiveFlavor_<MegaCircuitBuilder>>;
    using InstanceCommitments = InstanceFlavor::VerifierCommitments;
    using InstanceFF = InstanceFlavor::FF;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;

    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    std::pair<bool, VerifierClaim> verify_proof(SumcheckOutput<InstanceFlavor>& instance_sumcheck,
                                                InstanceCommitments& verifier_commitments,
                                                std::vector<InstanceFF>& unshifted_challenges,
                                                std::vector<InstanceFF>& shifted_challenges);

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierClaim> accumulator_claim;
    std::shared_ptr<VerifierClaim> instance_claim;

    /**
     * @brief Utility to compute the new target sum for the batching sumcheck.
     */
    FF compute_new_target_sum(const FF& alpha,
                              SumcheckOutput<InstanceFlavor>& instance_sumcheck,
                              const std::vector<InstanceFF>& unshifted_challenges,
                              const std::vector<InstanceFF>& shifted_challenges,
                              const FF& accumulator_non_shifted_evaluation,
                              const FF& accumulator_shifted_evaluation) const
    {
        // Compute new target sum as:
        // accumulator_non_shifted_evaluation
        //  + alpha * accumulator_shifted_evaluation
        //     + alpha^2 sum( instance_sumcheck.claimed_unshifted_evals * unshifted_challenges )
        //       + alpha^3 sum( instance_sumcheck.claimed_shifted_evals * shifted_challenges )
        FF target_sum(0);
        for (auto [eval, challenge] :
             zip_view(instance_sumcheck.claimed_evaluations.get_shifted(), shifted_challenges)) {
            target_sum += eval * challenge;
        }
        target_sum *= alpha;
        for (auto [eval, challenge] :
             zip_view(instance_sumcheck.claimed_evaluations.get_unshifted(), unshifted_challenges)) {
            target_sum += eval * challenge;
        }
        target_sum *= alpha;
        target_sum += accumulator_shifted_evaluation; // Accumulator shifted evaluation
        target_sum *= alpha;
        target_sum += accumulator_non_shifted_evaluation; // Accumulator non-shifted evaluation

        return target_sum;
    }

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N>
    Commitment batch_mul(RefArray<Commitment, N> instance_commitments,
                         const Commitment& accumulator_commitment,
                         std::vector<FF>& scalars,
                         const FF& batching_challenge)
    {
        std::vector<Commitment> points(N + 1);
        for (size_t idx = 0; auto point : instance_commitments) {
            points[idx++] = point;
        }
        points.back() = accumulator_commitment;
        scalars.emplace_back(batching_challenge);

        if constexpr (IsRecursiveFlavor<Flavor>) {
            return Curve::Group::batch_mul(points, scalars);
        } else {
            return batch_mul_native(points, scalars);
        }
    }

    /**
     * @brief Utility to compute the new claim after the batching sumcheck.
     */
    VerifierClaim compute_new_claim(const SumcheckOutput<Flavor>& sumcheck_result,
                                    InstanceCommitments& verifier_commitments,
                                    std::vector<InstanceFF>& unshifted_challenges,
                                    std::vector<InstanceFF>& shifted_challenges,
                                    const Commitment& non_shifted_accumulator_commitment,
                                    const Commitment& shifted_accumulator_commitment,
                                    const FF& batching_challenge)
    {
        // Compute new claim as instance + challenge * accumulator
        Commitment non_shifted_commitment = batch_mul<NUM_UNSHIFTED_ENTITIES>(verifier_commitments.get_unshifted(),
                                                                              non_shifted_accumulator_commitment,
                                                                              unshifted_challenges,
                                                                              batching_challenge);
        Commitment shifted_commitment = batch_mul<NUM_SHIFTED_ENTITIES>(verifier_commitments.get_to_be_shifted(),
                                                                        shifted_accumulator_commitment,
                                                                        shifted_challenges,
                                                                        batching_challenge);

        FF shifted_evaluation = sumcheck_result.claimed_evaluations.w_shifted_instance +
                                sumcheck_result.claimed_evaluations.w_shifted_accumulator * batching_challenge;
        FF non_shifted_evaluation = sumcheck_result.claimed_evaluations.w_non_shifted_instance +
                                    sumcheck_result.claimed_evaluations.w_non_shifted_accumulator * batching_challenge;
        std::vector<FF> challenge = sumcheck_result.challenge;

        return VerifierClaim{
            .challenge = challenge,
            .non_shifted_evaluation = non_shifted_evaluation,
            .shifted_evaluation = shifted_evaluation,
            .non_shifted_commitment = non_shifted_commitment,
            .shifted_commitment = shifted_commitment,
        };
    };
};

} // namespace bb

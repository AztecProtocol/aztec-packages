// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "multilinear_batching_verifier.hpp"
#include "barretenberg/flavor/multilinear_batching_recursive_flavor.hpp"

namespace bb {

template <typename Flavor_>
MultilinearBatchingVerifier<Flavor_>::MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

template <typename Flavor_>
std::pair<bool, typename MultilinearBatchingVerifier<Flavor_>::VerifierClaim> MultilinearBatchingVerifier<
    Flavor_>::verify_proof()
{
    // Receive commitments
    auto non_shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("non_shifted_accumulator_commitment");
    auto shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("shifted_accumulator_commitment");
    auto non_shifted_instance_commitment =
        transcript->template receive_from_prover<Commitment>("non_shifted_instance_commitment");
    auto shifted_instance_commitment =
        transcript->template receive_from_prover<Commitment>("shifted_instance_commitment");
    std::vector<FF> accumulator_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> instance_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> accumulator_evaluations(2);
    std::vector<FF> instance_evaluations(2);
    // Receive challenges and evaluations
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        accumulator_challenges[i] =
            transcript->template receive_from_prover<FF>("accumulator_challenge_" + std::to_string(i));
        instance_challenges[i] =
            transcript->template receive_from_prover<FF>("instance_challenge_" + std::to_string(i));
    }
    for (size_t i = 0; i < 2; i++) {
        accumulator_evaluations[i] =
            transcript->template receive_from_prover<FF>("accumulator_evaluation_" + std::to_string(i));
        instance_evaluations[i] =
            transcript->template receive_from_prover<FF>("instance_evaluation_" + std::to_string(i));
    }

    auto accumulator_non_shifted_evaluation = accumulator_evaluations[0];
    auto accumulator_shifted_evaluation = accumulator_evaluations[1];
    auto instance_non_shifted_evaluation = instance_evaluations[0];
    auto instance_shifted_evaluation = instance_evaluations[1];

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(Flavor::VIRTUAL_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = FF(1);
    }

    std::vector<FF> padding_indicator(Flavor::VIRTUAL_LOG_N, FF{ 1 });

    auto target_sum = (((instance_shifted_evaluation * alpha + accumulator_shifted_evaluation) * alpha +
                        instance_non_shifted_evaluation) *
                           alpha +
                       accumulator_non_shifted_evaluation);
    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    const auto sumcheck_result = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator);

    // Construct new claim
    auto claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    VerifierClaim verifier_claim;
    verifier_claim.non_shifted_commitment =
        non_shifted_accumulator_commitment + non_shifted_instance_commitment * claim_batching_challenge;
    verifier_claim.shifted_commitment =
        shifted_accumulator_commitment + shifted_instance_commitment * claim_batching_challenge;
    verifier_claim.shifted_evaluation =
        sumcheck_result.claimed_evaluations.w_shifted_accumulator +
        sumcheck_result.claimed_evaluations.w_shifted_instance * claim_batching_challenge;
    verifier_claim.non_shifted_evaluation =
        sumcheck_result.claimed_evaluations.w_non_shifted_accumulator +
        sumcheck_result.claimed_evaluations.w_non_shifted_instance * claim_batching_challenge;
    verifier_claim.challenge = sumcheck_result.challenge;

    // Verification
    bool verified = true;
    auto equality_verified = sumcheck_result.claimed_evaluations.w_evaluations_accumulator ==
                                 EqVerifierPolynomial<FF>::eval(accumulator_challenges, sumcheck_result.challenge) &&
                             sumcheck_result.claimed_evaluations.w_evaluations_instance ==
                                 EqVerifierPolynomial<FF>::eval(instance_challenges, sumcheck_result.challenge);

    if constexpr (IsRecursiveFlavor<Flavor>) {
        equality_verified.assert_equal(stdlib::bool_t(equality_verified.get_context(), true));
        verified = sumcheck_result.verified && equality_verified.get_value();
    } else {
        verified = sumcheck_result.verified && equality_verified;
    }

    return { verified, verifier_claim };
}

template class MultilinearBatchingVerifier<MultilinearBatchingFlavor>;
template class MultilinearBatchingVerifier<MultilinearBatchingRecursiveFlavor>;

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_verifier.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

namespace bb {

template <typename Flavor_>
MultilinearBatchingVerifier<Flavor_>::MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

template <typename Flavor_>
MultilinearBatchingVerifier<Flavor_>::FF MultilinearBatchingVerifier<Flavor_>::compute_new_target_sum(
    const FF& alpha,
    const FF& batched_unshifted_instance_eval,
    const FF& batched_shifted_instance_eval,
    const FF& accumulator_non_shifted_evaluation,
    const FF& accumulator_shifted_evaluation) const
{
    // Compute new target sum as:
    //   accumulator_non_shifted_evaluation
    // + alpha   * accumulator_shifted_evaluation
    // + alpha^2 * batched_unshifted_instance_eval
    // + alpha^3 * batched_shifted_instance_eval
    FF target_sum = batched_shifted_instance_eval;
    target_sum *= alpha;
    target_sum += batched_unshifted_instance_eval;
    target_sum *= alpha;
    target_sum += accumulator_shifted_evaluation;
    target_sum *= alpha;
    target_sum += accumulator_non_shifted_evaluation;

    return target_sum;
}

template <typename Flavor_>
MultilinearBatchingVerifier<Flavor_>::VerifierClaim MultilinearBatchingVerifier<Flavor_>::compute_new_claim(
    const SumcheckOutput<Flavor>& sumcheck_result,
    const std::vector<Commitment>& unshifted_instance_commitments,
    const std::vector<Commitment>& shifted_instance_commitments,
    const std::vector<FF>& unshifted_challenges,
    const std::vector<FF>& shifted_challenges,
    const Commitment& non_shifted_accumulator_commitment,
    const Commitment& shifted_accumulator_commitment,
    const FF& batching_challenge)
{
    // Compute new claim commitments as: instance + batching_challenge * accumulator
    std::vector<Commitment> non_shifted_points;
    non_shifted_points.reserve(unshifted_instance_commitments.size() + 1);
    non_shifted_points.insert(
        non_shifted_points.end(), unshifted_instance_commitments.begin(), unshifted_instance_commitments.end());
    non_shifted_points.push_back(non_shifted_accumulator_commitment);

    std::vector<FF> non_shifted_scalars;
    non_shifted_scalars.reserve(unshifted_instance_commitments.size() + 1);
    non_shifted_scalars.insert(non_shifted_scalars.end(), unshifted_challenges.begin(), unshifted_challenges.end());
    non_shifted_scalars.push_back(batching_challenge);
    Commitment non_shifted_commitment = Curve::Element::batch_mul(non_shifted_points, non_shifted_scalars);

    std::vector<Commitment> shifted_points;
    shifted_points.reserve(shifted_instance_commitments.size() + 1);
    shifted_points.insert(
        shifted_points.end(), shifted_instance_commitments.begin(), shifted_instance_commitments.end());
    shifted_points.push_back(shifted_accumulator_commitment);

    std::vector<FF> shifted_scalars;
    shifted_scalars.reserve(shifted_instance_commitments.size() + 1);
    shifted_scalars.insert(shifted_scalars.end(), shifted_challenges.begin(), shifted_challenges.end());
    shifted_scalars.push_back(batching_challenge);
    Commitment shifted_commitment = Curve::Element::batch_mul(shifted_points, shifted_scalars);

    FF shifted_evaluation = sumcheck_result.claimed_evaluations.batched_shifted_instance +
                            sumcheck_result.claimed_evaluations.batched_shifted_accumulator * batching_challenge;
    FF non_shifted_evaluation = sumcheck_result.claimed_evaluations.batched_unshifted_instance +
                                sumcheck_result.claimed_evaluations.batched_unshifted_accumulator * batching_challenge;
    std::vector<FF> challenge = sumcheck_result.challenge;

    return VerifierClaim{
        .challenge = challenge,
        .non_shifted_evaluation = non_shifted_evaluation,
        .shifted_evaluation = shifted_evaluation,
        .non_shifted_commitment = non_shifted_commitment,
        .shifted_commitment = shifted_commitment,
    };
};

template <typename Flavor_>
std::pair<bool, typename MultilinearBatchingVerifier<Flavor_>::VerifierClaim> MultilinearBatchingVerifier<
    Flavor_>::verify_proof(const FF& batched_unshifted_instance_eval,
                           const FF& batched_shifted_instance_eval,
                           const std::vector<Commitment>& unshifted_instance_commitments,
                           const std::vector<Commitment>& shifted_instance_commitments,
                           const std::vector<FF>& unshifted_challenges,
                           const std::vector<FF>& shifted_challenges,
                           const std::vector<FF>& instance_challenge)
{
    // Receive commitments
    auto non_shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("non_shifted_accumulator_commitment");
    auto shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("shifted_accumulator_commitment");

    // Receive challenges and evaluations
    std::vector<FF> accumulator_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> accumulator_evaluations(Flavor::NUM_ACCUMULATOR_EVALUATIONS);
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        accumulator_challenges[i] =
            transcript->template receive_from_prover<FF>("accumulator_challenge_" + std::to_string(i));
    }
    for (size_t i = 0; i < Flavor::NUM_ACCUMULATOR_EVALUATIONS; i++) {
        accumulator_evaluations[i] =
            transcript->template receive_from_prover<FF>("accumulator_evaluation_" + std::to_string(i));
    }

    // Run sumcheck
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    FF target_sum = compute_new_target_sum(alpha,
                                           batched_unshifted_instance_eval,
                                           batched_shifted_instance_eval,
                                           accumulator_evaluations[0],
                                           accumulator_evaluations[1]);

    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    // MultilinearBatchingFlavor doesn't use gate challenges, and all rounds are non-padding
    std::vector<FF> padding_indicator_array(Flavor::VIRTUAL_LOG_N, FF(1));
    const auto sumcheck_result = sumcheck.verify({}, {}, padding_indicator_array);

    // Construct new claim
    auto claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    VerifierClaim verifier_claim = compute_new_claim(sumcheck_result,
                                                     unshifted_instance_commitments,
                                                     shifted_instance_commitments,
                                                     unshifted_challenges,
                                                     shifted_challenges,
                                                     non_shifted_accumulator_commitment,
                                                     shifted_accumulator_commitment,
                                                     claim_batching_challenge);

    bool eq_consistent = check_eq_consistency(sumcheck_result, accumulator_challenges, instance_challenge);
    bool verified = sumcheck_result.verified && eq_consistent;

    return { verified, verifier_claim };
}

template <typename Flavor_>
bool MultilinearBatchingVerifier<Flavor_>::check_eq_consistency(const SumcheckOutput<Flavor>& sumcheck_result,
                                                                const std::vector<FF>& accumulator_challenges,
                                                                const std::vector<FF>& instance_challenges)
{
    auto accumulator_eq_check = sumcheck_result.claimed_evaluations.eq_accumulator ==
                                VerifierEqPolynomial<FF>::eval(accumulator_challenges, sumcheck_result.challenge);
    auto instance_eq_check = sumcheck_result.claimed_evaluations.eq_instance ==
                             VerifierEqPolynomial<FF>::eval(instance_challenges, sumcheck_result.challenge);

    if constexpr (IsRecursiveFlavor<Flavor>) {
        const auto equality_verified = accumulator_eq_check && instance_eq_check;
        bool equality_verified_value = equality_verified.get_value();
        equality_verified.assert_equal(stdlib::bool_t(equality_verified.get_context(), true));
        return equality_verified_value;
    } else {
        return accumulator_eq_check && instance_eq_check;
    }
}

template class MultilinearBatchingVerifier<MultilinearBatchingFlavor>;
template class MultilinearBatchingVerifier<MultilinearBatchingRecursiveFlavor>;

} // namespace bb

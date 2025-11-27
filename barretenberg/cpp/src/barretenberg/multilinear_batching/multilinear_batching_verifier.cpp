// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
    for (auto [eval, challenge] : zip_view(instance_sumcheck.claimed_evaluations.get_shifted(), shifted_challenges)) {
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

template <typename Flavor_>
template <size_t N>
MultilinearBatchingVerifier<Flavor_>::Commitment MultilinearBatchingVerifier<Flavor_>::batch_mul(
    RefArray<Commitment, N> instance_commitments,
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

template <typename Flavor_>
MultilinearBatchingVerifier<Flavor_>::VerifierClaim MultilinearBatchingVerifier<Flavor_>::compute_new_claim(
    const SumcheckOutput<Flavor>& sumcheck_result,
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

template <typename Flavor_>
std::pair<bool, typename MultilinearBatchingVerifier<Flavor_>::VerifierClaim> MultilinearBatchingVerifier<
    Flavor_>::verify_proof(SumcheckOutput<InstanceFlavor>& instance_sumcheck,
                           InstanceCommitments& verifier_commitments,
                           std::vector<InstanceFF>& unshifted_challenges,
                           std::vector<InstanceFF>& shifted_challenges)
{
    // Receive commitments
    auto non_shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("non_shifted_accumulator_commitment");
    auto shifted_accumulator_commitment =
        transcript->template receive_from_prover<Commitment>("shifted_accumulator_commitment");

    // Receive challenges and evaluations
    std::vector<FF> accumulator_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> accumulator_evaluations(2);
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        accumulator_challenges[i] =
            transcript->template receive_from_prover<FF>("accumulator_challenge_" + std::to_string(i));
    }
    for (size_t i = 0; i < 2; i++) {
        accumulator_evaluations[i] =
            transcript->template receive_from_prover<FF>("accumulator_evaluation_" + std::to_string(i));
    }

    // Run sumcheck
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    FF target_sum = compute_new_target_sum(alpha,
                                           instance_sumcheck,
                                           unshifted_challenges,
                                           shifted_challenges,
                                           accumulator_evaluations[0],
                                           accumulator_evaluations[1]);

    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    const auto sumcheck_result = sumcheck.verify();

    // Construct new claim
    auto claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    VerifierClaim verifier_claim = compute_new_claim(sumcheck_result,
                                                     verifier_commitments,
                                                     unshifted_challenges,
                                                     shifted_challenges,
                                                     non_shifted_accumulator_commitment,
                                                     shifted_accumulator_commitment,
                                                     claim_batching_challenge);

    // Verify that the sumcheck claimed evaluations match the evaluations computed from the verifier for the eq
    // polynomials
    bool verified = true;
    auto equality_verified = sumcheck_result.claimed_evaluations.w_evaluations_accumulator ==
                                 VerifierEqPolynomial<FF>::eval(accumulator_challenges, sumcheck_result.challenge) &&
                             sumcheck_result.claimed_evaluations.w_evaluations_instance ==
                                 VerifierEqPolynomial<FF>::eval(instance_sumcheck.challenge, sumcheck_result.challenge);

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

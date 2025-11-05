// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/hypernova/hypernova_verifier.hpp"

namespace bb {

template <typename Flavor_>
std::pair<std::vector<typename HypernovaFoldingVerifier<Flavor_>::FF>,
          std::vector<typename HypernovaFoldingVerifier<Flavor_>::FF>>
HypernovaFoldingVerifier<Flavor_>::get_batching_challenges()
{
    std::vector<std::string> labels_unshifted_entities(NUM_UNSHIFTED_ENTITIES);
    std::vector<std::string> labels_shifted_witnesses(NUM_SHIFTED_ENTITIES);
    for (size_t idx = 0; idx < NUM_UNSHIFTED_ENTITIES; idx++) {
        labels_unshifted_entities[idx] = "unshifted_challenge_" + std::to_string(idx);
    }
    for (size_t idx = 0; idx < NUM_SHIFTED_ENTITIES; idx++) {
        labels_shifted_witnesses[idx] = "shifted_challenge_" + std::to_string(idx);
    }
    auto unshifted_challenges = transcript->template get_challenges<FF>(labels_unshifted_entities);
    auto shifted_challenges = transcript->template get_challenges<FF>(labels_shifted_witnesses);

    return { unshifted_challenges, shifted_challenges };
}

template <typename Flavor_>
template <size_t N>
HypernovaFoldingVerifier<Flavor_>::Commitment HypernovaFoldingVerifier<Flavor_>::batch_mul(
    const RefArray<Commitment, N>& _points, const std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; const auto& point : _points) {
        points[idx++] = point;
    }

    if constexpr (IsRecursiveFlavor<Flavor>) {
        return Curve::Group::batch_mul(points, scalars);
    } else {
        return batch_mul_native(points, scalars);
    }
}

template <typename Flavor>
HypernovaFoldingVerifier<Flavor>::Accumulator HypernovaFoldingVerifier<Flavor>::sumcheck_output_to_accumulator(
    HypernovaFoldingVerifier<Flavor>::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<HypernovaFoldingVerifier::VerifierInstance>& instance)
{
    BB_BENCH();

    // Generate challenges to batch shifted and unshifted polynomials/commitments/evaluation
    auto [unshifted_challenges, shifted_challenges] = get_batching_challenges();

    // Batch evaluations
    FF batched_unshifted_evaluation(0);
    FF batched_shifted_evaluation(0);

    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_unshifted(), unshifted_challenges)) {
        batched_unshifted_evaluation += eval * challenge;
    }
    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_shifted(), shifted_challenges)) {
        batched_shifted_evaluation += eval * challenge;
    }

    // Batch commitments
    VerifierCommitments verifier_commitments(instance->get_vk(), instance->witness_commitments);

    Commitment batched_unshifted_commitment = batch_mul(verifier_commitments.get_unshifted(), unshifted_challenges);
    Commitment batched_shifted_commitment = batch_mul(verifier_commitments.get_to_be_shifted(), shifted_challenges);

    return Accumulator{ .challenge = sumcheck_output.challenge,
                        .non_shifted_evaluation = batched_unshifted_evaluation,
                        .shifted_evaluation = batched_shifted_evaluation,
                        .non_shifted_commitment = batched_unshifted_commitment,
                        .shifted_commitment = batched_shifted_commitment };
};

template <typename Flavor>
SumcheckOutput<Flavor> HypernovaFoldingVerifier<Flavor>::sumcheck_on_incoming_instance(
    const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance, const Proof& proof)
{
    BB_BENCH();

    vinfo("HypernovaFoldingVerifier: verifying Oink proof...");
    // Complete the incoming verifier instance
    OinkVerifier verifier{ instance, transcript };
    transcript->load_proof(proof);
    verifier.verify();

    if constexpr (IsRecursiveFlavor<Flavor>) {
        instance->target_sum = FF::from_witness_index(instance->builder, instance->builder->zero_idx());
    } else {
        instance->target_sum = FF::zero();
    }
    instance->gate_challenges = transcript->template get_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Sumcheck verification
    vinfo("HypernovaFoldingVerifier: verifying Sumcheck to turn instance into an accumulator...");

    std::vector<FF> padding_indicator_array(Flavor::VIRTUAL_LOG_N, 1);
    SumcheckVerifier sumcheck(transcript, instance->alpha, Flavor::VIRTUAL_LOG_N, instance->target_sum);
    SumcheckOutput<Flavor> sumcheck_output =
        sumcheck.verify(instance->relation_parameters, instance->gate_challenges, padding_indicator_array);

    return sumcheck_output;
};

template <typename Flavor>
std::pair<bool, typename HypernovaFoldingVerifier<Flavor>::Accumulator> HypernovaFoldingVerifier<Flavor>::
    instance_to_accumulator(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
                            const Proof& proof)
{
    BB_BENCH();

    auto sumcheck_output = sumcheck_on_incoming_instance(instance, proof);

    auto accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance);

    if (sumcheck_output.verified) {
        vinfo("HypernovaFoldingVerifier: Successfully turned instance into accumulator.");
    } else {
        vinfo("HypernovaFoldingVerifier: Failed to recursively verify Sumcheck to turn instance into an accumulator. "
              "Ignore if generating the VKs");
    }

    return { sumcheck_output.verified, accumulator };
};

template <typename Flavor>
std::tuple<bool, bool, typename HypernovaFoldingVerifier<Flavor>::Accumulator> HypernovaFoldingVerifier<
    Flavor>::verify_folding_proof(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
                                  const HypernovaFoldingVerifier::Proof& proof)
{
    BB_BENCH();

    vinfo("HypernovaFoldingVerifier: verifying folding proof...");

    auto sumcheck_output = sumcheck_on_incoming_instance(instance, proof);

    // Generate challenges to batch shifted and unshifted polynomials/commitments/evaluation
    auto [unshifted_challenges, shifted_challenges] = get_batching_challenges();

    VerifierCommitments verifier_commitments(instance->get_vk(), instance->witness_commitments);

    MultilinearBatchingVerifier batching_verifier(transcript);
    auto [sumcheck_batching_result, new_accumulator] =
        batching_verifier.verify_proof(sumcheck_output, verifier_commitments, unshifted_challenges, shifted_challenges);

    if (sumcheck_output.verified && sumcheck_batching_result) {
        vinfo("HypernovaFoldingVerifier: successfully verified folding proof.");
    } else if (!sumcheck_output.verified) {
        vinfo("HypernovaFoldingVerifier: Failed to recursively verify Sumcheck to turn instance into an accumulator. "
              "Ignore if generating the VKs");
    } else {
        vinfo("HypernovaFoldingVerifier: Failed to recursively verify Sumcheck to batch two accumulators. Ignore if "
              "generating the VKs");
    }

    return { sumcheck_output.verified, sumcheck_batching_result, new_accumulator };
};

template class HypernovaFoldingVerifier<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class HypernovaFoldingVerifier<MegaFlavor>;
} // namespace bb

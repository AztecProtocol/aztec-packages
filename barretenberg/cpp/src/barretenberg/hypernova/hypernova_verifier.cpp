// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/hypernova/hypernova_verifier.hpp"

namespace bb {

template <typename Flavor>
HypernovaFoldingVerifier<Flavor>::Accumulator HypernovaFoldingVerifier<Flavor>::sumcheck_output_to_accumulator(
    HypernovaFoldingVerifier<Flavor>::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<HypernovaFoldingVerifier::VerifierInstance>& instance)
{
    BB_BENCH();

    // Generate challenges to batch shifted and unshifted polynomials/commitments/evaluation
    std::array<std::string, NUM_UNSHIFTED_ENTITIES> labels_unshifted_entities;
    std::array<std::string, NUM_SHIFTED_ENTITIES> labels_shifted_witnesses;
    for (size_t idx = 0; idx < NUM_UNSHIFTED_ENTITIES; idx++) {
        labels_unshifted_entities[idx] = "unshifted_challenge_" + std::to_string(idx);
    }
    for (size_t idx = 0; idx < NUM_SHIFTED_ENTITIES; idx++) {
        labels_shifted_witnesses[idx] = "shifted_challenge_" + std::to_string(idx);
    }
    auto unshifted_challenges = transcript->template get_challenges<FF>(labels_unshifted_entities);
    auto shifted_challenges = transcript->template get_challenges<FF>(labels_shifted_witnesses);

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

    Commitment batched_unshifted_commitment;
    Commitment batched_shifted_commitment;

    std::vector<Commitment> points;
    std::vector<FF> scalars;
    for (auto [commitment, scalar] : zip_view(verifier_commitments.get_unshifted(), unshifted_challenges)) {
        points.emplace_back(commitment);
        scalars.emplace_back(scalar);
    }
    batched_unshifted_commitment = batch_mul(points, scalars);

    points.clear();
    scalars.clear();
    for (auto [commitment, scalar] : zip_view(verifier_commitments.get_to_be_shifted(), shifted_challenges)) {
        points.emplace_back(commitment);
        scalars.emplace_back(scalar);
    }
    batched_shifted_commitment = batch_mul(points, scalars);

    return Accumulator{
        .challenge = sumcheck_output.challenge,
        .shifted_evaluation = batched_shifted_evaluation,
        .non_shifted_evaluation = batched_unshifted_evaluation,
        .non_shifted_commitment = batched_unshifted_commitment,
        .shifted_commitment = batched_shifted_commitment,
    };
};

template <typename Flavor>
std::pair<bool, typename HypernovaFoldingVerifier<Flavor>::Accumulator> HypernovaFoldingVerifier<Flavor>::
    instance_to_accumulator(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
                            const Proof& proof)
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
    SumcheckVerifier sumcheck(transcript, instance->alphas, Flavor::VIRTUAL_LOG_N, instance->target_sum);
    SumcheckOutput<Flavor> sumcheck_output =
        sumcheck.verify(instance->relation_parameters, instance->gate_challenges, padding_indicator_array);

    BB_ASSERT_EQ(
        sumcheck_output.verified,
        true,
        "HypernovaFoldingVerifier: Failed to recursively verify Sumcheck to turn instance into an accumulator.");

    auto accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance);

    vinfo("HypernovaFoldingVerifier: Successfully turned instance into accumulator.");

    return { sumcheck_output.verified, accumulator };
};

template <typename Flavor>
std::tuple<bool, bool, typename HypernovaFoldingVerifier<Flavor>::Accumulator> HypernovaFoldingVerifier<
    Flavor>::verify_folding_proof(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
                                  const HypernovaFoldingVerifier::Proof& proof)
{
    BB_BENCH();

    vinfo("HypernovaFoldingVerifier: verifying folding proof...");

    auto [sumcheck_result, incoming_accumulator] = instance_to_accumulator(instance, proof);

    MultilinearBatchingVerifier batching_verifier(transcript);
    auto [sumcheck_batching_result, new_accumulator] = batching_verifier.verify_proof();
    BB_ASSERT_EQ(sumcheck_batching_result,
                 true,
                 "HypernovaFoldingVerifier: Failed to recursively verify Sumcheck to batch two accumulators.");

    vinfo("HypernovaFoldingVerifier: successfully verified folding proof.");

    return { sumcheck_result, sumcheck_batching_result, new_accumulator };
};

template class HypernovaFoldingVerifier<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class HypernovaFoldingVerifier<MegaFlavor>;
} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {
HypernovaFoldingProver::Accumulator HypernovaFoldingProver::sumcheck_output_to_accumulator(
    HypernovaFoldingProver::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const std::shared_ptr<typename HypernovaFoldingProver::VerificationKey>& honk_vk)
{
    BB_BENCH();

    // Generate challenges to batch shifted and unshifted polynomials/commitments/evaluation
    std::array<std::string, Flavor::NUM_UNSHIFTED_ENTITIES> labels_unshifted_entities;
    std::array<std::string, Flavor::NUM_SHIFTED_ENTITIES> labels_shifted_witnesses;
    for (size_t idx = 0; idx < Flavor::NUM_UNSHIFTED_ENTITIES; idx++) {
        labels_unshifted_entities[idx] = "unshifted_challenge_" + std::to_string(idx);
    }
    for (size_t idx = 0; idx < Flavor::NUM_SHIFTED_ENTITIES; idx++) {
        labels_shifted_witnesses[idx] = "shifted_challenge_" + std::to_string(idx);
    }
    auto unshifted_challenges = transcript->template get_challenges<FF>(labels_unshifted_entities);
    auto shifted_challenges = transcript->template get_challenges<FF>(labels_shifted_witnesses);

    // Batch polynomials
    auto batched_unshifted_polynomial = batch_polynomials<Flavor::NUM_UNSHIFTED_ENTITIES>(
        instance->polynomials.get_unshifted(), instance->dyadic_size(), unshifted_challenges);
    auto batched_shifted_polynomial = batch_polynomials<Flavor::NUM_SHIFTED_ENTITIES>(
        instance->polynomials.get_to_be_shifted(), instance->dyadic_size(), shifted_challenges);

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
    VerifierCommitments verifier_commitments(honk_vk, instance->commitments);

    Commitment batched_unshifted_commitment;
    Commitment batched_shifted_commitment;

    std::vector<Commitment> points;
    std::vector<FF> scalars;
    for (auto [commitment, scalar] : zip_view(verifier_commitments.get_unshifted(), unshifted_challenges)) {
        points.emplace_back(commitment);
        scalars.emplace_back(scalar);
    }
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1552): Optimize batch_mul_native
    batched_unshifted_commitment = batch_mul_native(points, scalars);

    points.clear();
    scalars.clear();
    for (auto [commitment, scalar] : zip_view(verifier_commitments.get_to_be_shifted(), shifted_challenges)) {
        points.emplace_back(commitment);
        scalars.emplace_back(scalar);
    }
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1552): Optimize batch_mul_native
    batched_shifted_commitment = batch_mul_native(points, scalars);

    return Accumulator{
        .challenge = sumcheck_output.challenge,
        .shifted_evaluation = batched_shifted_evaluation,
        .non_shifted_evaluation = batched_unshifted_evaluation,
        .non_shifted_polynomial = batched_unshifted_polynomial,
        .shifted_polynomial = batched_shifted_polynomial,
        .non_shifted_commitment = batched_unshifted_commitment,
        .shifted_commitment = batched_shifted_commitment,
        .dyadic_size = instance->dyadic_size(),
    };
};

template <size_t N>
HypernovaFoldingProver::Polynomial HypernovaFoldingProver::batch_polynomials(
    RefArray<Polynomial, N> polynomials_to_batch, const size_t& full_batched_size, const std::array<FF, N>& challenges)
{
    BB_BENCH();
    BB_ASSERT_EQ(full_batched_size,
                 polynomials_to_batch[0].virtual_size(),
                 "The virtual size of the first polynomial is different from the full batched size.");

    size_t challenge_idx = 0;

    for (auto& poly : polynomials_to_batch) {
        if (challenge_idx == 0) {
            polynomials_to_batch[0] *= challenges[challenge_idx];
        } else {
            polynomials_to_batch[0].add_scaled(poly, challenges[challenge_idx]);
        }
        challenge_idx += 1;
    }

    return polynomials_to_batch[0];
};

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::instance_to_accumulator(
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance)
{
    BB_BENCH();

    vinfo("HypernovaFoldingProver: converting instance to accumulator...");

    // Complete the incoming instance
    auto honk_vk = std::make_shared<VerificationKey>(instance->get_precomputed());
    MegaOinkProver oink_prover{ instance, honk_vk, transcript };
    oink_prover.prove();

    instance->gate_challenges = transcript->template get_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Run Sumcheck with padding
    MegaSumcheckProver sumcheck(instance->dyadic_size(),
                                instance->polynomials,
                                transcript,
                                instance->alphas,
                                instance->gate_challenges,
                                instance->relation_parameters,
                                Flavor::VIRTUAL_LOG_N);
    auto sumcheck_output = sumcheck.prove();

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, honk_vk);

    vinfo("HypernovaFoldingProver: accumulator constructed.");

    return accumulator;
}

std::pair<HonkProof, HypernovaFoldingProver::Accumulator> HypernovaFoldingProver::fold(
    const Accumulator& accumulator, const std::shared_ptr<ProverInstance>& instance)
{
    Accumulator incoming_accumulator = instance_to_accumulator(instance);

    // Sumcheck
    MultilinearBatchingProver batching_prover(std::make_shared<MultilinearBatchingProverClaim>(accumulator),
                                              std::make_shared<MultilinearBatchingProverClaim>(incoming_accumulator),
                                              transcript);

    HonkProof proof = batching_prover.construct_proof();
    batching_prover.compute_new_claim();

    return { proof, batching_prover.get_new_claim() };
}
} // namespace bb

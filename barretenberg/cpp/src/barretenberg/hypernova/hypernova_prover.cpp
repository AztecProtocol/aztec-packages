// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {

template <size_t N>
HypernovaFoldingProver::Commitment HypernovaFoldingProver::batch_mul(const RefArray<Commitment, N>& _points,
                                                                     const std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; auto point : _points) {
        points[idx++] = point;
    }

    return batch_mul_native<MegaFlavor::Curve>(points, scalars);
}

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::sumcheck_output_to_accumulator(
    HypernovaFoldingProver::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const std::shared_ptr<typename HypernovaFoldingProver::VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaFoldingProver::sumcheck_output_to_accumulator");

    // Generate challenges to batch shifted and unshifted polynomials/commitments/evaluation
    auto [unshifted_challenges, shifted_challenges] =
        get_hypernova_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    // Batch polynomials
    Polynomial<FF> batched_unshifted_polynomial = batch_polynomials<Flavor::NUM_UNSHIFTED_ENTITIES>(
        instance->polynomials.get_unshifted(), instance->dyadic_size(), unshifted_challenges);
    Polynomial<FF> batched_shifted_polynomial = batch_polynomials<Flavor::NUM_SHIFTED_ENTITIES>(
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

    Commitment batched_unshifted_commitment = batch_mul(verifier_commitments.get_unshifted(), unshifted_challenges);
    Commitment batched_shifted_commitment = batch_mul(verifier_commitments.get_to_be_shifted(), shifted_challenges);

    return Accumulator{
        .challenge = std::move(sumcheck_output.challenge),
        .non_shifted_evaluation = batched_unshifted_evaluation,
        .shifted_evaluation = batched_shifted_evaluation,
        .non_shifted_polynomial = std::move(batched_unshifted_polynomial),
        .shifted_polynomial = std::move(batched_shifted_polynomial),
        .non_shifted_commitment = batched_unshifted_commitment,
        .shifted_commitment = batched_shifted_commitment,
        .dyadic_size = instance->dyadic_size(),
    };
};

template <size_t N>
Polynomial<HypernovaFoldingProver::FF> HypernovaFoldingProver::batch_polynomials(
    RefArray<Polynomial<FF>, N> polynomials_to_batch,
    const size_t& full_batched_size,
    const std::vector<FF>& challenges)
{
    BB_BENCH_NAME("HypernovaFoldingProver::batch_polynomials");
    BB_ASSERT_EQ(full_batched_size,
                 polynomials_to_batch[0].virtual_size(),
                 "The virtual size of the first polynomial is different from the full batched size.");
    BB_ASSERT_EQ(
        challenges.size(), N, "The number of challenges provided does not match the number of polynomials to batch.");

    for (size_t idx = 1; idx < N; idx++) {
        polynomials_to_batch[0].add_scaled(polynomials_to_batch[idx], challenges[idx]);
    }

    return polynomials_to_batch[0];
};

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::instance_to_accumulator(
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaFoldingProver::instance_to_accumulator");

    vinfo("HypernovaFoldingProver: converting instance to accumulator...");

    // Complete the incoming instance
    auto precomputed_vk = honk_vk ? honk_vk : std::make_shared<VerificationKey>(instance->get_precomputed());
    MegaOinkProver oink_prover{ instance, precomputed_vk, transcript };
    oink_prover.prove();

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Run Sumcheck with padding
    MegaSumcheckProver sumcheck(instance->dyadic_size(),
                                instance->polynomials,
                                transcript,
                                instance->alpha,
                                instance->gate_challenges,
                                instance->relation_parameters,
                                Flavor::VIRTUAL_LOG_N);
    auto sumcheck_output = sumcheck.prove();

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, precomputed_vk);

    vinfo("HypernovaFoldingProver: accumulator constructed.");

    return accumulator;
}

std::pair<HonkProof, HypernovaFoldingProver::Accumulator> HypernovaFoldingProver::fold(
    Accumulator&& accumulator,
    const std::shared_ptr<ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    Accumulator incoming_accumulator = instance_to_accumulator(instance, honk_vk);

    // Sumcheck
    MultilinearBatchingProver batching_prover(std::move(accumulator), std::move(incoming_accumulator), transcript);

    HonkProof proof = batching_prover.construct_proof();

    return { proof, batching_prover.compute_new_claim() };
}
} // namespace bb

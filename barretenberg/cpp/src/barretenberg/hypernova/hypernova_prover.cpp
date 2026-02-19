// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/commitment_schemes/interleaved_group_batching.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::sumcheck_output_to_accumulator(
    HypernovaFoldingProver::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const MegaOinkProver& oink_prover)
{
    BB_BENCH_NAME("HypernovaFoldingProver::sumcheck_output_to_accumulator");

    const size_t individual_poly_size = instance->dyadic_size();
    const size_t interleaved_size = individual_poly_size * BATCH_SIZE;

    // Generate interleaving challenges (same transcript labels as MultiMega verifier)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");
    auto lagrange_basis = MultiMegaFlavor::compute_lagrange_basis(u0, u1);

    // Generate batching challenges for interleaved groups (17 unshifted, 3 shifted)
    auto [unshifted_challenges, shifted_challenges] =
        get_interleaved_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    // Batch-then-interleave all polynomial groups into 2 polynomials, freeing source polys after each group
    auto unshifted_groups = Flavor::get_unshifted_groups_mut(instance->polynomials);
    auto shifted_groups = Flavor::get_to_be_shifted_groups(instance->polynomials);
    auto [batched_unshifted, batched_shifted] = batch_interleaved_polynomial_groups<FF>(
        unshifted_groups, shifted_groups, unshifted_challenges, shifted_challenges, individual_poly_size, BATCH_SIZE);

    // Batch commitments and evaluations using shared module
    std::vector<Commitment> all_unshifted_comms;
    all_unshifted_comms.reserve(NUM_UNSHIFTED_ENTITIES);
    for (const auto& c : oink_prover.honk_vk->get_all()) {
        all_unshifted_comms.push_back(c);
    }
    for (const auto& c : oink_prover.interleaved_commitments.get_all()) {
        all_unshifted_comms.push_back(c);
    }

    std::vector<Commitment> shiftable_comms;
    shiftable_comms.reserve(NUM_SHIFTED_ENTITIES);
    for (const auto& c : oink_prover.interleaved_commitments.get_shiftable()) {
        shiftable_comms.push_back(c);
    }

    auto [batched_unshifted_commitment,
          batched_shifted_commitment,
          batched_unshifted_evaluation,
          batched_shifted_evaluation] =
        batch_interleaved_verifier_claims(all_unshifted_comms,
                                          shiftable_comms,
                                          Flavor::get_unshifted_groups(sumcheck_output.claimed_evaluations),
                                          Flavor::get_shifted_groups(sumcheck_output.claimed_evaluations),
                                          unshifted_challenges,
                                          shifted_challenges,
                                          lagrange_basis);

    // --- Build full challenge vector: prepend interleaving challenges to sumcheck challenges ---
    std::vector<FF> full_challenge;
    full_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    return Accumulator{
        .challenge = std::move(full_challenge),
        .non_shifted_evaluation = batched_unshifted_evaluation,
        .shifted_evaluation = batched_shifted_evaluation,
        .non_shifted_polynomial = std::move(batched_unshifted),
        .shifted_polynomial = std::move(batched_shifted),
        .non_shifted_commitment = batched_unshifted_commitment,
        .shifted_commitment = batched_shifted_commitment,
        .dyadic_size = interleaved_size,
    };
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

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, oink_prover);

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

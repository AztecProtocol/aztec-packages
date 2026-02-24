// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/commitment_schemes/interleaved_group_batching.hpp"
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"

namespace bb {

template <typename Flavor>
HypernovaFoldingVerifier<Flavor>::Accumulator HypernovaFoldingVerifier<Flavor>::sumcheck_output_to_accumulator(
    HypernovaFoldingVerifier<Flavor>::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<HypernovaFoldingVerifier::VerifierInstance>& instance,
    const OinkVerifier& oink_verifier)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::sumcheck_output_to_accumulator");

    // Generate interleaving challenges (same transcript labels as MultiMega verifier)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");
    auto lagrange_basis = MultiMegaFlavor::compute_lagrange_basis(u0, u1);

    // Generate batching challenges for interleaved groups (17 unshifted, 3 shifted)
    auto [unshifted_challenges, shifted_challenges] =
        get_interleaved_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    // Collect commitments into vectors: VK precomputed (8) + witness interleaved (9) = 17
    std::vector<Commitment> all_unshifted_comms;
    all_unshifted_comms.reserve(NUM_UNSHIFTED_ENTITIES);
    for (const auto& c : instance->get_vk()->get_all()) {
        all_unshifted_comms.push_back(c);
    }
    for (const auto& c : oink_verifier.interleaved_comms.get_all()) {
        all_unshifted_comms.push_back(c);
    }

    std::vector<Commitment> shiftable_comms;
    shiftable_comms.reserve(NUM_SHIFTED_ENTITIES);
    for (const auto& c : oink_verifier.interleaved_comms.get_shiftable()) {
        shiftable_comms.push_back(c);
    }

    // Batch commitments and evaluations using shared module
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

    // Build full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    return Accumulator{ .challenge = std::move(full_challenge),
                        .non_shifted_evaluation = batched_unshifted_evaluation,
                        .shifted_evaluation = batched_shifted_evaluation,
                        .non_shifted_commitment = batched_unshifted_commitment,
                        .shifted_commitment = batched_shifted_commitment };
};

template <typename Flavor>
std::pair<SumcheckOutput<Flavor>, typename HypernovaFoldingVerifier<Flavor>::OinkVerifier> HypernovaFoldingVerifier<
    Flavor>::sumcheck_on_incoming_instance(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>&
                                               instance,
                                           const Proof& proof,
                                           size_t num_public_inputs)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::sumcheck_on_incoming_instance");

    vinfo("HypernovaFoldingVerifier: verifying Oink proof...");
    // Complete the incoming verifier instance
    transcript->load_proof(proof);

    OinkVerifier verifier{ instance, transcript, num_public_inputs };
    verifier.verify();

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Sumcheck verification
    vinfo("HypernovaFoldingVerifier: verifying Sumcheck to turn instance into an accumulator...");

    std::vector<FF> padding_indicator_array(Flavor::VIRTUAL_LOG_N, 1);
    SumcheckVerifier sumcheck(transcript, instance->alpha, Flavor::VIRTUAL_LOG_N);
    SumcheckOutput<Flavor> sumcheck_output =
        sumcheck.verify(instance->relation_parameters, instance->gate_challenges, padding_indicator_array);

    return { std::move(sumcheck_output), std::move(verifier) };
};

template <typename Flavor>
std::pair<bool, typename HypernovaFoldingVerifier<Flavor>::Accumulator> HypernovaFoldingVerifier<Flavor>::
    instance_to_accumulator(const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
                            const Proof& proof)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::instance_to_accumulator");

    // Derive num_public_inputs from proof size (instance-to-accum proof structure)
    const size_t num_public_inputs =
        ProofLength::HypernovaInstanceToAccum<Flavor>::derive_num_public_inputs(proof.size(), Flavor::VIRTUAL_LOG_N);

    auto [sumcheck_output, oink_verifier] = sumcheck_on_incoming_instance(instance, proof, num_public_inputs);

    auto accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, oink_verifier);

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
    BB_BENCH_NAME("HypernovaFoldingVerifier::verify_folding_proof");

    vinfo("HypernovaFoldingVerifier: verifying folding proof...");

    // Derive num_public_inputs from proof size (folding proof structure includes batching)
    const size_t num_public_inputs =
        ProofLength::HypernovaFolding<Flavor, MultilinearBatchingFlavor>::derive_num_public_inputs(
            proof.size(), Flavor::VIRTUAL_LOG_N);

    auto [sumcheck_output, oink_verifier] = sumcheck_on_incoming_instance(instance, proof, num_public_inputs);

    // Generate interleaving challenges (same as in sumcheck_output_to_accumulator)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");
    auto lagrange_basis = MultiMegaFlavor::compute_lagrange_basis(u0, u1);

    // Generate batching challenges for interleaved groups
    const auto [unshifted_challenges, shifted_challenges] =
        get_interleaved_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    // Collect commitments into vectors
    std::vector<Commitment> all_unshifted_comms;
    all_unshifted_comms.reserve(NUM_UNSHIFTED_ENTITIES);
    for (const auto& c : instance->get_vk()->get_all()) {
        all_unshifted_comms.push_back(c);
    }
    for (const auto& c : oink_verifier.interleaved_comms.get_all()) {
        all_unshifted_comms.push_back(c);
    }

    std::vector<Commitment> shiftable_comms;
    shiftable_comms.reserve(NUM_SHIFTED_ENTITIES);
    for (const auto& c : oink_verifier.interleaved_comms.get_shiftable()) {
        shiftable_comms.push_back(c);
    }

    // Batch commitments and evaluations using shared module
    auto [batched_unshifted_instance_eval, batched_shifted_instance_eval] =
        batch_interleaved_evals(Flavor::get_unshifted_groups(sumcheck_output.claimed_evaluations),
                                Flavor::get_shifted_groups(sumcheck_output.claimed_evaluations),
                                unshifted_challenges,
                                shifted_challenges,
                                lagrange_basis);

    // Build full instance challenge: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> instance_challenge;
    instance_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    instance_challenge.push_back(u0);
    instance_challenge.push_back(u1);
    instance_challenge.insert(
        instance_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    MultilinearBatchingVerifier batching_verifier(transcript);
    auto [sumcheck_batching_result, new_accumulator] = batching_verifier.verify_proof(batched_unshifted_instance_eval,
                                                                                      batched_shifted_instance_eval,
                                                                                      all_unshifted_comms,
                                                                                      shiftable_comms,
                                                                                      unshifted_challenges,
                                                                                      shifted_challenges,
                                                                                      instance_challenge);

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

template class HypernovaFoldingVerifier<MultiMegaFlavor>;
template class HypernovaFoldingVerifier<MultiMegaRecursiveFlavor_<MegaCircuitBuilder>>;
} // namespace bb

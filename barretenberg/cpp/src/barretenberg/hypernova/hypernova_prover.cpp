// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {

template <size_t N>
HypernovaFoldingProver::Commitment HypernovaFoldingProver::batch_mul(std::span<Commitment, N> _points,
                                                                     std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; idx < N; ++idx) {
        points[idx] = _points[idx];
    }
    return Commitment::batch_mul(points, scalars);
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
    VerifierCommitments verifier_commitments =
        VerifierCommitmentsConstructor<Flavor>::construct(honk_vk, instance->commitments);

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

    // Ensure the first polynomial has enough backing to accumulate all others (they may have different backing sizes
    // and/or start indices). add_scaled requires destination start_index <= source start_index.
    size_t min_start = polynomials_to_batch[0].start_index();
    size_t max_end = polynomials_to_batch[0].end_index();
    for (size_t idx = 1; idx < N; idx++) {
        min_start = std::min(min_start, polynomials_to_batch[idx].start_index());
        max_end = std::max(max_end, polynomials_to_batch[idx].end_index());
    }

    // Treat polynomials_to_batch[0] as the destination's starting state (its scalar is implicitly 1).
    // The remaining N-1 sources are fused into a single parallel_for via add_scaled_batch.
    std::vector<PolynomialSpan<const FF>> sources;
    sources.reserve(N - 1);
    for (size_t i = 1; i < N; ++i) {
        sources.emplace_back(polynomials_to_batch[i]);
    }
    auto tail_scalars = std::span<const FF>(challenges).subspan(1);

    auto sources_span = std::span<const PolynomialSpan<const FF>>(sources);
    if (min_start < polynomials_to_batch[0].start_index() || max_end > polynomials_to_batch[0].end_index()) {
        Polynomial<FF> result(max_end - min_start, full_batched_size, min_start);
        result += polynomials_to_batch[0];
        add_scaled_batch(result, sources_span, tail_scalars);
        return result;
    }

    add_scaled_batch(polynomials_to_batch[0], sources_span, tail_scalars);

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
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_oink");
    }

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Run Sumcheck with padding
    auto sumcheck_output = [&] {
        BB_BENCH_NAME("HypernovaFoldingProver::sumcheck");
        MegaSumcheckProver sumcheck(instance->dyadic_size(),
                                    instance->polynomials,
                                    transcript,
                                    instance->alpha,
                                    instance->gate_challenges,
                                    instance->relation_parameters,
                                    Flavor::VIRTUAL_LOG_N);
        return sumcheck.prove();
    }();
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_sumcheck");
    }

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, precomputed_vk);

    vinfo("HypernovaFoldingProver: accumulator constructed.");

    return accumulator;
}

std::pair<HonkProof, HypernovaFoldingProver::Accumulator> HypernovaFoldingProver::fold(
    Accumulator&& accumulator,
    const std::shared_ptr<ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaFoldingProver::fold");
    Accumulator incoming_accumulator = instance_to_accumulator(instance, honk_vk);

    // Sumcheck
    MultilinearBatchingProver batching_prover(std::move(accumulator), std::move(incoming_accumulator), transcript);

    HonkProof proof = batching_prover.construct_proof();

    return { proof, batching_prover.compute_new_claim() };
}
} // namespace bb

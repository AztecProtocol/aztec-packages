/**
 * @brief HyperNova folding prover for MegaV2Flavor.
 *
 * @details Identical implementation to hypernova_prover.cpp but using MegaV2Flavor.
 * In a future refactor, HypernovaFoldingProver should be templated on Flavor
 * to eliminate this duplication.
 */
#include "barretenberg/hypernova/hypernova_v2_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {

template <size_t N>
HypernovaV2FoldingProver::Commitment HypernovaV2FoldingProver::batch_mul(const RefArray<Commitment, N>& _points,
                                                                         const std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; idx < N; ++idx) {
        points[idx] = _points[idx];
    }
    return Commitment::batch_mul(points, scalars);
}

HypernovaV2FoldingProver::Accumulator HypernovaV2FoldingProver::sumcheck_output_to_accumulator(
    HypernovaV2FoldingProver::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<typename HypernovaV2FoldingProver::ProverInstance>& instance,
    const std::shared_ptr<typename HypernovaV2FoldingProver::VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaV2FoldingProver::sumcheck_output_to_accumulator");

    auto [unshifted_challenges, shifted_challenges] =
        get_hypernova_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    Polynomial<FF> batched_unshifted_polynomial = batch_polynomials<Flavor::NUM_UNSHIFTED_ENTITIES>(
        instance->polynomials.get_unshifted(), instance->dyadic_size(), unshifted_challenges);
    Polynomial<FF> batched_shifted_polynomial = batch_polynomials<Flavor::NUM_SHIFTED_ENTITIES>(
        instance->polynomials.get_to_be_shifted(), instance->dyadic_size(), shifted_challenges);

    FF batched_unshifted_evaluation(0);
    FF batched_shifted_evaluation(0);

    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_unshifted(), unshifted_challenges)) {
        batched_unshifted_evaluation += eval * challenge;
    }
    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_shifted(), shifted_challenges)) {
        batched_shifted_evaluation += eval * challenge;
    }

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
Polynomial<HypernovaV2FoldingProver::FF> HypernovaV2FoldingProver::batch_polynomials(
    RefArray<Polynomial<FF>, N> polynomials_to_batch,
    const size_t& full_batched_size,
    const std::vector<FF>& challenges)
{
    BB_BENCH_NAME("HypernovaV2FoldingProver::batch_polynomials");
    BB_ASSERT_EQ(full_batched_size,
                 polynomials_to_batch[0].virtual_size(),
                 "The virtual size of the first polynomial is different from the full batched size.");
    BB_ASSERT_EQ(
        challenges.size(), N, "The number of challenges provided does not match the number of polynomials to batch.");

    size_t min_start = polynomials_to_batch[0].start_index();
    size_t max_end = polynomials_to_batch[0].end_index();
    for (size_t idx = 1; idx < N; idx++) {
        min_start = std::min(min_start, polynomials_to_batch[idx].start_index());
        max_end = std::max(max_end, polynomials_to_batch[idx].end_index());
    }

    if (min_start < polynomials_to_batch[0].start_index() || max_end > polynomials_to_batch[0].end_index()) {
        Polynomial<FF> result(max_end - min_start, full_batched_size, min_start);
        result += polynomials_to_batch[0];
        for (size_t idx = 1; idx < N; idx++) {
            result.add_scaled(polynomials_to_batch[idx], challenges[idx]);
        }
        return result;
    }

    for (size_t idx = 1; idx < N; idx++) {
        polynomials_to_batch[0].add_scaled(polynomials_to_batch[idx], challenges[idx]);
    }

    return polynomials_to_batch[0];
};

HypernovaV2FoldingProver::Accumulator HypernovaV2FoldingProver::instance_to_accumulator(
    const std::shared_ptr<typename HypernovaV2FoldingProver::ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaV2FoldingProver::instance_to_accumulator");

    auto precomputed_vk = honk_vk ? honk_vk : std::make_shared<VerificationKey>(instance->get_precomputed());
    MegaOinkProver oink_prover{ instance, precomputed_vk, transcript };
    oink_prover.prove();

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    MegaSumcheckProver sumcheck(instance->dyadic_size(),
                                instance->polynomials,
                                transcript,
                                instance->alpha,
                                instance->gate_challenges,
                                instance->relation_parameters,
                                Flavor::VIRTUAL_LOG_N);
    auto sumcheck_output = sumcheck.prove();

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, precomputed_vk);

    return accumulator;
}

std::pair<HonkProof, HypernovaV2FoldingProver::Accumulator> HypernovaV2FoldingProver::fold(
    Accumulator&& accumulator,
    const std::shared_ptr<ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    Accumulator incoming_accumulator = instance_to_accumulator(instance, honk_vk);

    MultilinearBatchingProver batching_prover(std::move(accumulator), std::move(incoming_accumulator), transcript);

    HonkProof proof = batching_prover.construct_proof();

    return { proof, batching_prover.compute_new_claim() };
}
} // namespace bb

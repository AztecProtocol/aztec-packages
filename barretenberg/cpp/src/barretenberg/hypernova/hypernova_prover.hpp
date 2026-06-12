// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/verifier_commitments.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief HyperNova folding prover. Folds circuit instances into accumulators, deferring PCS verification.
 * @details See: chonk/README.md#hypernova-folding-details
 *
 * ## Accumulator Concept
 *
 * An Accumulator represents batched polynomial evaluation claims from one or more circuits.
 * Instead of verifying each circuit's PCS separately, we batch claims into an accumulator
 * and defer verification to a final "decider" proof. This enables efficient recursion.
 *
 * Each accumulator contains:
 *   - challenge: The evaluation point (from Sumcheck)
 *   - non_shifted_{polynomial,commitment,evaluation}: Batched claims for standard polynomials
 *   - shifted_{polynomial,commitment,evaluation}: Batched claims for shifted polynomials
 *
 * ## Shifted vs Unshifted Polynomials
 *
 * - **Unshifted**: Standard witness/selector polynomials evaluated at point r
 * - **Shifted**: Polynomials referencing the "next row" in relations. We enforce p(0) = 0,
 *   so p(X)/X is a polynomial. The shift is p(X)/X evaluated at r, i.e., p(r)/r.
 *   Same commitment works for both p and its shift (no separate commitment needed).
 *
 * The batching formula: batched = Σᵢ ρᵢ·pᵢ where ρᵢ are Fiat-Shamir challenges.
 *
 * @note The class is *not* templated on a single flavor — its incoming-instance methods take an
 * `InstanceFlavor` template parameter so circuits of different flavors (e.g. MegaAppFlavor for apps
 * and MegaKernelFlavor for kernels) can all be folded into the same Accumulator.
 */
class HypernovaFoldingProver {
  public:
    using FF = MegaFlavor::FF;
    using Commitment = MegaFlavor::Commitment;
    using Accumulator = MultilinearBatchingProverClaim;
    using Transcript = MegaFlavor::Transcript;

    HypernovaFoldingProver(std::shared_ptr<Transcript> transcript)
        : transcript(std::move(transcript)) {};

    /**
     * @brief Turn an instance into an accumulator by running Sumcheck.
     */
    template <typename InstanceFlavor>
    Accumulator instance_to_accumulator(
        const std::shared_ptr<ProverInstance_<InstanceFlavor>>& instance,
        const std::shared_ptr<typename InstanceFlavor::VerificationKey>& honk_vk = nullptr)
    {
        BB_BENCH_NAME("HypernovaFoldingProver::instance_to_accumulator");
        vinfo("HypernovaFoldingProver: converting instance to accumulator...");

        auto precomputed_vk =
            honk_vk ? honk_vk : std::make_shared<typename InstanceFlavor::VerificationKey>(instance->get_precomputed());
        OinkProver<InstanceFlavor> oink_prover{ instance, precomputed_vk, transcript };
        oink_prover.prove();
        if (detail::use_memory_profile) {
            detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_oink");
        }

        instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
            "HypernovaFoldingProver:gate_challenge", InstanceFlavor::VIRTUAL_LOG_N);

        auto sumcheck_output = [&] {
            BB_BENCH_NAME("HypernovaFoldingProver::sumcheck");
            SumcheckProver<InstanceFlavor> sumcheck(instance->dyadic_size(),
                                                    instance->polynomials,
                                                    transcript,
                                                    instance->alpha,
                                                    instance->gate_challenges,
                                                    instance->relation_parameters,
                                                    InstanceFlavor::VIRTUAL_LOG_N);
            return sumcheck.prove();
        }();
        if (detail::use_memory_profile) {
            detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_sumcheck");
        }

        Accumulator accumulator =
            sumcheck_output_to_accumulator<InstanceFlavor>(sumcheck_output, instance, precomputed_vk);
        vinfo("HypernovaFoldingProver: accumulator constructed.");
        return accumulator;
    }

    /**
     * @brief Fold an instance into an accumulator.
     */
    template <typename InstanceFlavor>
    std::pair<HonkProof, Accumulator> fold(
        Accumulator&& accumulator,
        const std::shared_ptr<ProverInstance_<InstanceFlavor>>& instance,
        const std::shared_ptr<typename InstanceFlavor::VerificationKey>& honk_vk = nullptr)
    {
        BB_BENCH_NAME("HypernovaFoldingProver::fold");
        Accumulator incoming_accumulator = instance_to_accumulator<InstanceFlavor>(instance, honk_vk);

        std::vector<Accumulator> claims;
        claims.emplace_back(std::move(accumulator));
        claims.emplace_back(std::move(incoming_accumulator));
        MultilinearBatchingProver batching_prover(std::move(claims), transcript);

        HonkProof proof = batching_prover.construct_proof();
        return { proof, batching_prover.compute_new_claim() };
    }

    /**
     * @brief Export the proof contained in the transcript
     */
    HonkProof export_proof() { return transcript->export_proof(); };

  private:
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Convert the output of the sumcheck run on the incoming instance into an accumulator.
     */
    template <typename InstanceFlavor>
    Accumulator sumcheck_output_to_accumulator(SumcheckOutput<InstanceFlavor>& sumcheck_output,
                                               const std::shared_ptr<ProverInstance_<InstanceFlavor>>& instance,
                                               const std::shared_ptr<typename InstanceFlavor::VerificationKey>& honk_vk)
    {
        BB_BENCH_NAME("HypernovaFoldingProver::sumcheck_output_to_accumulator");

        auto [unshifted_challenges, shifted_challenges] = get_hypernova_batching_challenges<FF>(
            transcript, InstanceFlavor::NUM_UNSHIFTED_ENTITIES, InstanceFlavor::NUM_SHIFTED_ENTITIES);

        Polynomial<FF> batched_unshifted_polynomial = batch_polynomials<InstanceFlavor::NUM_UNSHIFTED_ENTITIES>(
            instance->polynomials.get_unshifted(), instance->dyadic_size(), unshifted_challenges);
        Polynomial<FF> batched_shifted_polynomial = batch_polynomials<InstanceFlavor::NUM_SHIFTED_ENTITIES>(
            instance->polynomials.get_to_be_shifted(), instance->dyadic_size(), shifted_challenges);

        FF batched_unshifted_evaluation(0);
        FF batched_shifted_evaluation(0);
        for (auto [eval, challenge] :
             zip_view(sumcheck_output.claimed_evaluations.get_unshifted(), unshifted_challenges)) {
            batched_unshifted_evaluation += eval * challenge;
        }
        for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_shifted(), shifted_challenges)) {
            batched_shifted_evaluation += eval * challenge;
        }

        typename VerifierCommitmentsConstructor<InstanceFlavor>::Commitments verifier_commitments =
            VerifierCommitmentsConstructor<InstanceFlavor>::construct(honk_vk, instance->commitments);

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
    }

    /**
     * @brief Batch prover polynomials. Batching happens in place into the first polynomial in the RefArray supplied.
     */
    template <size_t N>
    static Polynomial<FF> batch_polynomials(RefArray<Polynomial<FF>, N> polynomials_to_batch,
                                            const size_t& full_batched_size,
                                            const std::vector<FF>& challenges)
    {
        BB_BENCH_NAME("HypernovaFoldingProver::batch_polynomials");
        BB_ASSERT_EQ(full_batched_size,
                     polynomials_to_batch[0].virtual_size(),
                     "The virtual size of the first polynomial is different from the full batched size.");
        BB_ASSERT_EQ(challenges.size(),
                     N,
                     "The number of challenges provided does not match the number of polynomials to batch.");

        size_t min_start = polynomials_to_batch[0].start_index();
        size_t max_end = polynomials_to_batch[0].end_index();
        for (size_t idx = 1; idx < N; idx++) {
            min_start = std::min(min_start, polynomials_to_batch[idx].start_index());
            max_end = std::max(max_end, polynomials_to_batch[idx].end_index());
        }

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
    }

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N> static Commitment batch_mul(std::span<Commitment, N> _points, std::vector<FF>& scalars)
    {
        std::vector<Commitment> points(N);
        for (size_t idx = 0; idx < N; ++idx) {
            points[idx] = _points[idx];
        }
        return Commitment::batch_mul(points, scalars);
    }
};

} // namespace bb

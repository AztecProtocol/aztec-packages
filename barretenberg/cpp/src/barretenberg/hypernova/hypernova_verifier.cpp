// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/flavor/verifier_commitments.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <bool IsRecursive_>
template <size_t N>
HypernovaFoldingVerifier<IsRecursive_>::Commitment HypernovaFoldingVerifier<IsRecursive_>::batch_mul(
    std::span<Commitment, N> _points, std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; idx < N; ++idx) {
        points[idx] = _points[idx];
    }
    return Commitment::batch_mul(points, scalars);
}

template <bool IsRecursive_>
template <typename InstanceFlavor>
bool HypernovaFoldingVerifier<IsRecursive_>::accumulate_instance(
    const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance, const Proof& proof)
{
    static_assert(IsRecursiveFlavor<InstanceFlavor> == IsRecursive,
                  "InstanceFlavor recursive-ness must match the verifier's recursive-ness");
    BB_BENCH_NAME("HypernovaFoldingVerifier::accumulate_instance");

    const size_t num_public_inputs = ProofLength::HypernovaInstanceToAccum<InstanceFlavor>::derive_num_public_inputs(
        proof.size(), InstanceFlavor::VIRTUAL_LOG_N);

    auto sumcheck_output = sumcheck_on_incoming_instance<InstanceFlavor>(instance, proof, num_public_inputs);
    cached_claims.emplace_back(sumcheck_output_to_accumulator<InstanceFlavor>(sumcheck_output, instance));

    if (sumcheck_output.verified) {
        vinfo("HypernovaFoldingVerifier: turned instance into accumulator.");
    } else {
        vinfo("HypernovaFoldingVerifier: instance-to-accumulator sumcheck failed. Ignore if generating VKs");
    }
    return sumcheck_output.verified;
}

template <bool IsRecursive_>
template <typename InstanceFlavor>
SumcheckOutput<InstanceFlavor> HypernovaFoldingVerifier<IsRecursive_>::sumcheck_on_incoming_instance(
    const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance, const Proof& proof, size_t num_public_inputs)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::sumcheck_on_incoming_instance");
    transcript->load_proof(proof);

    OinkVerifier<InstanceFlavor> verifier{ instance, transcript, num_public_inputs };
    verifier.verify();

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", InstanceFlavor::VIRTUAL_LOG_N);

    SumcheckVerifier<InstanceFlavor> sumcheck(transcript, instance->alpha, InstanceFlavor::VIRTUAL_LOG_N);
    return sumcheck.verify(instance->relation_parameters, instance->gate_challenges);
}

template <bool IsRecursive_>
template <typename InstanceFlavor>
HypernovaFoldingVerifier<IsRecursive_>::Accumulator HypernovaFoldingVerifier<
    IsRecursive_>::sumcheck_output_to_accumulator(SumcheckOutput<InstanceFlavor>& sumcheck_output,
                                                  const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::sumcheck_output_to_accumulator");

    auto [unshifted_challenges, shifted_challenges] = get_hypernova_batching_challenges<FF>(
        transcript, InstanceFlavor::NUM_UNSHIFTED_ENTITIES, InstanceFlavor::NUM_SHIFTED_ENTITIES);

    FF batched_unshifted_evaluation(0);
    FF batched_shifted_evaluation(0);
    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_unshifted(), unshifted_challenges)) {
        batched_unshifted_evaluation += eval * challenge;
    }
    for (auto [eval, challenge] : zip_view(sumcheck_output.claimed_evaluations.get_shifted(), shifted_challenges)) {
        batched_shifted_evaluation += eval * challenge;
    }

    typename VerifierCommitmentsConstructor<InstanceFlavor>::Commitments verifier_commitments =
        VerifierCommitmentsConstructor<InstanceFlavor>::construct(instance->get_vk(), instance->witness_commitments);

    Commitment batched_unshifted_commitment = batch_mul(verifier_commitments.get_unshifted(), unshifted_challenges);
    Commitment batched_shifted_commitment = batch_mul(verifier_commitments.get_to_be_shifted(), shifted_challenges);

    return Accumulator{ .challenge = sumcheck_output.challenge,
                        .non_shifted_evaluation = batched_unshifted_evaluation,
                        .shifted_evaluation = batched_shifted_evaluation,
                        .non_shifted_commitment = batched_unshifted_commitment,
                        .shifted_commitment = batched_shifted_commitment };
}

template <bool IsRecursive_>
std::pair<bool, typename HypernovaFoldingVerifier<IsRecursive_>::Accumulator> HypernovaFoldingVerifier<
    IsRecursive_>::finalize(const Proof& batching_proof, std::optional<Accumulator> previous_accumulator)
{
    BB_BENCH_NAME("HypernovaFoldingVerifier::finalize");

    std::vector<Accumulator> claims;
    claims.reserve((previous_accumulator.has_value() ? 1 : 0) + cached_claims.size());
    if (previous_accumulator.has_value()) {
        claims.emplace_back(std::move(*previous_accumulator));
    }
    for (auto& claim : cached_claims) {
        claims.emplace_back(std::move(claim));
    }
    cached_claims.clear();
    BB_ASSERT(!claims.empty(), "HypernovaFoldingVerifier::finalize: nothing to fold");

    if (claims.size() == 1) {
        // No batching: the single claim is already the accumulator.
        return { true, std::move(claims[0]) };
    }
    transcript->load_proof(batching_proof);
    BatchingVerifier batching_verifier(transcript);
    return batching_verifier.verify_proof(claims);
}

template class HypernovaFoldingVerifier<false>;
template class HypernovaFoldingVerifier<true>;

template bool HypernovaFoldingVerifier<false>::accumulate_instance<MegaKernelFlavor>(
    const std::shared_ptr<VerifierInstance_<MegaKernelFlavor>>&, const HonkProof&);
template bool HypernovaFoldingVerifier<false>::accumulate_instance<MegaAppFlavor>(
    const std::shared_ptr<VerifierInstance_<MegaAppFlavor>>&, const HonkProof&);
template bool HypernovaFoldingVerifier<true>::accumulate_instance<MegaKernelRecursiveFlavor>(
    const std::shared_ptr<VerifierInstance_<MegaKernelRecursiveFlavor>>&, const stdlib::Proof<MegaCircuitBuilder>&);
template bool HypernovaFoldingVerifier<true>::accumulate_instance<MegaAppRecursiveFlavor>(
    const std::shared_ptr<VerifierInstance_<MegaAppRecursiveFlavor>>&, const stdlib::Proof<MegaCircuitBuilder>&);

} // namespace bb

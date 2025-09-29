// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(Builder* builder,
                                                         const std::shared_ptr<VKAndHash>& vk_and_hash,
                                                         const std::shared_ptr<Transcript>& transcript)
    : verifier_instance(std::make_shared<RecursiveVerifierInstance>(builder, vk_and_hash))
    , builder(builder)
    , transcript(transcript)
{}

/**
 * @brief This function constructs a recursive verifier circuit for a native Ultra Honk proof of a given flavor.
 *
 * @tparam IO Public input type, specifies which public inputs should be extracted from the proof
 * @return Output aggregation object
 */
template <typename Flavor>
template <class IO>
UltraRecursiveVerifier_<Flavor>::Output UltraRecursiveVerifier_<Flavor>::verify_proof(
    const stdlib::Proof<Builder>& proof)
{
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ::bb::ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    const size_t num_public_inputs =
        static_cast<uint32_t>(verifier_instance->vk_and_hash->vk->num_public_inputs.get_value());
    BB_ASSERT_EQ(proof.size(), Flavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + num_public_inputs);

    StdlibProof ipa_proof;
    StdlibProof honk_proof;
    if constexpr (HasIPAAccumulator<Flavor>) {
        const size_t HONK_PROOF_LENGTH = Flavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() - IPA_PROOF_LENGTH;
        // The extra calculation is for the IPA proof length.
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1182): Handle in ProofSurgeon.
        BB_ASSERT_EQ(proof.size(), HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs);
        // split out the ipa proof
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        ipa_proof = StdlibProof(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
        honk_proof = StdlibProof(proof.begin(), proof.begin() + honk_proof_with_pub_inputs_length);
    } else {
        honk_proof = proof;
    }
    transcript->load_proof(honk_proof);
    OinkVerifier oink_verifier{ builder, verifier_instance, transcript };
    oink_verifier.verify();
    const std::vector<FF>& public_inputs = verifier_instance->public_inputs;

    VerifierCommitments commitments{ verifier_instance->vk_and_hash->vk, verifier_instance->witness_commitments };
    static constexpr size_t VIRTUAL_LOG_N = Flavor::NativeFlavor::VIRTUAL_LOG_N;
    // Get the gate challenges for sumcheck computation
    verifier_instance->gate_challenges =
        transcript->template get_powers_of_challenge<FF>("Sumcheck:gate_challenge", VIRTUAL_LOG_N);

    // Execute Sumcheck Verifier and extract multivariate opening point u = (u_0, ..., u_{d-1}) and purported
    // multivariate evaluations at u

    std::vector<FF> padding_indicator_array(VIRTUAL_LOG_N, 1);
    if constexpr (Flavor::HasZK) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1521): ZK Recursive verifiers need to evaluate
        // RowDisablingPolynomial, which requires knowing the actual `log_circuit_size`. Can be fixed by reserving the
        // first rows of the trace for masking.
        padding_indicator_array =
            compute_padding_indicator_array<Curve, VIRTUAL_LOG_N>(verifier_instance->vk_and_hash->vk->log_circuit_size);
    }

    Sumcheck sumcheck(transcript, verifier_instance->alphas, VIRTUAL_LOG_N);

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

    // For MegaZKFlavor: the sumcheck output contains claimed evaluations of the Libra polynomials
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }
    // Execute Shplemini to produce a batch opening claim subsequently verified by a univariate PCS
    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };
    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               Commitment::one(builder),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    // Reconstruct the public inputs
    IO inputs;
    inputs.reconstruct_from_public(public_inputs);

    // Construct output
    Output output(inputs);
    output.ipa_proof = ipa_proof; // Add IPA proof

    // Aggregate new pairing point with the ones reconstructed from the public inputs
    output.points_accumulator.aggregate(pairing_points);

    return output;
}

template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;

// UltraRecursiveFlavor_ specializations
template UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<DefaultIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

template UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>::
    verify_proof<DefaultIO<MegaCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>::StdlibProof& proof);

// UltraZKRecursiveFlavor_ specializations
template UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<DefaultIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

template UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>::
    verify_proof<DefaultIO<MegaCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>::StdlibProof& proof);

// UltraRollupRecursiveFlavor_ specialization
template UltraRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<RollupIO>(
        const UltraRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

// MegaRecursiveFlavor_ specialization with DefaultIO
template UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<DefaultIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

template UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>::
    verify_proof<DefaultIO<MegaCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>::StdlibProof& proof);

// MegaZKRecursiveFlavor_ specialization with DefaultIO
template UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<DefaultIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

template UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>::
    verify_proof<DefaultIO<MegaCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>::StdlibProof& proof);

// ClientIVC specialization
template UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<HidingKernelIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

// GoblinAvm specialization
template UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::Output UltraRecursiveVerifier_<
    bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::
    verify_proof<GoblinAvmIO<UltraCircuitBuilder>>(
        const UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>::StdlibProof& proof);

} // namespace bb::stdlib::recursion::honk

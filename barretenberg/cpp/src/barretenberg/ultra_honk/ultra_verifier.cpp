// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief This function verifies an Ultra Honk proof for a given Flavor.
 *
 * @tparam IO Public input type, specifies which public inputs should be extracted from the proof
 */
template <typename Flavor>
template <class IO>
UltraVerifier_<Flavor>::UltraVerifierOutput UltraVerifier_<Flavor>::verify_proof(
    const typename UltraVerifier_<Flavor>::Proof& proof, const typename UltraVerifier_<Flavor>::Proof& ipa_proof)
{
    using FF = typename Flavor::FF;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    transcript->load_proof(proof);
    OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript };
    oink_verifier.verify();

    // Determine the number of rounds in the sumcheck based on whether or not padding is employed
    const size_t log_circuit_size = static_cast<size_t>(verifier_instance->vk->log_circuit_size);
    const size_t log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : log_circuit_size;
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Get the witness commitments that the verifier needs to verify
    VerifierCommitments commitments{ verifier_instance->vk, verifier_instance->witness_commitments };
    // For ZK flavors: set gemini_masking_poly commitment from accumulator
    if constexpr (Flavor::HasZK) {
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;
    }

    // Construct the padding indicator array
    std::vector<FF> padding_indicator_array(log_n, 1);
    if constexpr (Flavor::HasZK) {
        for (size_t idx = 0; idx < log_n; idx++) {
            padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
        }
    }

    // Construct the sumcheck verifier
    SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);
    // Receive commitments to Libra masking polynomials for ZKFlavors
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    // Run the sumcheck verifier
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);
    // Get the claimed evaluation of the Libra polynomials for ZKFlavors
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               Commitment::one(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);
    // Reconstruct the public inputs
    IO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate new pairing points with those reconstructed from the public inputs
    pairing_points.aggregate(inputs.pairing_inputs);

    // Construct the output
    UltraVerifierOutput output;

    // Check that verification passed
    bool pairing_check_verified = pairing_points.check();
    vinfo("sumcheck_verified: ", sumcheck_output.verified);
    vinfo("libra_evals_verified: ", consistency_checked);
    vinfo("pairing_check_verified: ", pairing_check_verified);

    // Set the output result to be all checks passing
    output.result = sumcheck_output.verified && consistency_checked && pairing_check_verified;

    if constexpr (HasIPAAccumulator<Flavor>) {
        // Reconstruct the nested IPA claim from the public inputs and run the native IPA verifier.
        ipa_transcript->load_proof(ipa_proof);
        bool ipa_result = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, inputs.ipa_claim, ipa_transcript);

        // Logging
        if (!ipa_result) {
            info("IPA verification failed!");
        }

        // Update output
        output.result &= ipa_result;
    } else if constexpr (std::is_same_v<IO, HidingKernelIO>) {
        // Add kernel return data and ecc op tables if we are verifying a Chonk proof
        output.kernel_return_data = inputs.kernel_return_data;
        output.ecc_op_tables = inputs.ecc_op_tables;
    }

    return output;
}

template class UltraVerifier_<UltraFlavor>;
template class UltraVerifier_<UltraZKFlavor>;
template class UltraVerifier_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class UltraVerifier_<UltraStarknetFlavor>;
template class UltraVerifier_<UltraStarknetZKFlavor>;
#endif
template class UltraVerifier_<UltraKeccakZKFlavor>;
template class UltraVerifier_<UltraRollupFlavor>;
template class UltraVerifier_<MegaFlavor>;
template class UltraVerifier_<MegaZKFlavor>;

template UltraVerifier_<UltraFlavor>::UltraVerifierOutput UltraVerifier_<UltraFlavor>::verify_proof<DefaultIO>(
    const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<UltraZKFlavor>::UltraVerifierOutput UltraVerifier_<UltraZKFlavor>::verify_proof<DefaultIO>(
    const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<UltraKeccakFlavor>::UltraVerifierOutput UltraVerifier_<UltraKeccakFlavor>::verify_proof<
    DefaultIO>(const Proof& proof, const Proof& ipa_proof);

#ifdef STARKNET_GARAGA_FLAVORS
template UltraVerifier_<UltraStarknetFlavor>::UltraVerifierOutput UltraVerifier_<UltraStarknetFlavor>::verify_proof<
    DefaultIO>(const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<UltraStarknetZKFlavor>::UltraVerifierOutput UltraVerifier_<UltraStarknetZKFlavor>::verify_proof<
    DefaultIO>(const Proof& proof, const Proof& ipa_proof);
#endif

template UltraVerifier_<UltraKeccakZKFlavor>::UltraVerifierOutput UltraVerifier_<UltraKeccakZKFlavor>::verify_proof<
    DefaultIO>(const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<UltraRollupFlavor>::UltraVerifierOutput UltraVerifier_<UltraRollupFlavor>::verify_proof<
    RollupIO>(const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<MegaFlavor>::UltraVerifierOutput UltraVerifier_<MegaFlavor>::verify_proof<DefaultIO>(
    const Proof& proof, const Proof& ipa_proof);

template UltraVerifier_<MegaZKFlavor>::UltraVerifierOutput UltraVerifier_<MegaZKFlavor>::verify_proof<DefaultIO>(
    const Proof& proof, const Proof& ipa_proof);

// Chonk specialization
template UltraVerifier_<MegaZKFlavor>::UltraVerifierOutput UltraVerifier_<MegaZKFlavor>::verify_proof<HidingKernelIO>(
    const Proof& proof, const Proof& ipa_proof);

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
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

    transcript->load_proof(proof);
    OinkVerifier<Flavor> oink_verifier{ verification_key, transcript };
    oink_verifier.verify();

    // Determine the number of rounds in the sumcheck based on whether or not padding is employed
    const uint64_t log_n = Flavor::USE_PADDING ? CONST_PROOF_SIZE_LOG_N : verification_key->vk->log_circuit_size;

    for (size_t idx = 0; idx < log_n; idx++) {
        verification_key->gate_challenges.emplace_back(
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx)));
    }

    DeciderVerifier decider_verifier{ verification_key, transcript };
    auto decider_output = decider_verifier.verify();

    // Reconstruct the public inputs
    IO inputs;
    inputs.reconstruct_from_public(verification_key->public_inputs);

    // Aggregate new pairing points with those reconstructed from the public inputs
    decider_output.pairing_points.aggregate(inputs.pairing_inputs);

    // Construrct the output
    UltraVerifierOutput output;
    output.result = decider_output.check();

    // Logging
    if (!decider_output.sumcheck_verified) {
        info("Sumcheck failed!");
    }

    if (!decider_output.libra_evals_verified) {
        info("Libra evals failed!");
    }

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
        // Add ecc op tables if we are verifying a ClientIVC proof
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

// ClientIVC specialization
template UltraVerifier_<MegaZKFlavor>::UltraVerifierOutput UltraVerifier_<MegaZKFlavor>::verify_proof<HidingKernelIO>(
    const Proof& proof, const Proof& ipa_proof);

} // namespace bb

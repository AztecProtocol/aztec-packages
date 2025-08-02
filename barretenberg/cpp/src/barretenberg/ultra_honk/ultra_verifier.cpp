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
 * @brief This function performs the decider verification of an Ultra Honk proof for a given Flavor.
 *
 */
template <typename Flavor>
std::pair<typename UltraVerifier_<Flavor>::PublicInputs, typename UltraVerifier_<Flavor>::DeciderVerifier::Output>
UltraVerifier_<Flavor>::verify_internal(const HonkProof& proof)
{
    using FF = typename Flavor::FF;

    transcript->load_proof(proof);
    OinkVerifier<Flavor> oink_verifier{ verification_key, transcript };
    oink_verifier.verify();
    const PublicInputs& public_inputs = oink_verifier.public_inputs;

    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        verification_key->gate_challenges.emplace_back(
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx)));
    }

    DeciderVerifier decider_verifier{ verification_key, transcript };

    return std::make_pair(public_inputs, decider_verifier.verify());
}

/**
 * @brief This function verifies an Ultra Honk proof for a given UltraHonk Flavor.
 *
 */
template <typename Flavor>
bool UltraVerifier_<Flavor>::verify_proof(const HonkProof& proof, const HonkProof& ipa_proof)
    requires IsUltraHonk<Flavor>
{
    using RollUpIO = bb::RollupIO;
    using DefaultIO = bb::DefaultIO;

    auto [public_inputs, decider_output] = verify_internal(proof);
    if (!decider_output.sumcheck_verified) {
        info("Sumcheck failed!");
        return false;
    }
    if (!decider_output.libra_evals_verified) {
        info("Libra evals failed!");
        return false;
    }

    // Reconstruct the nested IPA claim from the public inputs and run the native IPA verifier.
    if constexpr (HasIPAAccumulator<Flavor>) {
        RollUpIO inputs;
        inputs.reconstruct_from_public(public_inputs);

        // verify the ipa_proof with this claim
        ipa_transcript->load_proof(ipa_proof);
        bool ipa_result = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, inputs.ipa_claim, ipa_transcript);
        if (!ipa_result) {
            return false;
        }

        decider_output.pairing_points.aggregate(inputs.pairing_inputs);
    } else {
        DefaultIO inputs;
        inputs.reconstruct_from_public(public_inputs);

        decider_output.pairing_points.aggregate(inputs.pairing_inputs);
    }

    return decider_output.check();
}

/**
 * @brief This function verifies an Ultra Honk proof for a Mega Flavor.
 *
 * @details This function returns a boolean whose meaning is whether the decider proof is valid or not, and an array of
 * commitments, corresponding to the commitments to the merged table that is the output of the merge verification
 * performed in the Hiding kernel.
 *
 */
template <typename Flavor>
std::pair<bool, std::array<typename UltraVerifier_<Flavor>::Commitment, Flavor::NUM_WIRES>> UltraVerifier_<
    Flavor>::verify_proof(const HonkProof& proof)
    requires IsMegaFlavor<Flavor> && (!HasIPAAccumulator<Flavor>)
{
    auto [public_inputs, decider_output] = verify_internal(proof);

    // Reconstruct the public inputs
    HidingKernelIO inputs;
    inputs.reconstruct_from_public(public_inputs);

    decider_output.pairing_points.aggregate(inputs.pairing_inputs);

    return std::make_pair(decider_output.check(), inputs.ecc_op_tables);
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

} // namespace bb

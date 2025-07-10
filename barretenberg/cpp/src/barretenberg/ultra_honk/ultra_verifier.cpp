// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief This function verifies an Ultra Honk proof for a given Flavor.
 *
 */
template <typename Flavor> bool UltraVerifier_<Flavor>::verify_proof(const HonkProof& proof, const HonkProof& ipa_proof)
{
    using FF = typename Flavor::FF;

    transcript->load_proof(proof);
    OinkVerifier<Flavor> oink_verifier{ verification_key, transcript };
    oink_verifier.verify();

    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        verification_key->gate_challenges.emplace_back(
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx)));
    }

    // Reconstruct the nested IPA claim from the public inputs and run the native IPA verifier.
    if constexpr (HasIPAAccumulator<Flavor>) {
        // Extract the public inputs containing the IPA claim and reconstruct
        const uint32_t start_idx = static_cast<uint32_t>(verification_key->vk->num_public_inputs) - IPA_CLAIM_SIZE;
        std::span<const FF, IPA_CLAIM_SIZE> ipa_claim_limbs{ verification_key->public_inputs.data() + start_idx,
                                                             IPA_CLAIM_SIZE };

        auto ipa_claim = OpeningClaim<curve::Grumpkin>::reconstruct_from_public(ipa_claim_limbs);

        // verify the ipa_proof with this claim
        ipa_transcript->load_proof(ipa_proof);
        bool ipa_result = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, ipa_claim, ipa_transcript);
        if (!ipa_result) {
            return false;
        }
    }

    DeciderVerifier decider_verifier{ verification_key, transcript };
    auto decider_output = decider_verifier.verify();
    if (!decider_output.sumcheck_verified) {
        info("Sumcheck failed!");
        return false;
    }
    if (!decider_output.libra_evals_verified) {
        info("Libra evals failed!");
        return false;
    }

    // Extract nested pairing points from the proof
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1094): Handle pairing points in keccak flavors.
    if constexpr (!std::is_same_v<Flavor, UltraKeccakFlavor> && !std::is_same_v<Flavor, UltraKeccakZKFlavor>) {
        uint32_t start_idx = static_cast<uint32_t>(verification_key->vk->num_public_inputs) - PAIRING_POINTS_SIZE;
        if constexpr (HasIPAAccumulator<Flavor>) {
            start_idx -= IPA_CLAIM_SIZE;
        }
        std::span<FF, PAIRING_POINTS_SIZE> pairing_points_limbs{ verification_key->public_inputs.data() + start_idx,
                                                                 PAIRING_POINTS_SIZE };
        PairingPoints nested_pairing_points = PairingPoints::reconstruct_from_public(pairing_points_limbs);
        decider_output.pairing_points.aggregate(nested_pairing_points);
    }

    return decider_output.check();
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

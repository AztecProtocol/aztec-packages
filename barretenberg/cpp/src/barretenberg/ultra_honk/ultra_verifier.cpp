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
    transcript->enable_manifest(); // Enable manifest for the verifier.
    OinkVerifier<Flavor> oink_verifier{ verification_key, transcript };
    oink_verifier.verify();

    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        verification_key->gate_challenges.emplace_back(
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx)));
    }

    const auto recover_fq_from_public_inputs = [](std::array<FF, 4> limbs) {
        const uint256_t limb = uint256_t(limbs[0]) +
                               (uint256_t(limbs[1]) << stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION) +
                               (uint256_t(limbs[2]) << (stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 2)) +
                               (uint256_t(limbs[3]) << (stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 3));
        return fq(limb);
    };

    // Parse out the nested IPA claim using key->ipa_claim_public_input_key and runs the native IPA verifier.
    if constexpr (HasIPAAccumulator<Flavor>) {

        constexpr size_t NUM_LIMBS = 4;
        OpeningClaim<curve::Grumpkin> ipa_claim;

        // Extract the public inputs containing the IPA claim
        std::array<FF, IPA_CLAIM_SIZE> ipa_claim_limbs;
        const uint32_t start_idx = verification_key->verification_key->ipa_claim_public_input_key.start_idx;
        for (size_t k = 0; k < IPA_CLAIM_SIZE; k++) {
            ipa_claim_limbs[k] = verification_key->public_inputs[start_idx + k];
        }

        std::array<FF, NUM_LIMBS> challenge_bigfield_limbs;
        std::array<FF, NUM_LIMBS> evaluation_bigfield_limbs;
        for (size_t k = 0; k < NUM_LIMBS; k++) {
            challenge_bigfield_limbs[k] = ipa_claim_limbs[k];
        }
        for (size_t k = 0; k < NUM_LIMBS; k++) {
            evaluation_bigfield_limbs[k] = ipa_claim_limbs[NUM_LIMBS + k];
        }
        ipa_claim.opening_pair.challenge = recover_fq_from_public_inputs(challenge_bigfield_limbs);
        ipa_claim.opening_pair.evaluation = recover_fq_from_public_inputs(evaluation_bigfield_limbs);
        ipa_claim.commitment = { ipa_claim_limbs[8], ipa_claim_limbs[9] };

        // verify the ipa_proof with this claim
        ipa_transcript = std::make_shared<Transcript>(ipa_proof);
        ipa_transcript->enable_manifest(); // Enable manifest for the verifier.
        bool ipa_result = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, ipa_claim, ipa_transcript);
        if (!ipa_result) {
            return false;
        }
    }

    DeciderVerifier decider_verifier{ verification_key, transcript };
    auto decider_output = decider_verifier.verify();

    // Extract nested pairing points from the proof
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1094): Handle pairing points in keccak flavors.
    if constexpr (!std::is_same_v<Flavor, UltraKeccakFlavor> && !std::is_same_v<Flavor, UltraKeccakZKFlavor>) {
        const size_t limb_offset = verification_key->verification_key->pairing_inputs_public_input_key.start_idx;
        BB_ASSERT_GTE(verification_key->public_inputs.size(),
                      limb_offset + PAIRING_POINTS_SIZE,
                      "Not enough public inputs to extract pairing points");
        std::span<FF, PAIRING_POINTS_SIZE> pairing_points_limbs{ verification_key->public_inputs.data() + limb_offset,
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

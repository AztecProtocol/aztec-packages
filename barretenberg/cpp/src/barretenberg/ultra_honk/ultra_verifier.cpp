#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
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

    transcript = std::make_shared<Transcript>(proof);
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

    // Parse out the nested IPA claim using key->ipa_claim_public_input_indices and runs the native IPA verifier.
    if constexpr (HasIPAAccumulator<Flavor>) {
        if (verification_key->verification_key->contains_ipa_claim) {

            constexpr size_t NUM_LIMBS = 4;
            OpeningClaim<curve::Grumpkin> ipa_claim;

            std::array<FF, NUM_LIMBS> challenge_bigfield_limbs;
            std::array<FF, NUM_LIMBS> evaluation_bigfield_limbs;
            for (size_t k = 0; k < NUM_LIMBS; k++) {
                challenge_bigfield_limbs[k] =
                    verification_key
                        ->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[k]];
            }
            for (size_t k = 0; k < NUM_LIMBS; k++) {
                evaluation_bigfield_limbs[k] =
                    verification_key->public_inputs[verification_key->verification_key
                                                        ->ipa_claim_public_input_indices[NUM_LIMBS + k]];
            }
            ipa_claim.opening_pair.challenge = recover_fq_from_public_inputs(challenge_bigfield_limbs);
            ipa_claim.opening_pair.evaluation = recover_fq_from_public_inputs(evaluation_bigfield_limbs);
            ipa_claim.commitment = {
                verification_key->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[8]],
                verification_key->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[9]]
            };

            // verify the ipa_proof with this claim
            auto ipa_transcript = std::make_shared<Transcript>(ipa_proof);
            bool ipa_result = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, ipa_claim, ipa_transcript);
            if (!ipa_result) {
                return false;
            }
        }
    }

    DeciderVerifier decider_verifier{ verification_key, transcript };

    return decider_verifier.verify();
}

template class UltraVerifier_<UltraFlavor>;
template class UltraVerifier_<UltraZKFlavor>;
template class UltraVerifier_<UltraKeccakFlavor>;
template class UltraVerifier_<UltraStarknetFlavor>;
template class UltraVerifier_<UltraKeccakZKFlavor>;
template class UltraVerifier_<UltraRollupFlavor>;
template class UltraVerifier_<MegaFlavor>;
template class UltraVerifier_<MegaZKFlavor>;

} // namespace bb

#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"

namespace bb {

/**
 * @brief External verifier for the split Chonk protocol.
 *
 * @details Verifies the split verification by checking:
 *   1. Polynomial equivalence: both circuits operated on the same shared witness
 *   2. Pairing points from Chonk_G are correct (aggregated for deferred KZG verification)
 *   3. IPA claim from ECCVM is correct (for deferred IPA verification)
 *
 * Output matches ChonkVerifier::ReductionResult:
 *   - Aggregated PairingPoints (Merge + Translator)
 *   - IPAClaim (from ECCVM)
 *   - IPAProof
 *   - all_checks_passed
 */
class SplitChonkVerifier {
  public:
    /**
     * @brief Result matching ChonkVerifier::ReductionResult format.
     */
    struct Result {
        PairingPoints<curve::BN254> pairing_points; // Aggregated Merge + Translator
        OpeningClaim<curve::Grumpkin> ipa_claim;
        HonkProof ipa_proof;
        bool all_checks_passed = false;
    };

    /**
     * @brief Verify the split Chonk at the native level.
     */
    static Result verify_native(const PairingPoints<curve::BN254>& merge_pp,
                                 const PairingPoints<curve::BN254>& translator_pp,
                                 const OpeningClaim<curve::Grumpkin>& ipa_claim,
                                 const HonkProof& ipa_proof,
                                 bb::fr h_b,
                                 bb::fq h_g,
                                 bb::fq alpha_b,
                                 bb::fq alpha_g,
                                 bb::fq r_b,
                                 bb::fq r_g)
    {
        Result result;

        // Step 1: Derive alpha from h_b and h_g
        bb::fq alpha_derived = derive_alpha(h_b, h_g);

        // Step 2: Check alpha matches both circuits
        bool alpha_matches_b = (alpha_b == alpha_derived);
        bool alpha_matches_g = (alpha_g == alpha_derived);

        // Step 3: Check r_b == r_g
        bool eval_matches = (r_b == r_g);

        bool poly_equiv_ok = alpha_matches_b && alpha_matches_g && eval_matches;
        if (!poly_equiv_ok) {
            vinfo("SplitChonkVerifier: polynomial equivalence FAILED");
            return result;
        }

        // Step 4: Aggregate pairing points (Merge + Translator)
        auto aggregated = merge_pp;
        aggregated.aggregate(translator_pp);

        // Step 5: Verify pairing check
        bool pairing_ok = aggregated.check();
        if (!pairing_ok) {
            vinfo("SplitChonkVerifier: pairing check FAILED");
            return result;
        }

        // Step 6: Verify IPA
        auto ipa_transcript = std::make_shared<ECCVMFlavor::Transcript>(ipa_proof);
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, ipa_claim, ipa_transcript);
        if (!ipa_verified) {
            vinfo("SplitChonkVerifier: IPA verification FAILED");
            return result;
        }

        result.pairing_points = std::move(aggregated);
        result.ipa_claim = ipa_claim;
        result.ipa_proof = ipa_proof;
        result.all_checks_passed = true;

        return result;
    }

    /**
     * @brief Derive the polynomial equivalence alpha challenge.
     */
    static bb::fq derive_alpha(bb::fr h_b, bb::fq h_g)
    {
        bb::fr h_g_as_fr = bb::fr(uint256_t(h_g));
        bb::fr alpha_fr =
            crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ h_b, h_g_as_fr });
        return bb::fq(uint256_t(alpha_fr));
    }
};

} // namespace bb

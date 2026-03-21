#include "goblin_v2_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"

namespace bb {

/**
 * @brief Reduce all GoblinV2 proofs to pairing checks + IPA opening claim.
 *
 * @details Orchestrates 5 sub-verifiers in sequence:
 *   1. ECC Merge → merged ecc table commitments [M_ecc_1..4]
 *   2. ECCVM → translation evaluations, accumulated_result, IPA claim
 *   3. Translator → uses [M_ecc_1..4] as op queue wire commitments
 *   4. Poseidon2 Merge → merged poseidon2 table commitments [M_p2_1..5]
 *   5. Poseidon2 Final → uses [M_p2_1..5] as wire + state commitments
 *
 * The key consistency check: the merged commitments from each merge protocol
 * are substituted into the respective verifiers (Translator for ECC,
 * Poseidon2FinalVerifier for Poseidon2), binding the accumulated op data to
 * the verification proofs.
 */
template <typename Curve>
typename GoblinV2Verifier_<Curve>::ReductionResult
GoblinV2Verifier_<Curve>::reduce_to_pairing_check_and_ipa_opening()
{
    ReductionResult result;
    bool all_checks = true;

    // --- Step 1: ECC Merge verification ---
    EccMergeVerifier ecc_merge_verifier{ ecc_merge_settings, transcript };
    auto ecc_merge_result = ecc_merge_verifier.reduce_to_pairing_check(proof.merge_proof, ecc_merge_commitments);
    result.merge_pairing_points = ecc_merge_result.pairing_points;
    all_checks &= ecc_merge_result.reduction_succeeded;

    // --- Step 2: ECCVM verification ---
    ECCVMVerifier eccvm_verifier(transcript, proof.eccvm_proof);
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    auto translator_input = eccvm_verifier.get_translator_input_data();
    all_checks &= eccvm_result.reduction_succeeded;

    result.ipa_claim = eccvm_result.ipa_claim;
    result.ipa_proof = proof.ipa_proof;

    // --- Step 3: Translator verification (uses ECC merged commitments) ---
    TranslatorVerifier translator_verifier{
        transcript,
        proof.translator_proof,
        translator_input.evaluation_challenge_x,
        translator_input.batching_challenge_v,
        translator_input.accumulated_result,
        ecc_merge_result.merged_commitments // ECC op wire commitments from merge
    };
    auto translator_result = translator_verifier.reduce_to_pairing_check();
    result.translator_pairing_points = translator_result.pairing_points;
    all_checks &= translator_result.reduction_succeeded;

    // --- Step 4: Poseidon2 Merge verification ---
    Poseidon2Merge poseidon2_merge_verifier{ poseidon2_merge_settings, transcript };
    auto poseidon2_merge_result =
        poseidon2_merge_verifier.reduce_to_pairing_check(proof.poseidon2_merge_proof, poseidon2_merge_commitments);
    result.poseidon2_merge_pairing_points = poseidon2_merge_result.pairing_points;
    all_checks &= poseidon2_merge_result.reduction_succeeded;

    // --- Step 5: Poseidon2 Final verification (uses Poseidon2 merged commitments) ---
    Poseidon2Final poseidon2_final_verifier;
    auto poseidon2_final_result = poseidon2_final_verifier.reduce_to_pairing_check(
        proof.poseidon2_final_proof,
        poseidon2_merge_result.merged_commitments // Poseidon2 op wire commitments from merge
    );
    result.poseidon2_final_pairing_points = poseidon2_final_result.pairing_points;
    all_checks &= poseidon2_final_result.reduction_succeeded;

    result.all_checks_passed = all_checks;
    return result;
}

// Explicit template instantiation (native only for now)
template class GoblinV2Verifier_<curve::BN254>;

} // namespace bb

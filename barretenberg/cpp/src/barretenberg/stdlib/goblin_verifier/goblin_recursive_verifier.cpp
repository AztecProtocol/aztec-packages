// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Runs the Goblin recursive verifier consisting of ECCVM, Translator and Merge verifiers.
 *
 */
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(const GoblinProof& proof)
{
    // Verify the final merge step
    MergeVerifier merge_verifier{ builder, transcript };
    StdlibProof<Builder> stdlib_merge_proof = bb::convert_native_proof_to_stdlib(builder, proof.merge_proof);
    PairingPoints<Builder> merge_pairing_points = merge_verifier.verify_proof(stdlib_merge_proof);

    // Run the ECCVM recursive verifier
    ECCVMVerifier eccvm_verifier{ builder, verification_keys.eccvm_verification_key, transcript };
    auto [opening_claim, ipa_transcript] = eccvm_verifier.verify_proof(proof.eccvm_proof);

    // Run the Translator recursive verifier
    TranslatorVerifier translator_verifier{ builder, verification_keys.translator_verification_key, transcript };
    PairingPoints<Builder> translator_pairing_points = translator_verifier.verify_proof(
        proof.translator_proof, eccvm_verifier.evaluation_challenge_x, eccvm_verifier.batching_challenge_v);

    // Verify the consistency between the ECCVM and Translator transcript polynomial evaluations
    translator_verifier.verify_translation(eccvm_verifier.translation_evaluations,
                                           eccvm_verifier.translation_masking_term_eval);

    translator_pairing_points.aggregate(merge_pairing_points);

    // Verify the consistency between the commitments to polynomials representing the op queue received by translator
    // and final merge verifier
    translator_verifier.verify_consistency_with_final_merge(merge_verifier.T_commitments);

    return { translator_pairing_points, opening_claim, ipa_transcript };
}
} // namespace bb::stdlib::recursion::honk

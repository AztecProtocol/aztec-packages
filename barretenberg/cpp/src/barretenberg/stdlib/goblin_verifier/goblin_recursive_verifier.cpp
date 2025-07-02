// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Creates a circuit that executes the ECCVM, Translator and Merge verifiers.
 *
 * @param proof Native Goblin proof
 * @param t_commitments The commitments to the subtable for the merge being verified
 *
 */
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(
    const GoblinProof& proof, const RefArray<typename MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments)
{
    StdlibProof stdlib_proof(*builder, proof);
    return verify(stdlib_proof, t_commitments);
}

/**
 * @brief Creates a circuit that executes the ECCVM, Translator and Merge verifiers.
 *
 * @param proof Stdlib Goblin proof
 * @param t_commitments The commitments to the subtable for the merge being verified
 *
 */
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(
    const StdlibProof& proof, const RefArray<typename MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments)
{
    // Verify the final merge step
    MergeVerifier merge_verifier{ builder, transcript };
    PairingPoints<Builder> merge_pairing_points = merge_verifier.verify_proof(proof.merge_proof, t_commitments);

    // Run the ECCVM recursive verifier
    ECCVMVerifier eccvm_verifier{ builder, verification_keys.eccvm_verification_key, transcript };
    auto [opening_claim, ipa_proof] = eccvm_verifier.verify_proof(proof.eccvm_proof);

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

    return { translator_pairing_points, opening_claim, ipa_proof };
}
} // namespace bb::stdlib::recursion::honk

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
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(const GoblinProof& proof,
                                                              const MergeCommitments& merge_commitments,
                                                              const MergeSettings merge_settings)
{
    GoblinStdlibProof stdlib_proof(*builder, proof);
    return verify(stdlib_proof, merge_commitments, merge_settings);
}

/**
 * @brief Creates a circuit that executes the ECCVM, Translator and Merge verifiers.
 *
 * @param proof Stdlib Goblin proof
 * @param t_commitments The commitments to the subtable for the merge being verified
 *
 */
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(const GoblinStdlibProof& proof,
                                                              const MergeCommitments& merge_commitments,
                                                              const MergeSettings merge_settings)
{
    // Verify the final merge step
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto [merge_pairing_points, merged_table_commitments, degree_check_verified, concatenation_check_passed] =
        merge_verifier.verify_proof(proof.merge_proof, merge_commitments);
    vinfo("Merge Verifier: degree check identity passed", degree_check_verified);
    vinfo("Merge Verifier: concatenation identity passed", concatenation_check_passed);
    // Run the ECCVM recursive verifier
    ECCVMVerifier_<ECCVMRecursiveFlavor> eccvm_verifier{ builder,
                                                         verification_keys.eccvm_verification_key,
                                                         transcript };
    auto opening_claim = eccvm_verifier.verify_proof(proof.eccvm_proof);

    // Run the Translator recursive verifier
    // Get translation data from ECCVM verifier
    TranslatorVerifier translator_verifier{ builder, verification_keys.translator_verification_key, transcript };
    auto translator_input = eccvm_verifier.get_translator_input_data();
    // Pass merge commitments as op queue wire commitments (they represent the same data)
    PairingPoints<bn254<Builder>> translator_pairing_points =
        translator_verifier.verify_proof(proof.translator_proof,
                                         translator_input.evaluation_challenge_x,
                                         translator_input.batching_challenge_v,
                                         translator_input.accumulated_result,
                                         merged_table_commitments);

    translator_pairing_points.aggregate(merge_pairing_points);

    return { translator_pairing_points, opening_claim, proof.ipa_proof };
}
} // namespace bb::stdlib::recursion::honk

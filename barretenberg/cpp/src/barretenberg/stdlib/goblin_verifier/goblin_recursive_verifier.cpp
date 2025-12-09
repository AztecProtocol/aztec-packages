// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Creates a circuit that executes the Merge, ECCVM, and Translator verifiers.
 *
 * @param proof Stdlib Goblin proof (circuit witness elements)
 * @param merge_commitments Commitments for Merge verification (t_commitments and T_prev_commitments)
 * @param merge_settings How the ecc op subtable was merged (PREPEND or APPEND)
 * @return GoblinRecursiveVerifierOutput containing pairing points, IPA claim, and IPA proof
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
    ECCVMRecursiveVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto opening_claim = eccvm_verifier.verify_proof();

    // Run the Translator recursive verifier
    // Get translation data from ECCVM verifier
    TranslatorVerifier translator_verifier{ builder, verification_keys.translator_verification_key, transcript };
    auto translator_input = eccvm_verifier.get_translator_input_data();
    // Pass merge commitments as op queue wire commitments (they represent the same data)
    auto translator_result = translator_verifier.verify_proof(proof.translator_proof,
                                                              translator_input.evaluation_challenge_x,
                                                              translator_input.batching_challenge_v,
                                                              translator_input.accumulated_result,
                                                              merged_table_commitments);

    translator_result.pairing_points.aggregate(merge_pairing_points);

    return { translator_result.pairing_points, opening_claim, proof.ipa_proof };
}
} // namespace bb::stdlib::recursion::honk

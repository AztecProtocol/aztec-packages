// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin_verifier.hpp"
#include "barretenberg/common/log.hpp"

namespace bb {

/**
 * @brief Verify a full Goblin proof (Merge, ECCVM, Translator)
 * @details Runs all three sub-verifiers and returns the verification artifacts.
 * The caller is responsible for checking the results (e.g., pairing point checks, IPA verification).
 */
template <typename Curve> typename GoblinVerifier_<Curve>::VerificationResult GoblinVerifier_<Curve>::verify()
{
    // Verify the merge proof
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto [merge_pairing_points, merged_table_commitments, degree_check_verified, concatenation_check_passed] =
        merge_verifier.verify_proof(proof.merge_proof, merge_commitments);

    vinfo("Merge Verifier: degree check identity passed: ", degree_check_verified);
    vinfo("Merge Verifier: concatenation identity passed: ", concatenation_check_passed);

    // Verify the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto opening_claim = eccvm_verifier.verify_proof();

    vinfo("ECCVM sumcheck verified: ", eccvm_verifier.sumcheck_verified);
    vinfo("ECCVM consistency checked: ", eccvm_verifier.consistency_checked);
    vinfo("ECCVM translation masking consistency checked: ", eccvm_verifier.translation_masking_consistency_checked);

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Verify the Translator proof
    // Pass merged_table_commitments as op queue wire commitments (they represent the same data)
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            merged_table_commitments };
    auto translator_result = translator_verifier.verify_proof();

    vinfo("Translator sumcheck verified: ", translator_result.sumcheck_verified);
    vinfo("Translator consistency checked: ", translator_result.consistency_checked);

    // Aggregate merge pairing points into translator pairing points
    translator_result.pairing_points.aggregate(merge_pairing_points);

    // Return verification artifacts (pairing points, IPA claim, IPA proof)
    return { translator_result.pairing_points, opening_claim, proof.ipa_proof };
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

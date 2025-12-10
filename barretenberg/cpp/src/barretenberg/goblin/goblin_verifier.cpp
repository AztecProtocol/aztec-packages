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
 * @details Runs all three sub-verifiers and returns the verification artifacts with all consistency check results.
 */
template <typename Curve> typename GoblinVerifier_<Curve>::VerificationResult GoblinVerifier_<Curve>::verify()
{
    // Verify the merge proof
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto merge_result = merge_verifier.verify_proof(proof.merge_proof, merge_commitments);

    vinfo("Merge Verifier: degree check identity passed: ", merge_result.degree_check_passed);
    vinfo("Merge Verifier: concatenation identity passed: ", merge_result.concatenation_check_passed);

    bool merge_pairing_check_passed = true;
    if constexpr (!IsRecursive) {
        merge_pairing_check_passed = merge_result.pairing_points.check();
        vinfo("  Merge Pairing check: ", merge_pairing_check_passed);
        vinfo("  Merge verified: ",
              merge_pairing_check_passed && merge_result.degree_check_passed &&
                  merge_result.concatenation_check_passed);
    }

    // Verify the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto opening_claim = eccvm_verifier.verify_proof();

    vinfo(" ECCVM Verifier: Sumcheck verified:           ", eccvm_verifier.sumcheck_verified);
    vinfo(" ECCVM Verifier: Libra Consistency checked:         ", eccvm_verifier.consistency_checked);
    vinfo(" ECCVM Verifier: Translation masking consistency checked: ",
          eccvm_verifier.translation_masking_consistency_checked);

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Verify the Translator proof
    // Pass merged_table_commitments as op queue wire commitments (they represent the same data)
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            merge_result.merged_commitments };
    auto translator_result = translator_verifier.verify_proof();

    vinfo(" Translator Verifier: Sumcheck verified: ", translator_result.sumcheck_verified);
    vinfo(" Translator Verifier: Libra Consistency checked: ", translator_result.consistency_checked);

    bool translator_pairing_check_passed = true;
    if constexpr (!IsRecursive) {
        translator_pairing_check_passed = translator_result.pairing_points.check();
        vinfo("  Translator Pairing check:               ", translator_pairing_check_passed);
        vinfo("  Translator verified:         ",
              translator_pairing_check_passed && translator_result.sumcheck_verified &&
                  translator_result.consistency_checked);
    }

    // Aggregate merge pairing points into translator pairing points
    translator_result.pairing_points.aggregate(merge_result.pairing_points);

    // Compute aggregate verification result
    auto all_checks_passed = [&]() {
        bool consistency_checks = merge_result.degree_check_passed && merge_result.concatenation_check_passed &&
                                  eccvm_verifier.sumcheck_verified && eccvm_verifier.consistency_checked &&
                                  eccvm_verifier.translation_masking_consistency_checked &&
                                  translator_result.sumcheck_verified && translator_result.consistency_checked;
        if constexpr (!IsRecursive) {
            // Native case: include pairing checks performed internally
            consistency_checks = consistency_checks && merge_pairing_check_passed && translator_pairing_check_passed;
        }
        return consistency_checks;
    };

    const bool aggregate_result = all_checks_passed();

    // Build and return verification result
    VerificationResult result{ .pairing_points = std::move(translator_result.pairing_points),
                               .ipa_claim = std::move(opening_claim),
                               .ipa_proof = proof.ipa_proof,
                               .all_checks_passed = aggregate_result };

    return result;
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

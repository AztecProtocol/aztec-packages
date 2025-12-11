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
    // Step 1: Verify the merge proof
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto merge_result = merge_verifier.verify_proof(proof.merge_proof, merge_commitments);

    vinfo("Merge Verifier: degree check identity passed: ", merge_result.degree_check_passed);
    vinfo("Merge Verifier: concatenation identity passed: ", merge_result.concatenation_check_passed);

#ifndef NDEBUG
    // Debug mode: perform individual pairing check for early error detection
    if constexpr (!IsRecursive) {
        bool merge_pairing_check_passed = merge_result.pairing_points.check();
        vinfo("  Merge Pairing check (debug): ", merge_pairing_check_passed);
        vinfo("  Merge verified (debug): ",
              merge_pairing_check_passed && merge_result.degree_check_passed &&
                  merge_result.concatenation_check_passed);
    }
#endif

    // Step 2: the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto opening_claim = eccvm_verifier.verify_proof();

    vinfo(" ECCVM Verifier: Sumcheck verified:           ", eccvm_verifier.sumcheck_verified);
    vinfo(" ECCVM Verifier: Libra Consistency checked:         ", eccvm_verifier.consistency_checked);
    vinfo(" ECCVM Verifier: Translation masking consistency checked: ",
          eccvm_verifier.translation_masking_consistency_checked);

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 3: Verify the Translator proof and establish the consistency between Goblin components
    // - Pass   `merged_table_commitments` as op queue wire commitments to bind Translator and Merge to the same
    // op_queue
    // - `accumulated_result` and corresponding challenges are used by the translator relation ensuring that the batched
    // bigfield evaluation computed non-natively matches the native result verified by ECCVM.
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            merge_result.merged_commitments };
    auto translator_result = translator_verifier.verify_proof();

    vinfo(" Translator Verifier: Sumcheck verified: ", translator_result.sumcheck_verified);
    vinfo(" Translator Verifier: Libra Consistency checked: ", translator_result.consistency_checked);

#ifndef NDEBUG
    // Debug mode: perform individual pairing check for early error detection
    if constexpr (!IsRecursive) {
        bool translator_pairing_check_passed = translator_result.pairing_points.check();
        vinfo("  Translator Pairing check (debug):               ", translator_pairing_check_passed);
        vinfo("  Translator verified (debug):         ",
              translator_pairing_check_passed && translator_result.sumcheck_verified &&
                  translator_result.consistency_checked);
    }
#endif

    // Aggregate merge pairing points into translator pairing points
    translator_result.pairing_points.aggregate(merge_result.pairing_points);

    // Aggregate verification result
    // Note: Individual pairing checks are now performed only in debug mode for early error detection.
    // Production verification relies on the aggregated pairing check in the caller (chonk_verifier).
    auto all_checks_passed = [&]() {
        return merge_result.degree_check_passed && merge_result.concatenation_check_passed &&
               eccvm_verifier.sumcheck_verified && eccvm_verifier.consistency_checked &&
               eccvm_verifier.translation_masking_consistency_checked && translator_result.sumcheck_verified &&
               translator_result.consistency_checked;
    };

    // Warning: `all_checks_passed` excludes pairing verification. Full native verification requires:
    // - Aggregated pairing check (performed in caller)
    // - IPA verification (performed in caller)
    // In-circuit, the boolean flags are designed for debugging only.
    VerificationResult result{ .pairing_points = std::move(translator_result.pairing_points),
                               .ipa_claim = std::move(opening_claim),
                               .ipa_proof = proof.ipa_proof,
                               .all_checks_passed = all_checks_passed() };

    return result;
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

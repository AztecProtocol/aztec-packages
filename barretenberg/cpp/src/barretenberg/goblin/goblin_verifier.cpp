// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin_verifier.hpp"
#include "barretenberg/common/log.hpp"

namespace bb {

/**
 * @brief Reduce Goblin proof to pairing check and IPA opening claim
 * @details Processes Merge, ECCVM, and Translator sub-proofs sequentially. In native mode, performs immediate
 * pairing checks for early rejections and returns the default ReductionResult on failure.
 */
template <typename Curve>
typename GoblinVerifier_<Curve>::ReductionResult GoblinVerifier_<Curve>::reduce_to_pairing_check_and_ipa_opening()
{
    // Step 1: Verify the merge proof
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(proof.merge_proof, merge_commitments);
    vinfo("Goblin: Merge reduced to pairing check successfully: ", merge_result.reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!merge_result.reduction_succeeded) {
            info("Goblin verification failed at Merge step");
            return ReductionResult();
        }
        if (!merge_result.pairing_points.check()) {
            info("Goblin verification failed at Merge pairing check");
            return ReductionResult();
        }
    }

    // Step 2: Verify the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("Goblin: ECCVM reduced to IPA opening successfully: ", eccvm_result.reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!eccvm_result.reduction_succeeded) {
            info("Goblin verification failed at ECCVM step");
            return ReductionResult();
        }
    }

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 3: Verify the Translator proof
    // - Pass `merged_table_commitments` as op queue wire commitments to bind Translator and Merge to the same op_queue
    // - `accumulated_result` and corresponding challenges ensure non-native computation matches ECCVM's native result
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            merge_result.merged_commitments };
    auto translator_result = translator_verifier.reduce_to_pairing_check();
    vinfo("Goblin: Translator reduced to pairing check successfully: ",
          translator_result.reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!translator_result.reduction_succeeded) {
            info("Goblin verification failed at Translator step");
            return ReductionResult();
        }

        if (!translator_result.pairing_points.check()) {
            info("Goblin verification failed at Translator pairing check");
            return ReductionResult();
        }
    }

    // Aggregate pairing points for final verification
    translator_result.pairing_points.aggregate(merge_result.pairing_points);

    // Combine all check results
    // Recursive: must evaluate all booleans (circuit structure must be fixed)
    // Native: redundant check (already returned early on failure), but kept for consistency
    bool all_checks_passed =
        merge_result.reduction_succeeded && eccvm_result.reduction_succeeded && translator_result.reduction_succeeded;

    // Warning: `all_checks_passed` always excludes IPA verification (deferred in both modes).
    // Native mode: pairing checks already performed above (fail-fast), included in all_checks_passed
    // Recursive mode: pairing checks deferred, excluded from all_checks_passed (for in-circuit batching)
    // In recursive mode, boolean flags are for circuit structure only (not actual verification).
    ReductionResult result{ .pairing_points = std::move(translator_result.pairing_points),
                            .ipa_claim = std::move(eccvm_result.ipa_claim),
                            .ipa_proof = proof.ipa_proof,
                            .all_checks_passed = all_checks_passed };

    return result;
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

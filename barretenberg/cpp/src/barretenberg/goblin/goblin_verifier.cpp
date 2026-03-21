// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "goblin_verifier.hpp"
#include "barretenberg/common/bb_bench.hpp"
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
    BB_BENCH_NAME("GoblinVerifier::reduce");
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

    // Combine all check results
    // Recursive: must evaluate all booleans (circuit structure must be fixed)
    // Native: redundant check (already returned early on failure), but kept for consistency
    bool all_checks_passed =
        merge_result.reduction_succeeded && eccvm_result.reduction_succeeded && translator_result.reduction_succeeded;

    // Warning: `all_checks_passed` always excludes IPA verification (deferred in both modes).
    // Native mode: pairing checks already performed above (fail-fast), included in all_checks_passed
    // Recursive mode: pairing checks deferred, excluded from all_checks_passed (for in-circuit batching)
    // In recursive mode, boolean flags are for circuit structure only (not actual verification).
    // Note: Pairing points are NOT aggregated here - caller should use aggregate_multiple for efficiency
    ReductionResult result{ .merge_pairing_points = std::move(merge_result.pairing_points),
                            .translator_pairing_points = std::move(translator_result.pairing_points),
                            .ipa_claim = std::move(eccvm_result.ipa_claim),
                            .ipa_proof = proof.ipa_proof,
                            .all_checks_passed = all_checks_passed };

    return result;
}

/**
 * @brief Reduce Goblin proof with field-only Merge/Translator + full ECCVM.
 * @details For the split Chonk_B circuit: Merge and Translator return BatchOpeningClaims
 * (no MSMs performed). ECCVM runs full verification for shared transcript continuity.
 */
template <typename Curve>
typename GoblinVerifier_<Curve>::FieldReductionResult
GoblinVerifier_<Curve>::reduce_to_field_claims_and_ipa_opening()
{
    // Step 1: Merge field verification (no MSM — returns BatchOpeningClaim)
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto merge_field_result = merge_verifier.compute_field_verification(proof.merge_proof, merge_commitments);
    vinfo("Goblin (field): Merge field verification: ", merge_field_result.verified ? "true" : "false");

    // Advance transcript past the KZG EC verification data (normally consumed by reduce_to_pairing_check).
    // This maintains transcript position consistency for the ECCVM verifier that follows.
    using MergeCommitment = typename MergeVerifier::Commitment;
    auto merge_W = transcript->template receive_from_prover<MergeCommitment>("KZG:W");

    if constexpr (!IsRecursive) {
        if (!merge_field_result.verified) {
            info("Goblin field verification failed at Merge step");
            return FieldReductionResult();
        }
    }

    // Step 2: Run ECCVM natively to advance the shared transcript.
    // This maintains Fiat-Shamir state for the Translator that follows.
    // Note: For the native verifier, running full ECCVM is cheap (no circuit constraints).
    // For the future recursive Chonk_B circuit, this will be replaced with transcript-only replay
    // using advance_transcript_only() once the label sequence is validated.
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    [[maybe_unused]] auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    auto translator_input = eccvm_verifier.get_translator_input_data();
    vinfo("Goblin (field): ECCVM transcript advanced (full native verification)");

    // Step 3: Translator field verification (no MSM — returns BatchOpeningClaim)
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            merge_field_result.merged_commitments };
    auto translator_field_result = translator_verifier.compute_field_verification();
    vinfo("Goblin (field): Translator field verification: ", translator_field_result.verified ? "true" : "false");

    // Advance transcript past the Translator KZG EC verification data
    using TranslatorCommitment = typename TranslatorVerifier::Commitment;
    auto translator_W = transcript->template receive_from_prover<TranslatorCommitment>("KZG:W");

    if constexpr (!IsRecursive) {
        if (!translator_field_result.verified) {
            info("Goblin field verification failed at Translator step");
            return FieldReductionResult();
        }
    }

    // ECCVM verification is checked separately via ECCVMFieldCircuit + ECCVMECCircuit
    bool all_checks_passed = merge_field_result.verified && translator_field_result.verified;

    return FieldReductionResult{
        .merge_field_result = std::move(merge_field_result),
        .merge_W = merge_W,
        .translator_field_result = std::move(translator_field_result),
        .translator_W = translator_W,
        .ipa_proof = proof.ipa_proof,
        .all_checks_passed = all_checks_passed,
    };
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

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
 * @brief Reduce Goblin proof to pairing check and deferred batch opening claim.
 * @details Processes Merge, ECCVM, and Translator sub-proofs sequentially. The ECCVM's final Shplonk MSM
 * is deferred (returned as a BatchOpeningClaim). Pairing checks are also deferred for batch aggregation.
 */
template <typename Curve>
typename GoblinVerifier_<Curve>::BatchReductionResult GoblinVerifier_<
    Curve>::reduce_to_pairing_check_and_batch_opening_claim()
{
    BB_BENCH_NAME("GoblinVerifier::reduce");
    // Step 1: Verify the merge proof
    MergeVerifier merge_verifier{ merge_settings, transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(proof.merge_proof, merge_commitments);
    vinfo("Goblin: Merge reduced to pairing check successfully: ", merge_result.reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!merge_result.reduction_succeeded) {
            info("Goblin verification failed at Merge step");
            return BatchReductionResult();
        }
        // Pairing check deferred for batch aggregation
    }

    // Step 2: Verify the ECCVM proof (deferred Shplonk MSM)
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_batch_opening_claim();
    vinfo("Goblin: ECCVM reduced to batch opening claim: ", eccvm_result.reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!eccvm_result.reduction_succeeded) {
            info("Goblin verification failed at ECCVM step");
            return BatchReductionResult();
        }
    }

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 3: Verify the Translator proof
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
            return BatchReductionResult();
        }
        // Pairing check deferred for batch aggregation
    }

    bool all_checks_passed =
        merge_result.reduction_succeeded && eccvm_result.reduction_succeeded && translator_result.reduction_succeeded;

    return BatchReductionResult{ .merge_pairing_points = std::move(merge_result.pairing_points),
                                 .translator_pairing_points = std::move(translator_result.pairing_points),
                                 .deferred_ipa_claim = std::move(eccvm_result.deferred_ipa_claim),
                                 .ipa_proof = proof.ipa_proof,
                                 .all_checks_passed = all_checks_passed };
}

/**
 * @brief Reduce Goblin proof to pairing check and IPA opening claim.
 * @details Delegates to reduce_to_pairing_check_and_batch_opening_claim(), then finalizes
 * the deferred ECCVM Shplonk MSM to produce a standard OpeningClaim.
 */
template <typename Curve>
typename GoblinVerifier_<Curve>::ReductionResult GoblinVerifier_<Curve>::reduce_to_pairing_check_and_ipa_opening()
{
    auto batch_result = reduce_to_pairing_check_and_batch_opening_claim();
    if (!batch_result.all_checks_passed) {
        return ReductionResult();
    }

    return ReductionResult{ .merge_pairing_points = std::move(batch_result.merge_pairing_points),
                            .translator_pairing_points = std::move(batch_result.translator_pairing_points),
                            .ipa_claim = batch_result.deferred_ipa_claim.finalize(),
                            .ipa_proof = std::move(batch_result.ipa_proof),
                            .all_checks_passed = true };
}

// Explicit instantiations
template class GoblinVerifier_<curve::BN254>;
template class GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb

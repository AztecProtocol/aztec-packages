// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "goblin_without_merge_verifier.hpp"
#include "barretenberg/common/log.hpp"

namespace bb {

/**
 * @brief Reduce GoblinWithoutMerge proof to pairing check and IPA opening claim
 * @details Processes ECCVM and Translator sub-proofs sequentially.
 */
GoblinWithoutMergeRecursiveVerifier::ReductionResult GoblinWithoutMergeRecursiveVerifier::
    reduce_to_pairing_check_and_ipa_opening()
{
    // Step 1: Verify the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("Goblin: ECCVM reduced to IPA opening successfully: ", eccvm_result.reduction_succeeded ? "true" : "false");

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 2: Verify the Translator proof
    // - Pass `table_commitments` as the one with which GoblinWithoutMerge was initialized (which commits all the ECC
    // ops that have to be verified).
    // - `accumulated_result` and corresponding challenges ensure non-native computation matches ECCVM's native result
    TranslatorVerifier translator_verifier{ transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            table_commitments };
    auto translator_result = translator_verifier.reduce_to_pairing_check();
    vinfo("Goblin: Translator reduced to pairing check successfully: ",
          translator_result.reduction_succeeded ? "true" : "false");

    ReductionResult result{
        .translator_pairing_points = std::move(translator_result.pairing_points),
        .ipa_claim = std::move(eccvm_result.ipa_claim),
        .ipa_proof = proof.ipa_proof,
    };

    return result;
}

} // namespace bb

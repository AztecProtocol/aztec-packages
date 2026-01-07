// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "goblin_avm_verifier.hpp"
#include "barretenberg/common/log.hpp"

namespace bb {

/**
 * @brief Reduce GoblinAvm proof to pairing check and IPA opening claim
 * @details Processes ECCVM, and Translator sub-proofs sequentially.
 */
GoblinAvmRecursiveVerifier::ReductionResult GoblinAvmRecursiveVerifier::reduce_to_pairing_check_and_ipa_opening()
{
    // Step 1: Verify the ECCVM proof
    ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("Goblin: ECCVM reduced to IPA opening successfully: ", eccvm_result.reduction_succeeded ? "true" : "false");

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 2: Verify the Translator proof
    // - Pass `table_commitments` as the one with which GoblinAvm was initialized (which commits all the ECC ops of the
    //   circuit containing the Avm recursive verifier).
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

    // Note: Pairing points are NOT aggregated here - caller should use aggregate_multiple for efficiency
    ReductionResult result{
        .translator_pairing_points = std::move(translator_result.pairing_points),
        .ipa_claim = std::move(eccvm_result.ipa_claim),
        .ipa_proof = proof.ipa_proof,
    };

    return result;
}

} // namespace bb

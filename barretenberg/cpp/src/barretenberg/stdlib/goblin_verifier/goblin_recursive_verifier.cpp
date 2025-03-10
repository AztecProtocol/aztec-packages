#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Runs the Goblin recursive verifier consisting of ECCVM, Translator and Merge verifiers.
 *
 * @todo https://github.com/AztecProtocol/barretenberg/issues/934: Add logic for accumulating the pairing points
 * produced by the translator and merge verifier (and potentially IPA accumulators for ECCVM verifier)
 */
GoblinRecursiveVerifierOutput GoblinRecursiveVerifier::verify(const GoblinProof& proof)
{
    // Run the ECCVM recursive verifier
    ECCVMVerifier eccvm_verifier{ builder, verification_keys.eccvm_verification_key };
    auto [opening_claim, ipa_transcript] = eccvm_verifier.verify_proof(proof.eccvm_proof);

    // Run the Translator recursive verifier
    TranslatorVerifier translator_verifier{ builder,
                                            verification_keys.translator_verification_key,
                                            eccvm_verifier.transcript };

    translator_verifier.verify_proof(
        proof.translator_proof, eccvm_verifier.evaluation_challenge_x, eccvm_verifier.batching_challenge_v);

    // Verify the consistency between the ECCVM and Translator transcript polynomial evaluations
    // In reality the Goblin Proof is going to already be a stdlib proof and this conversion is not going to happen here
    // (see https://github.com/AztecProtocol/barretenberg/issues/991)
    auto native_translation_evaluations = proof.translation_evaluations;
    auto translation_evaluations =
        TranslationEvaluations{ TranslatorBF::from_witness(builder, native_translation_evaluations.op),
                                TranslatorBF::from_witness(builder, native_translation_evaluations.Px),
                                TranslatorBF::from_witness(builder, native_translation_evaluations.Py),
                                TranslatorBF::from_witness(builder, native_translation_evaluations.z1),
                                TranslatorBF::from_witness(builder, native_translation_evaluations.z2)

        };
    translator_verifier.verify_translation(translation_evaluations, eccvm_verifier.translation_masking_term_eval);

    MergeVerifier merge_verifier{ builder };
    merge_verifier.verify_proof(proof.merge_proof);
    return { opening_claim, ipa_transcript };
}
} // namespace bb::stdlib::recursion::honk

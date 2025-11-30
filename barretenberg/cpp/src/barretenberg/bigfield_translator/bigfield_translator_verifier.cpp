// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator_verifier.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

BigfieldTranslatorVerifier::BigfieldTranslatorVerifier(const std::shared_ptr<Transcript>& transcript)
    : key(std::make_shared<VerificationKey>())
    , transcript(transcript)
{}

BigfieldTranslatorVerifier::BigfieldTranslatorVerifier(const std::shared_ptr<VerificationKey>& verification_key,
                                                       const std::shared_ptr<Transcript>& transcript)
    : key(verification_key)
    , transcript(transcript)
{}

bool BigfieldTranslatorVerifier::verify_proof(const HonkProof& proof,
                                              const BF& evaluation_input_x_,
                                              const BF& batching_challenge_v_,
                                              const BF& accumulated_result_)
{
    using Verifier = UltraVerifier_<Flavor>;

    // Store values for translation verification
    evaluation_input_x = evaluation_input_x_;
    batching_challenge_v = batching_challenge_v_;
    accumulated_result = accumulated_result_;

    // Verify using the underlying UltraVerifier with DefaultIO
    Verifier verifier(key, {}, transcript);
    auto result = verifier.template verify_proof<DefaultIO>(proof);

    return result.result;
}

bool BigfieldTranslatorVerifier::verify_translation(const TranslationEvaluations& translation_evaluations,
                                                    const BF& translation_masking_term_eval)
{
    // Compute powers of v
    BF v1 = batching_challenge_v;
    BF v2 = v1 * batching_challenge_v;
    BF v3 = v2 * batching_challenge_v;
    BF v4 = v3 * batching_challenge_v;

    // Extract evaluations
    const BF& op = translation_evaluations.op;
    const BF& Px = translation_evaluations.Px;
    const BF& Py = translation_evaluations.Py;
    const BF& z1 = translation_evaluations.z1;
    const BF& z2 = translation_evaluations.z2;

    // Compute the ECCVM opening: op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term
    BF eccvm_opening = op + (v1 * Px) + (v2 * Py) + (v3 * z1) + (v4 * z2) - translation_masking_term_eval;

    // Verify: x * accumulated_result == eccvm_opening
    return evaluation_input_x * accumulated_result == eccvm_opening;
}

} // namespace bb

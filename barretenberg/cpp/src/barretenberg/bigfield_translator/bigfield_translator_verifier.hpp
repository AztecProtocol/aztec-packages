// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/light_zk_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Verifier for the bigfield-based translator circuit.
 *
 * @details Replaces the TranslatorVerifier with a simpler bigfield-based approach using LightZKFlavor.
 */
class BigfieldTranslatorVerifier {
  public:
    using Flavor = LightZKFlavor;
    using FF = typename Flavor::FF;
    using BF = curve::BN254::BaseField; // Fq - the non-native field
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;
    using TranslationEvaluations = TranslationEvaluations_<BF>;

    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;

    std::shared_ptr<VerificationKey> key;
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Construct with a transcript only (uses default VK).
     */
    explicit BigfieldTranslatorVerifier(const std::shared_ptr<Transcript>& transcript);

    /**
     * @brief Construct with a verification key and transcript.
     */
    BigfieldTranslatorVerifier(const std::shared_ptr<VerificationKey>& verification_key,
                               const std::shared_ptr<Transcript>& transcript);

    /**
     * @brief Verify the bigfield translator proof.
     *
     * @param proof The proof to verify
     * @param evaluation_input_x The evaluation point x from ECCVM
     * @param batching_challenge_v The batching challenge v from ECCVM
     * @param accumulated_result The accumulated result from the prover
     * @return true if verification succeeds
     */
    bool verify_proof(const HonkProof& proof,
                      const BF& evaluation_input_x,
                      const BF& batching_challenge_v,
                      const BF& accumulated_result);

    /**
     * @brief Verify that the translation is consistent with ECCVM evaluations.
     *
     * @details Checks that x * accumulated_result == op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term
     *
     * @param translation_evaluations The polynomial evaluations from ECCVM
     * @param translation_masking_term_eval The masking term evaluation
     * @return true if translation is consistent
     */
    bool verify_translation(const TranslationEvaluations& translation_evaluations,
                            const BF& translation_masking_term_eval);

  private:
    BF accumulated_result = 0;
};

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {
class TranslatorVerifier {
  public:
    using Flavor = TranslatorFlavor;
    using FF = Flavor::FF;
    using BF = Flavor::BF;
    using Commitment = Flavor::Commitment;
    using ProvingKey = Flavor::ProvingKey;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using TranslationEvaluations = bb::TranslationEvaluations_<BF>;
    using Transcript = Flavor::Transcript;

    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;

    // Default construct fixed VK
    std::shared_ptr<VerificationKey> key = std::make_shared<VerificationKey>();
    std::shared_ptr<Transcript> transcript;
    RelationParameters<FF> relation_parameters;
    std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;

    TranslatorVerifier(const std::shared_ptr<Transcript>& transcript);

    TranslatorVerifier(const std::shared_ptr<VerificationKey>& verifier_key,
                       const std::shared_ptr<Transcript>& transcript);

    TranslatorVerifier(const std::shared_ptr<ProvingKey>& proving_key, const std::shared_ptr<Transcript>& transcript);

    void put_translation_data_in_relation_parameters(const uint256_t& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const uint256_t& accumulated_result);
    bool verify_proof(const HonkProof& proof, const uint256_t& evaluation_input_x, const BF& batching_challenge_v);
    bool verify_translation(const TranslationEvaluations& translation_evaluations,
                            const BF& translation_masking_term_eval);
    bool verify_consistency_with_final_merge(
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> merge_commitments);
};
} // namespace bb

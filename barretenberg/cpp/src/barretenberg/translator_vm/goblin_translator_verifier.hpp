#pragma once
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace proof_system::honk {
class GoblinTranslatorVerifier {
    using Flavor = honk::flavor::GoblinTranslator;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using TranslationEvaluations = barretenberg::TranslationEvaluations;

  public:
    explicit GoblinTranslatorVerifier(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    GoblinTranslatorVerifier(GoblinTranslatorVerifier&& other) noexcept;
    GoblinTranslatorVerifier(const GoblinTranslatorVerifier& other) = delete;
    GoblinTranslatorVerifier& operator=(const GoblinTranslatorVerifier& other) = delete;
    GoblinTranslatorVerifier& operator=(GoblinTranslatorVerifier&& other) noexcept;
    ~GoblinTranslatorVerifier() = default;

    bool verify_proof(const plonk::proof& proof, const TranslationEvaluations& translation_evaluations);
    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;
    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    BaseTranscript<FF> transcript;
};
} // namespace proof_system::honk

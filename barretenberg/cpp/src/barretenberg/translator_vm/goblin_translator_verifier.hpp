#pragma once
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/goblin/translation_consistency_data.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace proof_system::honk {
template <typename Flavor> class GoblinTranslatorVerifier_ {
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using GoblinTranslationConsistencyData = barretenberg::GoblinTranslationConsistencyData;

  public:
    explicit GoblinTranslatorVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    GoblinTranslatorVerifier_(GoblinTranslatorVerifier_&& other) noexcept;
    GoblinTranslatorVerifier_(const GoblinTranslatorVerifier_& other) = delete;
    GoblinTranslatorVerifier_& operator=(const GoblinTranslatorVerifier_& other) = delete;
    GoblinTranslatorVerifier_& operator=(GoblinTranslatorVerifier_&& other) noexcept;
    ~GoblinTranslatorVerifier_() = default;

    bool verify_proof(const plonk::proof& proof, const GoblinTranslationConsistencyData& translation_consistency_data);
    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;
    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    BaseTranscript<FF> transcript;
};

extern template class GoblinTranslatorVerifier_<honk::flavor::GoblinTranslator>;

using GoblinTranslatorVerifier = GoblinTranslatorVerifier_<honk::flavor::GoblinTranslator>;

} // namespace proof_system::honk

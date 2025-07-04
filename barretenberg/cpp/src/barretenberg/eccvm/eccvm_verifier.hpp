// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"

namespace bb {
class ECCVMVerifier {
    using Flavor = ECCVMFlavor;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using CommitmentLabels = Flavor::CommitmentLabels;
    using Transcript = Flavor::Transcript;
    using ProvingKey = Flavor::ProvingKey;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using PCS = Flavor::PCS;

  public:
    explicit ECCVMVerifier(const std::shared_ptr<Transcript>& transcript)
        : transcript(transcript){};

    bool verify_proof(const ECCVMProof& proof);
    void compute_translation_opening_claims(
        const std::array<Commitment, NUM_TRANSLATION_EVALUATIONS>& translation_commitments);

    uint32_t circuit_size;
    // Final ShplonkVerifier consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;
    std::array<OpeningClaim<Curve>, NUM_OPENING_CLAIMS> opening_claims;

    std::shared_ptr<VerificationKey> key = std::make_shared<VerificationKey>();
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript = std::make_shared<Transcript>();

    TranslationEvaluations_<FF> translation_evaluations;

    // Translation evaluation and batching challenges. They are propagated to the TranslatorVerifier
    FF evaluation_challenge_x;
    FF batching_challenge_v;
    // The value ∑ mᵢ(x) ⋅ vⁱ which needs to be propagated to TranslatorVerifier
    FF translation_masking_term_eval;

    bool translation_masking_consistency_checked = false;
};
} // namespace bb

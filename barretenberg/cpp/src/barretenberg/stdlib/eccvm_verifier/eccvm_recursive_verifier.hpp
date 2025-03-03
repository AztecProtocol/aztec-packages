#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"

namespace bb {
template <typename Flavor> class ECCVMRecursiveVerifier_ {
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;

    static constexpr size_t NUM_TRANSLATION_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS;

  public:
    explicit ECCVMRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/991): switch recursive verifiers to StdlibProof
    std::pair<OpeningClaim<Curve>, std::shared_ptr<Transcript>> verify_proof(const ECCVMProof& proof);

    std::shared_ptr<VerificationKey> key;

    Builder* builder;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript;

    std::vector<Commitment> translation_commitments;
    TranslationEvaluations_<FF> translation_evaluations;
    FF translation_masking_term_eval;
    std::array<OpeningClaim<Curve>, NUM_TRANSLATION_OPENING_CLAIMS> opening_claims;

    std::array<Commitment, NUM_SMALL_IPA_EVALUATIONS> small_ipa_commitments;
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points;
    std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> labels;

    void compute_translation_opening_claims(const std::vector<Commitment>& translation_commitments);

    // Translation evaluations challenges. They are propagated to the TranslatorVerifier
    FF evaluation_challenge_x;
    FF batching_challenge_v;

    bool translation_masking_consistency_checked = false;
};
} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

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
    using StdlibPreIpaProof = bb::stdlib::Proof<Builder>;
    using StdlibIpaProof = bb::stdlib::Proof<Builder>;
    using IpaClaimAndProof = std::pair<OpeningClaim<Curve>, StdlibIpaProof>;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    struct StdlibProof {
        StdlibPreIpaProof pre_ipa_proof;
        StdlibIpaProof ipa_proof;

        StdlibProof(Builder& builder, const ECCVMProof& eccvm_proof)
            : pre_ipa_proof(builder, eccvm_proof.pre_ipa_proof)
            , ipa_proof(builder, eccvm_proof.ipa_proof)
        {}
    };

    explicit ECCVMRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                                     const std::shared_ptr<Transcript>& transcript);

    [[nodiscard("IPA claim should be accumulated")]] IpaClaimAndProof verify_proof(const ECCVMProof& proof);
    [[nodiscard("IPA claim should be accumulated")]] IpaClaimAndProof verify_proof(const StdlibProof& proof);
    void compute_translation_opening_claims(const std::vector<Commitment>& translation_commitments);

    std::shared_ptr<VerificationKey> key;

    Builder* builder;
    std::shared_ptr<Transcript> transcript;
    TranslationEvaluations_<FF> translation_evaluations;

    // Final ShplonkVerifier consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;
    std::array<OpeningClaim<Curve>, NUM_OPENING_CLAIMS> opening_claims;
    FF translation_masking_term_eval;

    // Translation evaluation and batching challenges. They are propagated to the TranslatorVerifier
    FF evaluation_challenge_x;
    FF batching_challenge_v;
};
} // namespace bb

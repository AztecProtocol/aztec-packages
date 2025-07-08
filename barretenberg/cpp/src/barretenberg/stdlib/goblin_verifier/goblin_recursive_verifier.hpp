// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.hpp"
#include "barretenberg/stdlib/merge_verifier/merge_recursive_verifier.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

struct GoblinRecursiveVerifierOutput {
    using Builder = UltraCircuitBuilder;
    using Curve = grumpkin<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using PairingAccumulator = PairingPoints<Builder>;
    PairingAccumulator points_accumulator;
    OpeningClaim<Curve> opening_claim;
    stdlib::Proof<Builder> ipa_proof;
};

class GoblinRecursiveVerifier {
  public:
    // Goblin Recursive Verifier circuit is using Ultra arithmetisation
    using Builder = UltraCircuitBuilder;
    using MergeVerifier = goblin::MergeRecursiveVerifier_<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    using TranslatorFlavor = TranslatorRecursiveFlavor;
    using TranslatorVerifier = TranslatorRecursiveVerifier;
    using TranslationEvaluations = TranslatorVerifier::TranslationEvaluations;

    using ECCVMVerifier = ECCVMRecursiveVerifier;

    // ECCVM and Translator verification keys
    using VerificationKey = Goblin::VerificationKey;

    struct StdlibProof {
        using StdlibHonkProof = bb::stdlib::Proof<Builder>;
        using StdlibEccvmProof = ECCVMVerifier::StdlibProof;

        StdlibHonkProof merge_proof;
        StdlibEccvmProof eccvm_proof; // contains pre-IPA and IPA proofs
        StdlibHonkProof translator_proof;

        StdlibProof(Builder& builder, const GoblinProof& goblin_proof)
            : merge_proof(builder, goblin_proof.merge_proof)
            , eccvm_proof(builder,
                          ECCVMProof{ goblin_proof.eccvm_proof.pre_ipa_proof, goblin_proof.eccvm_proof.ipa_proof })
            , translator_proof(builder, goblin_proof.translator_proof)
        {}
    };

    GoblinRecursiveVerifier(Builder* builder,
                            const VerificationKey& verification_keys,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : builder(builder)
        , verification_keys(verification_keys)
        , transcript(transcript){};

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] GoblinRecursiveVerifierOutput verify(
        const GoblinProof&, const RefArray<typename MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments);
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] GoblinRecursiveVerifierOutput verify(
        const StdlibProof&, const RefArray<typename MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments);

  private:
    Builder* builder;
    VerificationKey verification_keys; // ECCVM and Translator verification keys
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk

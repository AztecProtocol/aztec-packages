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
    using ECCVMFlavor = ECCVMRecursiveFlavor_<Builder>;
    using Curve = grumpkin<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using PairingAccumulator = PairingPoints<Builder>;
    PairingAccumulator points_accumulator;
    OpeningClaim<Curve> opening_claim;
    StdlibProof<Builder> ipa_proof;
};

class GoblinRecursiveVerifier {
  public:
    // Goblin Recursive Verifier circuit is using Ultra arithmetisation
    using Builder = UltraCircuitBuilder;
    using MergeVerifier = goblin::MergeRecursiveVerifier_<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    using TranslatorFlavor = TranslatorRecursiveFlavor_<Builder>;
    using TranslatorVerifier = TranslatorRecursiveVerifier_<TranslatorFlavor>;
    using TranslationEvaluations = TranslatorVerifier::TranslationEvaluations;
    using TranslatorBF = TranslatorFlavor::BF;

    using ECCVMFlavor = ECCVMRecursiveFlavor_<Builder>;
    using ECCVMVerifier = ECCVMRecursiveVerifier_<ECCVMFlavor>;

    // ECCVM and Translator verification keys
    using VerificationKey = Goblin::VerificationKey;

    GoblinRecursiveVerifier(Builder* builder,
                            const VerificationKey& verification_keys,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : builder(builder)
        , verification_keys(verification_keys)
        , transcript(transcript){};

    /**
     * @brief Construct a Goblin recursive verifier circuit
     * @details Contains three recursive verifiers: Merge, ECCVM, and Translator
     *
     * @param proof
     * @param t_commitments The commitments to the subtable for the merge being verified
     *
     * @todo(https://github.com/AztecProtocol/barretenberg/issues/991): The GoblinProof should aleady be a stdlib proof
     */
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] GoblinRecursiveVerifierOutput verify(
        const GoblinProof&, const RefArray<typename MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments);

  private:
    Builder* builder;
    VerificationKey verification_keys; // ECCVM and Translator verification keys
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk

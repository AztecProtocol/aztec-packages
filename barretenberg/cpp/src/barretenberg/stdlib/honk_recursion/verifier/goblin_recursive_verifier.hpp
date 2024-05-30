#pragma once
#include "barretenberg/eccvm_recursion/eccvm_recursive_verifier.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/translator_vm_recursion/translator_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinRecursiveVerifier {
  public:
    using Builder = UltraCircuitBuilder; // Goblin rec verifier will have Ultra arithmetization

    using MergeVerifier = goblin::MergeRecursiveVerifier_<Builder>;

    using TranslatorFlavor = TranslatorRecursiveFlavor_<Builder>;
    using TranslatorVerifier = TranslatorRecursiveVerifier_<TranslatorFlavor>;
    using TranslationEvaluations = TranslatorVerifier::TranslationEvaluations;
    using BF = TranslatorFlavor::BF;

    using ECCVMFlavor = ECCVMRecursiveFlavor_<Builder>;
    using ECCVMVerifier = ECCVMRecursiveVerifier_<ECCVMFlavor>;

    // ECCVM and Translator verification keys
    using VerifierInput = GoblinVerifier::VerifierInput;

    GoblinRecursiveVerifier(Builder* builder, VerifierInput& verification_keys)
        : builder(builder)
        , verification_keys(verification_keys){};

    /**
     * @brief Construct a Goblin recursive verifier circuit
     * @details Contains three recursive verifiers: Merge, ECCVM, and Translator
     * WORKTODO: point aggregation is not handled here. Need to aggregate and return the pairing points from
     * Merge/Translator plus deal with the IPA accumulator
     *
     */
    void verify(GoblinProof&);

  private:
    Builder* builder;
    VerifierInput verification_keys; // ECCVM and Translator verification keys

  public:
};

} // namespace bb::stdlib::recursion::honk
#pragma once
// #include "barretenberg/flavor/flavor.hpp"
// #include "barretenberg/honk/proof_system/types/proof.hpp"
// #include "barretenberg/protogalaxy/folding_result.hpp"
// #include "barretenberg/stdlib/honk_recursion/transcript/transcript.hpp"
// #include "barretenberg/stdlib/honk_recursion/verifier/recursive_instances.hpp"
// #include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/translator_vm_recursion/translator_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinRecursiveVerifier {
  public:
    using Builder = UltraCircuitBuilder; // Goblin rec verifier will have Ultra arithmetization
    using TranslatorFlavor = TranslatorRecursiveFlavor_<Builder>;
    using TranslatorVerifier = TranslatorRecursiveVerifier_<TranslatorFlavor>;
    using MergeVerifier = goblin::MergeRecursiveVerifier_<Builder>;

    using VerifierInput = GoblinVerifier::VerifierInput;

    using NativeTranslatorVK = TranslatorFlavor::NativeVerificationKey;
    using TranslatorVK = TranslatorVerifier::VerificationKey;

    GoblinRecursiveVerifier(Builder* builder, std::shared_ptr<NativeTranslatorVK> translator_vk)
        : merge_verifier(builder)
        , translator_verifier(builder, translator_vk){
            // (void)builder;
        };

    void verify(GoblinProof&);

  private:
    // Builder* builder;
    MergeVerifier merge_verifier;
    TranslatorVerifier translator_verifier;

  public:
};

} // namespace bb::stdlib::recursion::honk
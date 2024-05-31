#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursiveVerifier {
    using Builder = UltraCircuitBuilder;                   // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>; // The verifier algorithms are Mega
    using RecursiveVerifierInstances = RecursiveVerifierInstances_<RecursiveFlavor, 2>;

    Builder* builder;

  public:
    using DeciderVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using FoldingVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using GoblinVerifier = GoblinRecursiveVerifier;
    using FoldVerifierInput = FoldingVerifier::VerifierInput;
    using GoblinVerifierInput = GoblinVerifier::VerifierInput;

    ClientIVCRecursiveVerifier(Builder* builder)
        : builder(builder){};

    void verify(const ClientIVC::Proof&, FoldVerifierInput&, GoblinVerifierInput&);
};
} // namespace bb::stdlib::recursion::honk
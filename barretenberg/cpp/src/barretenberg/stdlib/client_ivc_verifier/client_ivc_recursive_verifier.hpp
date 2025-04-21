#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursiveVerifier {
    using Builder = UltraCircuitBuilder;                     // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>; // The hiding circuit verifier algorithm is MegaZK
    using RecursiveDeciderVerificationKeys = RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveDeciderVerificationKeys::VerificationKey;
    using FoldingVerifier = ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using MegaVerifier = UltraRecursiveVerifier_<RecursiveFlavor>;
    using GoblinVerifier = GoblinRecursiveVerifier;
    using Flavor = RecursiveFlavor::NativeFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using IVCVerificationKey = ClientIVC::VerificationKey;

  public:
    using Proof = ClientIVC::Proof;
    using FoldVerifierInput = FoldingVerifier::VerifierInput;
    using GoblinVerificationKey = Goblin::VerificationKey;
    using Output = GoblinRecursiveVerifierOutput;

    struct VerifierInput {
        std::shared_ptr<VerificationKey> mega_verification_key;
        GoblinVerificationKey goblin_input;
    };

    ClientIVCRecursiveVerifier(std::shared_ptr<Builder> builder, IVCVerificationKey& ivc_verification_key)
        : builder(builder)
        , ivc_verification_key(ivc_verification_key){};

    Output verify(const ClientIVC::Proof&);

  private:
    std::shared_ptr<Builder> builder;
    IVCVerificationKey ivc_verification_key;
};
} // namespace bb::stdlib::recursion::honk

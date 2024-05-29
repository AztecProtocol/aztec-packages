#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/decider_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIvcRecursiveVerifier_ {
    using Builder = UltraCircuitBuilder;                   // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>; // The verifier algorithms are Mega
    using RecursiveVerifierInstances = RecursiveVerifierInstances_<RecursiveFlavor, 2>;

    using DeciderVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using FoldingVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

    Builder* builder;

  public:
    struct VerifierData {

        using NativeFlavor = MegaFlavor;
        using NativeInstance = bb::VerifierInstance_<NativeFlavor>;
        using NativeVerificationKey = NativeFlavor::VerificationKey;

        std::shared_ptr<NativeInstance> verifier_accumulator_instance;
        std::shared_ptr<NativeVerificationKey> honk_verification_key;
        // std::vector<std::shared_ptr<NativeVerificationKey>> honk_verification_keys;
    };

    ClientIvcRecursiveVerifier_(Builder* builder)
        : builder(builder){};

    void verify(const ClientIVC::Proof&, const VerifierData&);
};
} // namespace bb::stdlib::recursion::honk
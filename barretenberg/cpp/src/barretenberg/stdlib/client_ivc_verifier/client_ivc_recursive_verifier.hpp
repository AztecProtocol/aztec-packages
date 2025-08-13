// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
    using Transcript = GoblinRecursiveVerifier::Transcript;

  public:
    using GoblinVerificationKey = Goblin::VerificationKey;
    using Output = GoblinRecursiveVerifierOutput;
    using RecursiveVKAndHash = RecursiveDeciderVerificationKeys::VKAndHash;
    using RecursiveVK = RecursiveFlavor::VerificationKey;

    struct StdlibProof {
        using StdlibHonkProof = bb::stdlib::Proof<Builder>;
        using StdlibGoblinProof = GoblinRecursiveVerifier::StdlibProof;
        StdlibHonkProof mega_proof; // proof of the hiding circuit
        StdlibGoblinProof goblin_proof;

        StdlibProof(Builder& builder, const ClientIVC::Proof& proof)
            : mega_proof(builder, proof.mega_proof)
            , goblin_proof(builder, proof.goblin_proof)
        {}
    };

    ClientIVCRecursiveVerifier(Builder* builder, const std::shared_ptr<VerificationKey>& native_mega_vk)
        : builder(builder)
        , stdlib_mega_vk_and_hash(std::make_shared<RecursiveVKAndHash>(builder, native_mega_vk)){};

    ClientIVCRecursiveVerifier(Builder* builder, const std::shared_ptr<RecursiveVKAndHash>& stdlib_mega_vk_and_hash)
        : builder(builder)
        , stdlib_mega_vk_and_hash(stdlib_mega_vk_and_hash){};

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] Output verify(const StdlibProof&);

  private:
    Builder* builder;
    // VK and hash of the hiding kernel
    std::shared_ptr<RecursiveVKAndHash> stdlib_mega_vk_and_hash;
};
} // namespace bb::stdlib::recursion::honk

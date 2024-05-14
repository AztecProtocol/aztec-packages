#pragma once
#include "barretenberg/eccvm_recursion/eccvm_recursive_flavor.hpp"

namespace bb {
template <typename Flavor> class ECCVMRecursiveVerifier_ {
    using Flavor = ECCVMFlavor;
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
 using PairingPoints = std::array<GroupElement, 2>;
    using VerifierCommitments = typename Flavor::VerifierCommitments; // dunno if I need thos
  public:
   explicit ECCVMRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key);

    PairingPoints verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;

    Builder* builder;
    std::shared_ptr<Transcript> transcript;
};
} // namespace bb

#pragma once
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"

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

  public:
    explicit ECCVMRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/991): switch recursive verifiers to StdlibProof
    std::pair<OpeningClaim<Curve>, std::shared_ptr<Transcript>> verify_proof(const ECCVMProof& proof);

    std::shared_ptr<VerificationKey> key;

    Builder* builder;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript;
};
} // namespace bb

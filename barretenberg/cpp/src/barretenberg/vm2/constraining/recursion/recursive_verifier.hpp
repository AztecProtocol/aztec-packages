#pragma once

#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"

namespace bb::avm2 {

class AvmRecursiveVerifier {
    using Flavor = AvmRecursiveFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;
    using Transcript = BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using PairingPoints = stdlib::recursion::PairingPoints<Builder>;
    using StdlibProof = stdlib::Proof<Builder>;

  public:
    explicit AvmRecursiveVerifier(Builder& builder,
                                  const std::shared_ptr<NativeVerificationKey>& native_verification_key);
    explicit AvmRecursiveVerifier(Builder& builder, const std::shared_ptr<VerificationKey>& vkey);

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] PairingPoints verify_proof(
        const HonkProof& proof, const std::vector<std::vector<fr>>& public_inputs_vec_nt);
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] PairingPoints verify_proof(
        const StdlibProof& stdlib_proof_with_pi_flag, // TODO(#14234)[Unconditional PIs validation]: rename
                                                      // stdlib_proof_with_pi_flag to stdlib_proof
        const std::vector<std::vector<typename Flavor::FF>>& public_inputs);

    std::shared_ptr<VerificationKey> key;
    Builder& builder;
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

  private:
    FF evaluate_public_input_column(const std::vector<FF>& points, const std::vector<FF>& challenges);
};

} // namespace bb::avm2

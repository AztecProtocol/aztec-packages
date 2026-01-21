// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/pairing_points.hpp"
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
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;
    using Transcript = Flavor::Transcript;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using PairingPoints = stdlib::recursion::PairingPoints<Curve>;
    using StdlibProof = stdlib::Proof<Builder>;

  public:
    explicit AvmRecursiveVerifier(Builder& builder,
                                  const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] PairingPoints verify_proof(
        const StdlibProof& stdlib_proof, const std::vector<std::vector<typename Flavor::FF>>& public_inputs);

    /**
     * @brief Hash the transcript after verification is complete to produce a hash of the public inputs and proofs that
     * have been verified.
     *
     */
    FF hash_avm_transcript(const StdlibProof& stdlib_proof);

  private:
    Builder& builder;
    std::shared_ptr<VerificationKey> key;
    FF vk_hash;
    std::shared_ptr<Transcript> transcript;

    bool is_verification_complete = false;

    static FF evaluate_public_input_column(const std::vector<FF>& points, const std::vector<FF>& challenges);
};

} // namespace bb::avm2

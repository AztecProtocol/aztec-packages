#pragma once

#include "barretenberg/stdlib/plonk_recursion/pairing_points.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"

namespace bb::avm2 {

// TODO: Ultimately we will not need to template with Flavor as
// we will only support RecursiveFlavor with MegaCircuitBuilder.
// We will simply add in the body: using Flavor = ....
template <typename Flavor> class AvmRecursiveVerifier_ {
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

  public:
    explicit AvmRecursiveVerifier_(Builder& builder,
                                   const std::shared_ptr<NativeVerificationKey>& native_verification_key);
    explicit AvmRecursiveVerifier_(Builder& builder, const std::shared_ptr<VerificationKey>& vkey);

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] PairingPoints verify_proof(
        const HonkProof& proof, const std::vector<std::vector<fr>>& public_inputs_vec_nt);
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] PairingPoints verify_proof(
        const StdlibProof<Builder>& stdlib_proof, const std::vector<std::vector<typename Flavor::FF>>& public_inputs);

    std::shared_ptr<VerificationKey> key;
    Builder& builder;
    std::shared_ptr<Transcript> transcript;

  private:
    FF evaluate_public_input_column(const std::vector<FF>& points, const std::vector<FF>& challenges);
};

} // namespace bb::avm2

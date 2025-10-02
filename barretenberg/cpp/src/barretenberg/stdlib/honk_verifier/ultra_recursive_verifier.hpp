// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Builder> struct UltraRecursiveVerifierOutput {
    using Curve = bn254<Builder>;
    using FF = Curve::ScalarField;
    using G1 = Curve::Group;

    PairingPoints<Builder> points_accumulator;
    OpeningClaim<grumpkin<Builder>> ipa_claim;
    stdlib::Proof<Builder> ipa_proof;
    std::array<G1, Builder::NUM_WIRES> ecc_op_tables; // Ecc op tables' commitments as extracted from the public inputs
                                                      // of the HidingKernel, only for ClientIVC
    FF mega_hash; // The hash of public inputs and VK of the inner circuit in the GoblinAvmRecursiveVerifier

    UltraRecursiveVerifierOutput() = default;

    template <class IO>
    UltraRecursiveVerifierOutput(IO& inputs)
        : points_accumulator(inputs.pairing_inputs)
    {
        if constexpr (std::is_same_v<IO, RollupIO>) {
            ipa_claim = inputs.ipa_claim;
        } else if constexpr (std::is_same_v<IO, HidingKernelIO<Builder>>) {
            ecc_op_tables = inputs.ecc_op_tables;
        } else if constexpr (std::is_same_v<IO, GoblinAvmIO<Builder>>) {
            mega_hash = inputs.mega_hash;
        } else if constexpr (!std::is_same_v<IO, DefaultIO<Builder>>) {
            throw_or_abort("Invalid public input type.");
        }
    }
};

template <typename Flavor> class UltraRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using RecursiveVerifierInstance = RecursiveVerifierInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PairingObject = PairingPoints<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using OinkVerifier = OinkRecursiveVerifier_<Flavor>;
    using Output = UltraRecursiveVerifierOutput<Builder>;
    using StdlibProof = stdlib::Proof<Builder>;

    explicit UltraRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<VKAndHash>& vk_and_hash,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    template <class IO>
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] Output verify_proof(const StdlibProof& proof);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1364): Improve VKs. Clarify the usage of
    // RecursiveVerifierInstances here. Seems unnecessary.
    std::shared_ptr<RecursiveVerifierInstance> verifier_instance;
    VerifierCommitmentKey pcs_verification_key;
    Builder* builder;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk

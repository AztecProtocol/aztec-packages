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
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Builder> struct UltraRecursiveVerifierOutput {
    PairingPoints<Builder> points_accumulator;
    OpeningClaim<grumpkin<Builder>> ipa_claim;
    StdlibProof<Builder> ipa_proof;
};
template <typename Flavor> class UltraRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using DeciderVK = DeciderVerificationKey_<typename Flavor::NativeFlavor>;
    using RecursiveDeciderVK = RecursiveDeciderVerificationKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using PairingObject = PairingPoints<Builder>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using OinkVerifier = OinkRecursiveVerifier_<Flavor>;
    using Output = UltraRecursiveVerifierOutput<Builder>;

    explicit UltraRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
    explicit UltraRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<VerificationKey>& vkey,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] Output verify_proof(const HonkProof& proof);
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] Output verify_proof(
        const StdlibProof<Builder>& proof);

    std::shared_ptr<RecursiveDeciderVK> key;
    VerifierCommitmentKey pcs_verification_key;
    Builder* builder;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk

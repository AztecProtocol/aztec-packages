#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Flavor> struct UltraRecursiveVerifierOutput {
    using AggregationObject = aggregation_state<typename Flavor::Curve>;
    using Builder = typename Flavor::CircuitBuilder;
    AggregationObject agg_obj;
    OpeningClaim<grumpkin<Builder>> ipa_opening_claim;
};
template <typename Flavor> class UltraRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using RecursiveDeciderVK = RecursiveDeciderVerificationKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using AggregationObject = aggregation_state<typename Flavor::Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using OinkVerifier = OinkRecursiveVerifier_<Flavor>;
    using Output = UltraRecursiveVerifierOutput<Flavor>;

    explicit UltraRecursiveVerifier_(Builder* builder,
                                     const std::shared_ptr<NativeVerificationKey>& native_verifier_key);
    explicit UltraRecursiveVerifier_(Builder* builder, const std::shared_ptr<VerificationKey>& vkey);

    Output verify_proof(const HonkProof& proof, AggregationObject agg_obj);
    Output verify_proof(const StdlibProof<Builder>& proof, AggregationObject agg_obj);

    std::shared_ptr<VerificationKey> key;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    Builder* builder;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk

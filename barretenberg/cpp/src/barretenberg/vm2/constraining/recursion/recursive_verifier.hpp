#pragma once

#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
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
    using AggregationObject = stdlib::recursion::aggregation_state<Curve>;

  public:
    explicit AvmRecursiveVerifier_(Builder& builder,
                                   const std::shared_ptr<NativeVerificationKey>& native_verification_key);
    explicit AvmRecursiveVerifier_(Builder& builder, const std::shared_ptr<VerificationKey>& vkey);

    AggregationObject verify_proof(const HonkProof& proof,
                                   const std::vector<std::vector<fr>>& public_inputs_vec_nt,
                                   AggregationObject agg_obj);
    AggregationObject verify_proof(const StdlibProof<Builder>& stdlib_proof,
                                   const std::vector<std::vector<typename Flavor::FF>>& public_inputs,
                                   AggregationObject agg_obj);

    std::shared_ptr<VerificationKey> key;
    Builder& builder;
    std::shared_ptr<Transcript> transcript;

  private:
    FF evaluate_public_input_column(const std::vector<FF>& points, const std::vector<FF>& challenges);
};

} // namespace bb::avm2

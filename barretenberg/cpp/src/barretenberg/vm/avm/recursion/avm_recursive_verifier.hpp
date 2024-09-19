#pragma once
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm/avm/recursion/avm_recursive_flavor.hpp"

namespace bb {
template <typename Flavor> class AvmRecursiveVerifier_ {
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PCS = typename Flavor::PCS;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using AggregationObject = bb::stdlib::recursion::aggregation_state<Curve>;

  public:
    explicit AvmRecursiveVerifier_(Builder* builder,
                                   const std::shared_ptr<NativeVerificationKey>& native_verification_key);
    explicit AvmRecursiveVerifier_(Builder* builder, const std::shared_ptr<VerificationKey>& vkey);

    AggregationObject verify_proof(const HonkProof& proof, AggregationObject agg_obj);
    AggregationObject verify_proof(const StdlibProof<Builder>& stdlib_proof, AggregationObject agg_obj);

    std::shared_ptr<VerificationKey> key;
    Builder* builder;
    std::shared_ptr<Transcript> transcript;
};
} // namespace bb
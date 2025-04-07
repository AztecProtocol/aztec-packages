#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

namespace bb::stdlib::recursion::goblin {
template <typename CircuitBuilder> class MergeRecursiveVerifier_ {
  public:
    using Curve = bn254<CircuitBuilder>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using GroupElement = typename Curve::Element;
    using KZG = ::bb::KZG<Curve>;
    using OpeningClaim = ::bb::OpeningClaim<Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
    using AggregationObject = stdlib::recursion::aggregation_state<CircuitBuilder>;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder);

    AggregationObject verify_proof(const StdlibProof<CircuitBuilder>& proof);
};

} // namespace bb::stdlib::recursion::goblin

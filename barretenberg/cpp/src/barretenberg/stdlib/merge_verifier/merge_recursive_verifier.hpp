// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
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
    using PairingPoints = stdlib::recursion::PairingPoints<CircuitBuilder>;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    std::array<Commitment, NUM_WIRES> T_commitments;

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints verify_proof(
        const stdlib::Proof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments);
};

} // namespace bb::stdlib::recursion::goblin

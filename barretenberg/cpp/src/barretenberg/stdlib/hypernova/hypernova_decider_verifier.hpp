// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb::stdlib::recursion::honk {
class HypernovaDeciderVerifier {
  public:
    using Builder = bb::MegaCircuitBuilder;
    using Flavor = bb::MegaRecursiveFlavor_<Builder>;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using Transcript = Flavor::Transcript;
    using Proof = stdlib::Proof<Builder>;
    using PairingPoints = recursion::PairingPoints<Builder>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using ShpleminiVerifier = bb::ShpleminiVerifier_<Curve>;
    using PCS = Flavor::PCS;
    using Accumulator = recursion::honk::HypernovaFoldingVerifier::Accumulator;

    std::shared_ptr<Transcript> transcript;

    HypernovaDeciderVerifier(std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    PairingPoints verify_pcs_proof(Builder& builder, Accumulator& accumulator, const Proof& proof);
};
} // namespace bb::stdlib::recursion::honk

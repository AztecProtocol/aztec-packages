// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/hypernova/types.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"

namespace bb {

template <typename Flavor_> class HypernovaDeciderVerifier {
  public:
    using Flavor = Flavor_;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using Transcript = Flavor::Transcript;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using ShpleminiVerifier = bb::ShpleminiVerifier_<Curve>;
    using PCS = Flavor::PCS;
    using Accumulator = HypernovaFoldingVerifier<Flavor>::Accumulator;
    // Types conditionally assigned based on the Flavor being recursive
    using Proof = std::conditional_t<IsRecursiveFlavor<Flavor>,
                                     typename HypernovaRecursiveTypes::Proof,
                                     typename HypernovaNativeTypes::Proof>;
    using PairingPoints = std::conditional_t<IsRecursiveFlavor<Flavor>,
                                             typename HypernovaRecursiveTypes::PairingPoints,
                                             typename HypernovaNativeTypes::PairingPoints>;

    std::shared_ptr<Transcript> transcript;

    HypernovaDeciderVerifier(const std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    PairingPoints verify_proof(Accumulator& accumulator, const Proof& proof);
};
} // namespace bb

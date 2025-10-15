// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"

namespace bb {
class HypernovaDeciderProver {
  public:
    using Flavor = MegaFlavor;
    using Curve = Flavor::Curve;
    using Accumulator = HypernovaFoldingProver::Accumulator;
    using CommitmentKey = Flavor::CommitmentKey;
    using Transcript = Flavor::Transcript;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using ShpleminiProver = ShpleminiProver_<Curve>;

    std::shared_ptr<Transcript> transcript;

    HypernovaDeciderProver(std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    HonkProof construct_proof(const CommitmentKey& ck, Accumulator& accumulator);
};
} // namespace bb

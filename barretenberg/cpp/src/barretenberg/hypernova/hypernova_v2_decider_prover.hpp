#pragma once

#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_v2_flavor.hpp"
#include "barretenberg/hypernova/hypernova_v2_prover.hpp"

namespace bb {

/**
 * @brief HyperNova decider prover for MegaV2Flavor.
 *
 * @details Identical to HypernovaDeciderProver. Both use the same PCS (KZG) and
 * Accumulator type. Separate class for type safety with MegaV2Flavor.
 */
class HypernovaV2DeciderProver {
  public:
    using Flavor = MegaV2Flavor;
    using Curve = Flavor::Curve;
    using Accumulator = HypernovaV2FoldingProver::Accumulator;
    using CommitmentKey = Flavor::CommitmentKey;
    using Transcript = Flavor::Transcript;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using ShpleminiProver = ShpleminiProver_<Curve>;

    std::shared_ptr<Transcript> transcript;

    HypernovaV2DeciderProver(std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    HonkProof construct_proof(Accumulator& accumulator);
};
} // namespace bb

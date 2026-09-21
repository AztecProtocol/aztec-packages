#pragma once

#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"

namespace bb {
/**
 * @brief HyperNova decider verifier (native + recursive). Verifies final opening proof.
 * @details See: chonk/README.md#final-decider
 */
template <typename Flavor_> class HypernovaDeciderVerifier {
  public:
    using Flavor = Flavor_;
    static_assert(!Flavor::HasZK, "ZK flavors require propagating the Shplemini consistency verdict");
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using Transcript = Flavor::Transcript;
    using PCS = Flavor::PCS;
    using FoldingVerifier = HypernovaFoldingVerifier<IsRecursiveFlavor<Flavor>, typename Flavor::CircuitBuilder>;
    using Accumulator = FoldingVerifier::Accumulator;
    // Types conditionally assigned based on the Flavor being recursive
    using Proof = FoldingVerifier::Proof;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    std::shared_ptr<Transcript> transcript;

    HypernovaDeciderVerifier(const std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    PairingPoints verify_proof(Accumulator& accumulator, const Proof& proof);
};
} // namespace bb

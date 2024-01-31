#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/recursion/honk/transcript/transcript.hpp"

namespace bb::stdlib::recursion::goblin {
template <typename CircuitBuilder> class MergeRecursiveVerifier_ {
  public:
    using Curve = bn254<CircuitBuilder>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using GroupElement = typename Curve::Element;
    using KZG = ::bb::KZG<Curve>;
    using OpeningClaim = ::bb::OpeningClaim<Curve>;
    using PairingPoints = std::array<GroupElement, 2>;
    using Transcript = honk::Transcript<CircuitBuilder>;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;

    static constexpr size_t NUM_WIRES = UltraHonkArith<FF>::NUM_WIRES;

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder);

    PairingPoints verify_proof(const HonkProof& proof);
};

} // namespace bb::stdlib::recursion::goblin

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "commitment_key.test.hpp"

namespace bb {
class TestBn254Flavor {
  public:
    using Curve = curve::BN254;
    using CommitmentKey = CommitmentKey<Curve>;
    using Transcript = NativeTranscript;
    using FF = typename Curve::ScalarField;
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
};

class TestGrumpkinFlavor {
  public:
    using Curve = curve::Grumpkin;
    using CommitmentKey = CommitmentKey<Curve>;
    using Transcript = NativeTranscript;
    using FF = typename Curve::ScalarField;
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
};
} // namespace bb
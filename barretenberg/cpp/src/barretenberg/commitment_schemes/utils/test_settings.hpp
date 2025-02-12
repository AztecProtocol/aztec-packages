#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
/**
 * @brief Mock Flavors to use ZKSumcheckData and SmallSubgroupIPAProver in the PCS tests.
 *
 */
class BN254Settings {
  public:
    using Curve = curve::BN254;
    using CommitmentKey = bb::CommitmentKey<curve::BN254>;
    using Transcript = NativeTranscript;
    using FF = typename Curve::ScalarField;
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
};

class GrumpkinSettings {
  public:
    using Curve = curve::Grumpkin;
    using CommitmentKey = bb::CommitmentKey<curve::Grumpkin>;
    using Transcript = NativeTranscript;
    using FF = typename Curve::ScalarField;
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
};
} // namespace bb
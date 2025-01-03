#pragma once

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <vector>

namespace bb {
class TestFlavor {
    using Curve = curve::BN254;
    using CommitmentKey = CommitmentKey<Curve>;
    using Transcript = NativeTranscript;
}

} // namespace bb

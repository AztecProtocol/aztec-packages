#pragma once

#include <array>
#include <cstdint>

namespace bb {
// An aggregation state is represented by two G1 affine elements. Each G1 point has
// two field element coordinates (x, y). Thus, four base field elements
// Four limbs are used when simulating a non-native field using the bigfield class, so 16 total field elements.
static constexpr uint32_t PAIRING_POINT_ACCUMULATOR_SIZE = 16;
// PairingPointAccumulatorIndices represents an array of 16 witness indices pointing to the nested aggregation object.
using PairingPointAccumulatorIndices = std::array<uint32_t, PAIRING_POINT_ACCUMULATOR_SIZE>;
// PairingPointAccumulatorPubInputIndices represents an array of 16 public input indices pointing to the witness indices
// of the nested aggregation object.
using PairingPointAccumulatorPubInputIndices = std::array<uint32_t, PAIRING_POINT_ACCUMULATOR_SIZE>;

static constexpr uint32_t IPA_CLAIM_SIZE = 10;
using IPAClaimIndices = std::array<uint32_t, IPA_CLAIM_SIZE>;
using IPAClaimPubInputIndices = std::array<uint32_t, IPA_CLAIM_SIZE>;
} // namespace bb
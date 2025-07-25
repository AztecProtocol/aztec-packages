// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <array>
#include <cstdint>

namespace bb {
// An aggregation state is represented by two G1 affine elements. Each G1 point has
// two field element coordinates (x, y). Thus, four base field elements
// Four limbs are used when simulating a non-native field using the bigfield class, so 16 total field elements.
static constexpr uint32_t PAIRING_POINTS_SIZE = 16;

static constexpr uint32_t IPA_CLAIM_SIZE = 10; // Size public inputs representaiton of a Grumpkin opening claim
} // namespace bb

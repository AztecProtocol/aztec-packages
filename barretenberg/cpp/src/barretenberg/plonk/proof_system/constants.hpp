#pragma once
#include <cstdint>

namespace proof_system::plonk {

// limb size when simulating a non-native field using bigfield class
// (needs to be a universal constant to be used by native verifier)
static constexpr uint64_t NUM_LIMB_BITS_IN_FIELD_SIMULATION = 68;
static constexpr uint32_t NUM_QUOTIENT_PARTS = 4;
} // namespace proof_system::plonk

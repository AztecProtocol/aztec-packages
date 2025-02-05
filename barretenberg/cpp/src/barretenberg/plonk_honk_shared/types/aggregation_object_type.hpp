// WORKTODO: rename file
#pragma once

#include <array>
#include <cstdint>

namespace bb {
// An aggregation state is represented by two G1 affine elements. Each G1 point has
// two field element coordinates (x, y). Thus, four base field elements
// Four limbs are used when simulating a non-native field using the bigfield class, so 16 total field elements.
static constexpr uint32_t KZG_ACCUMULATOR_NUM_LIMBS = 16;
// KZGAccumulatorWitnessIndices: the witness indices of the 16 limbs defining the BN254 accumulator
using KZGAccumulatorWitnessIndices = std::array<uint32_t, KZG_ACCUMULATOR_NUM_LIMBS>;
// KZGAccumulatorIndicesInPublicInputs: when the elements of KZGAccumulatorWitnessIndices are placed in the
// public inputs, the indices within the public inputs of those indices are recorded here.
// WORKTODO: only used to extract the nested aggregation from the public inputs?
// RECURSIVE: Strategy: separate this from PIs, pass around with inaccessible default value or use optional or something
using KZGAccumulatorIndicesInPublicInputs = std::array<uint32_t, KZG_ACCUMULATOR_NUM_LIMBS>;

static constexpr uint32_t IPA_ACCUMULATOR_NUM_LIMBS = 10;
using IPAAccumulatorWitnessIndices = std::array<uint32_t, IPA_ACCUMULATOR_NUM_LIMBS>;
using IPAAccumulatorIndicesInPublicInputs = std::array<uint32_t, IPA_ACCUMULATOR_NUM_LIMBS>;
} // namespace bb
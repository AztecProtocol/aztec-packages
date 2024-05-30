#pragma once

#include <array>
#include <cstdint>

namespace bb {
constexpr uint32_t AGGREGATION_OBJECT_SIZE = 16;
using AggregationObjectIndices = std::array<uint32_t, AGGREGATION_OBJECT_SIZE>;
using AggregationObjectPubInputIndices = std::array<uint32_t, AGGREGATION_OBJECT_SIZE>;
} // namespace bb
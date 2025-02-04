#pragma once

#include <cstdint>

namespace bb::avm2 {

constexpr uint32_t CIRCUIT_SUBGROUP_SIZE = 1 << 21;

// Also used for op_id in the circuit trace
enum class BitwiseOperation : uint8_t {
    AND = 0,
    OR = 1,
    XOR = 2,
};

} // namespace bb::avm2
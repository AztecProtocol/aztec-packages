#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {

constexpr uint32_t CIRCUIT_SUBGROUP_SIZE = 1 << 21;

// Also used for op_id in the circuit trace
enum class BitwiseOperation : uint8_t {
    AND = AVM_BITWISE_AND_OP_ID,
    OR = AVM_BITWISE_OR_OP_ID,
    XOR = AVM_BITWISE_XOR_OP_ID,
};

} // namespace bb::avm2

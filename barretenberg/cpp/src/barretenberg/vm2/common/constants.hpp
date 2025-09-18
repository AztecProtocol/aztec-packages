#pragma once

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {

constexpr std::size_t MAX_AVM_TRACE_LOG_SIZE = 21;
constexpr std::size_t MAX_AVM_TRACE_SIZE = 1 << MAX_AVM_TRACE_LOG_SIZE;

// Also used for op_id in the circuit trace
enum class BitwiseOperation : uint8_t {
    AND = AVM_BITWISE_AND_OP_ID,
    OR = AVM_BITWISE_OR_OP_ID,
    XOR = AVM_BITWISE_XOR_OP_ID,
};

} // namespace bb::avm2

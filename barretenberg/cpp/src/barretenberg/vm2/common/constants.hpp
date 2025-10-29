#pragma once

#include <cstddef>
#include <cstdint>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
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

constexpr uint256_t MASK_128 = (static_cast<uint256_t>(1) << 128) - 1;
constexpr uint128_t MASK_64 = (static_cast<uint128_t>(1) << 64) - 1;

} // namespace bb::avm2

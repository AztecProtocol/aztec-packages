#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::avm2 {

constexpr std::size_t MAX_AVM_TRACE_LOG_SIZE = 21;
constexpr std::size_t MAX_AVM_TRACE_SIZE = 1 << MAX_AVM_TRACE_LOG_SIZE;

// Exact number of rows used by each AVM public input column. Column 0 spans the full table;
// columns 1-3 are shorter, so the recursive verifier avoids hashing / MLE-evaluating their
// trailing zeros. Sourced from the generated per-column constants (see constants.nr).
constexpr std::array<std::size_t, AVM_NUM_PUBLIC_INPUT_COLUMNS> AVM_PUBLIC_INPUTS_COLUMN_LENGTHS = {
    AVM_PUBLIC_INPUTS_COLUMN_0_LENGTH,
    AVM_PUBLIC_INPUTS_COLUMN_1_LENGTH,
    AVM_PUBLIC_INPUTS_COLUMN_2_LENGTH,
    AVM_PUBLIC_INPUTS_COLUMN_3_LENGTH,
};

// Also used for op_id in the circuit trace
enum class BitwiseOperation : uint8_t {
    AND = AVM_BITWISE_AND_OP_ID,
    OR = AVM_BITWISE_OR_OP_ID,
    XOR = AVM_BITWISE_XOR_OP_ID,
};

constexpr uint256_t MASK_128 = (static_cast<uint256_t>(1) << 128) - 1;
constexpr uint128_t MASK_64 = (static_cast<uint128_t>(1) << 64) - 1;

} // namespace bb::avm2

#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Event emitted during bitwise operation simulation for trace generation.
 *
 * Captures the inputs, operation type, and result of a bitwise AND/OR/XOR operation.
 * Emitted on both success and error paths (on error, res defaults to 0).
 * Consumed by BitwiseTraceBuilder::process() to populate the bitwise subtrace.
 */
struct BitwiseEvent {
    BitwiseOperation operation;                              ///< The bitwise operation (AND, OR, or XOR).
    MemoryValue a = MemoryValue::from_tag(MemoryTag::FF, 0); ///< Left operand (tagged memory value).
    MemoryValue b = MemoryValue::from_tag(MemoryTag::FF, 0); ///< Right operand (tagged memory value).
    uint128_t res = 0; ///< Result of the operation. Defaults to 0 (used on error paths).
    /// True for a keccak SIMD-64 operation: a and b are U128 values each packing two independent U64
    /// lanes (lane 0 = low 64 bits, lane 1 = high 64 bits) and res packs the two U64 results the same way.
    bool simd_64 = false;

    /// @brief Key type for deduplication (operation, input_a, input_b, simd_64). simd_64 is part of
    /// the key so a SIMD row never deduplicates with a differently-shaped scalar row on the same operands.
    using Key = std::tuple<BitwiseOperation, MemoryValue, MemoryValue, bool>;
    Key get_key() const { return { operation, a, b, simd_64 }; }

    bool operator==(const BitwiseEvent& other) const = default;
};

} // namespace bb::avm2::simulation

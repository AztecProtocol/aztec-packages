#pragma once
#include <cstddef>

namespace acir_format {

/**
 * @brief Limits for msgpack deserialization to prevent memory exhaustion and invalid memory access.
 *
 * These constants define the maximum sizes allowed during msgpack unpacking.
 */
struct MsgpackLimits {
    static constexpr size_t MAX_ARRAY = 200'000'000;  // 200M elements (supports large circuits)
    static constexpr size_t MAX_MAP = 200'000'000;    // 200M elements
    static constexpr size_t MAX_STR = 100'000'000;    // 100MB
    static constexpr size_t MAX_BIN = 100'000'000;    // 100MB
    static constexpr size_t MAX_EXT = 100'000'000;    // 100MB
    static constexpr size_t MAX_DEPTH = 15;           // 15 levels of nesting
};

} // namespace acir_format

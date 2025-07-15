#pragma once

#include <cstdint>
#include <optional>
#include <unordered_map>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

enum class SubtraceSel : uint8_t {
    ALU,
    BITWISE,
    TORADIXBE,
    POSEIDON2PERM,
    ECC,
    DATACOPY,
    EXECUTION,
    KECCAKF1600,
    GETCONTRACTINSTANCE,
};

struct SubtraceInfo {
    SubtraceSel subtrace_selector;
    uint128_t subtrace_operation_id;
};

extern const std::unordered_map<ExecutionOpCode, SubtraceInfo> SUBTRACE_INFO_MAP;

/**
 * @brief Get the subtrace ID for a given subtrace enum.
 *
 * @param subtrace_sel The subtrace enum.
 * @return The corresponding subtrace ID.
 */
FF get_subtrace_id(SubtraceSel subtrace_sel);

/**
 * @brief Get the column selector for a given subtrace selector.
 *
 * @param subtrace_sel The subtrace selector.
 * @return The corresponding column selector.
 */
Column get_subtrace_selector(SubtraceSel subtrace_sel);

/**
 * @brief Get the column selector for a given dynamic gas ID.
 *
 * @param dyn_gas_id The dynamic gas ID.
 * @return The corresponding column selector.
 */
Column get_dyn_gas_selector(uint32_t dyn_gas_id);

} // namespace bb::avm2::tracegen

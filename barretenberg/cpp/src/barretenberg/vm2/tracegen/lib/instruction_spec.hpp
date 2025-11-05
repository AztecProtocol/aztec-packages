#pragma once

#include <cstdint>
#include <optional>
#include <unordered_map>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

// Follows the order of the subtrace IDs (AVM_SUBTRACE_ID_*) in the constants_gen.pil file
enum class SubtraceSel : uint8_t {
    EXECUTION,
    ALU,
    BITWISE,
    CAST,
    CALLDATACOPY,
    RETURNDATACOPY,
    SET,
    GETCONTRACTINSTANCE,
    EMITUNENCRYPTEDLOG,
    POSEIDON2PERM,
    SHA256COMPRESSION,
    KECCAKF1600,
    ECC,
    TORADIXBE,
    MAX = TORADIXBE, // Keep this at the end. Serves looping over all values.
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

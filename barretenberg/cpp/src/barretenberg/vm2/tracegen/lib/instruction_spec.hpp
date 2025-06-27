#pragma once

#include <cstdint>
#include <optional>
#include <unordered_map>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

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
};

struct SubtraceInfo {
    SubtraceSel subtrace_selector;
    uint128_t subtrace_operation_id;
};

extern const std::unordered_map<ExecutionOpCode, SubtraceInfo> SUBTRACE_INFO_MAP;

} // namespace bb::avm2::tracegen

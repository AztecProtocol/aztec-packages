#pragma once

#include <cstdint>

namespace bb::avm_trace {

enum class AvmError : uint32_t {
    NO_ERROR,
    REVERT_OPCODE,
    INVALID_PROGRAM_COUNTER,
    INVALID_OPCODE,
    INVALID_TAG_VALUE,
    CHECK_TAG_ERROR,
    ADDR_RES_TAG_ERROR,
    REL_ADDR_OUT_OF_RANGE,
    DIV_ZERO,
    PARSING_ERROR,
    ENV_VAR_UNKNOWN,
    CONTRACT_INST_MEM_UNKNOWN,
    RADIX_OUT_OF_BOUNDS,
    DUPLICATE_NULLIFIER,
    SIDE_EFFECT_LIMIT_REACHED,
    OUT_OF_GAS,
    STATIC_CALL_ALTERATION
};

} // namespace bb::avm_trace

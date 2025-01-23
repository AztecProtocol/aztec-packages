#pragma once

#include <ostream>
#include <string>

namespace bb::avm2 {

enum class WireOpCode {
    // Compute
    ADD_8,
    ADD_16,
    SUB_8,
    SUB_16,
    MUL_8,
    MUL_16,
    DIV_8,
    DIV_16,
    FDIV_8,
    FDIV_16,
    EQ_8,
    EQ_16,
    LT_8,
    LT_16,
    LTE_8,
    LTE_16,
    AND_8,
    AND_16,
    OR_8,
    OR_16,
    XOR_8,
    XOR_16,
    NOT_8,
    NOT_16,
    SHL_8,
    SHL_16,
    SHR_8,
    SHR_16,
    CAST_8,
    CAST_16,

    // Execution Environment
    GETENVVAR_16,
    // Execution Environment - Calldata
    CALLDATACOPY,
    RETURNDATASIZE,
    RETURNDATACOPY,

    // Machine State
    // Machine State - Internal Control Flow
    JUMP_32,
    JUMPI_32,
    INTERNALCALL,
    INTERNALRETURN,
    // Machine State - Memory
    SET_8,
    SET_16,
    SET_32,
    SET_64,
    SET_128,
    SET_FF,
    MOV_8,
    MOV_16,

    // World State
    SLOAD,           // Public Storage
    SSTORE,          // Public Storage
    NOTEHASHEXISTS,  // Notes & Nullifiers
    EMITNOTEHASH,    // Notes & Nullifiers
    NULLIFIEREXISTS, // Notes & Nullifiers
    EMITNULLIFIER,   // Notes & Nullifiers
    L1TOL2MSGEXISTS, // Messages
    GETCONTRACTINSTANCE,

    // Accrued Substate
    EMITUNENCRYPTEDLOG,
    SENDL2TOL1MSG, // Messages

    // Control Flow - Contract Calls
    CALL,
    STATICCALL,
    RETURN,
    REVERT_8,
    REVERT_16,

    // Misc
    DEBUGLOG,

    // Gadgets
    POSEIDON2PERM,
    SHA256COMPRESSION,
    KECCAKF1600,
    ECADD,
    MSM,
    // Conversions
    TORADIXBE,

    // Sentinel
    LAST_OPCODE_SENTINEL,
};

std::ostream& operator<<(std::ostream& os, const WireOpCode& op);

// List of opcodes that can be executed.
// This is like WireOpCode but without the variants.
// Order doesn't really matter as long as it's in sync with the circuit.
enum class ExecutionOpCode {
    ADD,
    SET,
    MOV,
    CALL,
    JUMP,
    JUMPI,
    RETURN,
};

std::ostream& operator<<(std::ostream& os, const ExecutionOpCode& op);

} // namespace bb::avm2
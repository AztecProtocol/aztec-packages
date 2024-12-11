#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"

#include <concepts>
#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <sstream>
#include <string>

namespace bb::avm_trace {

/**
 * All AVM opcodes (Keep in sync with TS counterpart code opcodes.ts)
 * TODO: Once opcode values are definitive, we should assign them explicitly in the enum below
 *       and typescript code. This would increase robustness against unintended modifications.
 *       i.e.: ADD = 0, SUB = 1, etc, ....
 * CAUTION: Any change in the list below needs to be carefully followed by
 *          a potential adaptation of Bytecode::is_valid method.
 */
enum class OpCode : uint8_t {
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

enum class EnvironmentVariable {
    ADDRESS,
    SENDER,
    TRANSACTIONFEE,
    CHAINID,
    VERSION,
    BLOCKNUMBER,
    TIMESTAMP,
    FEEPERL2GAS,
    FEEPERDAGAS,
    ISSTATICCALL,
    L2GASLEFT,
    DAGASLEFT,
    // sentinel
    MAX_ENV_VAR
};

enum class ContractInstanceMember {
    DEPLOYER,
    CLASS_ID,
    INIT_HASH,
    // sentinel
    MAX_MEMBER,
};

class Bytecode {
  public:
    static bool is_valid(uint8_t byte);
};

std::string to_hex(OpCode opcode);

std::string to_string(OpCode opcode);

} // namespace bb::avm_trace

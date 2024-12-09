#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"

namespace bb::avm_trace {

/**
 * @brief Test whether a given byte represents a valid opcode.
 *
 * @param byte The input byte.
 * @return A boolean telling whether a corresponding opcode does match the input byte.
 */
bool Bytecode::is_valid(const uint8_t byte)
{
    return byte < static_cast<uint8_t>(OpCode::LAST_OPCODE_SENTINEL);
}

std::string to_hex(OpCode opcode)
{
    return to_hex(static_cast<uint8_t>(opcode));
}

// Utility function to print the string represenatation of an opcode
std::string to_string(OpCode opcode)
{
    switch (opcode) {
    // Compute
    case OpCode::ADD_8:
        return "ADD_8";
    case OpCode::ADD_16:
        return "ADD_16";
    case OpCode::SUB_8:
        return "SUB_8";
    case OpCode::SUB_16:
        return "SUB_16";
    case OpCode::MUL_8:
        return "MUL_8";
    case OpCode::MUL_16:
        return "MUL_16";
    case OpCode::DIV_8:
        return "DIV_8";
    case OpCode::DIV_16:
        return "DIV_16";
    case OpCode::FDIV_8:
        return "FDIV_8";
    case OpCode::FDIV_16:
        return "FDIV_16";
    case OpCode::EQ_8:
        return "EQ_8";
    case OpCode::EQ_16:
        return "EQ_16";
    case OpCode::LT_8:
        return "LT_8";
    case OpCode::LT_16:
        return "LT_16";
    case OpCode::LTE_8:
        return "LTE_8";
    case OpCode::LTE_16:
        return "LTE_16";
    case OpCode::AND_8:
        return "AND_8";
    case OpCode::AND_16:
        return "AND_16";
    case OpCode::OR_8:
        return "OR_8";
    case OpCode::OR_16:
        return "OR_16";
    case OpCode::XOR_8:
        return "XOR_8";
    case OpCode::XOR_16:
        return "XOR_16";
    case OpCode::NOT_8:
        return "NOT_8";
    case OpCode::NOT_16:
        return "NOT_16";
    case OpCode::SHL_8:
        return "SHL_8";
    case OpCode::SHL_16:
        return "SHL_16";
    case OpCode::SHR_8:
        return "SHR_8";
    case OpCode::SHR_16:
        return "SHR_16";
    // Compute - Type Conversions
    case OpCode::CAST_8:
        return "CAST_8";
    case OpCode::CAST_16:
        return "CAST_16";
    // Execution Environment
    case OpCode::GETENVVAR_16:
        return "GETENVVAR_16";
    // Execution Environment - Calldata
    case OpCode::CALLDATACOPY:
        return "CALLDATACOPY";
    case OpCode::RETURNDATASIZE:
        return "RETURNDATASIZE";
    case OpCode::RETURNDATACOPY:
        return "RETURNDATACOPY";
    // Machine State
    // Machine State - Internal Control Flow
    case OpCode::JUMP_32:
        return "JUMP_32";
    case OpCode::JUMPI_32:
        return "JUMPI_32";
    case OpCode::INTERNALCALL:
        return "INTERNALCALL";
    case OpCode::INTERNALRETURN:
        return "INTERNALRETURN";
    // Machine State - Memory
    case OpCode::SET_8:
        return "SET_8";
    case OpCode::SET_16:
        return "SET_16";
    case OpCode::SET_32:
        return "SET_32";
    case OpCode::SET_64:
        return "SET_64";
    case OpCode::SET_128:
        return "SET_128";
    case OpCode::SET_FF:
        return "SET_FF";
    case OpCode::MOV_8:
        return "MOV_8";
    case OpCode::MOV_16:
        return "MOV_16";
    // World State
    case OpCode::SLOAD:
        return "SLOAD";
    case OpCode::SSTORE:
        return "SSTORE";
    case OpCode::NOTEHASHEXISTS:
        return "NOTEHASHEXISTS";
    case OpCode::EMITNOTEHASH:
        return "EMITNOTEHASH";
    case OpCode::NULLIFIEREXISTS:
        return "NULLIFIEREXISTS";
    case OpCode::EMITNULLIFIER:
        return "EMITNULLIFIER";
    case OpCode::L1TOL2MSGEXISTS:
        return "L1TOL2MSGEXISTS";
    case OpCode::GETCONTRACTINSTANCE:
        return "GETCONTRACTINSTANCE";
    // Accrued Substate
    case OpCode::EMITUNENCRYPTEDLOG:
        return "EMITUNENCRYPTEDLOG";
    case OpCode::SENDL2TOL1MSG:
        return "SENDL2TOL1MSG";
    // Control Flow - Contract Calls
    case OpCode::CALL:
        return "CALL";
    case OpCode::STATICCALL:
        return "STATICCALL";
    case OpCode::RETURN:
        return "RETURN";
    case OpCode::REVERT_8:
        return "REVERT_8";
    case OpCode::REVERT_16:
        return "REVERT_16";
    // Misc
    case OpCode::DEBUGLOG:
        return "DEBUGLOG";
    // Gadgets
    case OpCode::POSEIDON2PERM:
        return "POSEIDON2";
    case OpCode::SHA256COMPRESSION:
        return "SHA256COMPRESSION";
    case OpCode::KECCAKF1600:
        return "KECCAKF1600";
    case OpCode::ECADD:
        return "ECADD";
    case OpCode::MSM:
        return "MSM";
    // Conversions
    case OpCode::TORADIXBE:
        return "TORADIXBE";
    // Sentinel
    case OpCode::LAST_OPCODE_SENTINEL:
        return "LAST_OPCODE_SENTINEL";
    default:
        return "UNKNOWN";
    }
}

} // namespace bb::avm_trace

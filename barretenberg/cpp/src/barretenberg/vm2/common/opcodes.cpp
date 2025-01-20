#include "barretenberg/vm2/common/opcodes.hpp"

#include <ostream>
#include <string>

namespace bb::avm2 {

std::ostream& operator<<(std::ostream& os, const WireOpCode& op)
{
    switch (op) {
    case WireOpCode::ADD_8:
        os << "ADD_8";
        break;
    case WireOpCode::ADD_16:
        os << "ADD_16";
        break;
    case WireOpCode::SUB_8:
        os << "SUB_8";
        break;
    case WireOpCode::SUB_16:
        os << "SUB_16";
        break;
    case WireOpCode::MUL_8:
        os << "MUL_8";
        break;
    case WireOpCode::MUL_16:
        os << "MUL_16";
        break;
    case WireOpCode::DIV_8:
        os << "DIV_8";
        break;
    case WireOpCode::DIV_16:
        os << "DIV_16";
        break;
    case WireOpCode::FDIV_8:
        os << "FDIV_8";
        break;
    case WireOpCode::FDIV_16:
        os << "FDIV_16";
        break;
    case WireOpCode::EQ_8:
        os << "EQ_8";
        break;
    case WireOpCode::EQ_16:
        os << "EQ_16";
        break;
    case WireOpCode::LT_8:
        os << "LT_8";
        break;
    case WireOpCode::LT_16:
        os << "LT_16";
        break;
    case WireOpCode::LTE_8:
        os << "LTE_8";
        break;
    case WireOpCode::LTE_16:
        os << "LTE_16";
        break;
    case WireOpCode::AND_8:
        os << "AND_8";
        break;
    case WireOpCode::AND_16:
        os << "AND_16";
        break;
    case WireOpCode::OR_8:
        os << "OR_8";
        break;
    case WireOpCode::OR_16:
        os << "OR_16";
        break;
    case WireOpCode::XOR_8:
        os << "XOR_8";
        break;
    case WireOpCode::XOR_16:
        os << "XOR_16";
        break;
    case WireOpCode::NOT_8:
        os << "NOT_8";
        break;
    case WireOpCode::NOT_16:
        os << "NOT_16";
        break;
    case WireOpCode::SHL_8:
        os << "SHL_8";
        break;
    case WireOpCode::SHL_16:
        os << "SHL_16";
        break;
    case WireOpCode::SHR_8:
        os << "SHR_8";
        break;
    case WireOpCode::SHR_16:
        os << "SHR_16";
        break;
    case WireOpCode::CAST_8:
        os << "CAST_8";
        break;
    case WireOpCode::CAST_16:
        os << "CAST_16";
        break;
    case WireOpCode::GETENVVAR_16:
        os << "GETENVVAR_16";
        break;
    case WireOpCode::CALLDATACOPY:
        os << "CALLDATACOPY";
        break;
    case WireOpCode::RETURNDATASIZE:
        os << "RETURNDATASIZE";
        break;
    case WireOpCode::RETURNDATACOPY:
        os << "RETURNDATACOPY";
        break;
    case WireOpCode::JUMP_32:
        os << "JUMP_32";
        break;
    case WireOpCode::JUMPI_32:
        os << "JUMPI_32";
        break;
    case WireOpCode::INTERNALCALL:
        os << "INTERNALCALL";
        break;
    case WireOpCode::INTERNALRETURN:
        os << "INTERNALRETURN";
        break;
    case WireOpCode::SET_8:
        os << "SET_8";
        break;
    case WireOpCode::SET_16:
        os << "SET_16";
        break;
    case WireOpCode::SET_32:
        os << "SET_32";
        break;
    case WireOpCode::SET_64:
        os << "SET_64";
        break;
    case WireOpCode::SET_128:
        os << "SET_128";
        break;
    case WireOpCode::SET_FF:
        os << "SET_FF";
        break;
    case WireOpCode::MOV_8:
        os << "MOV_8";
        break;
    case WireOpCode::MOV_16:
        os << "MOV_16";
        break;
    case WireOpCode::SLOAD:
        os << "SLOAD";
        break;
    case WireOpCode::SSTORE:
        os << "SSTORE";
        break;
    case WireOpCode::NOTEHASHEXISTS:
        os << "NOTEHASHEXISTS";
        break;
    case WireOpCode::EMITNOTEHASH:
        os << "EMITNOTEHASH";
        break;
    case WireOpCode::NULLIFIEREXISTS:
        os << "NULLIFIEREXISTS";
        break;
    case WireOpCode::EMITNULLIFIER:
        os << "EMITNULLIFIER";
        break;
    case WireOpCode::L1TOL2MSGEXISTS:
        os << "L1TOL2MSGEXISTS";
        break;
    case WireOpCode::GETCONTRACTINSTANCE:
        os << "GETCONTRACTINSTANCE";
        break;
    case WireOpCode::EMITUNENCRYPTEDLOG:
        os << "EMITUNENCRYPTEDLOG";
        break;
    case WireOpCode::SENDL2TOL1MSG:
        os << "SENDL2TOL1MSG";
        break;
    case WireOpCode::CALL:
        os << "CALL";
        break;
    case WireOpCode::STATICCALL:
        os << "STATICCALL";
        break;
    case WireOpCode::RETURN:
        os << "RETURN";
        break;
    case WireOpCode::REVERT_8:
        os << "REVERT_8";
        break;
    case WireOpCode::REVERT_16:
        os << "REVERT_16";
        break;
    case WireOpCode::DEBUGLOG:
        os << "DEBUGLOG";
        break;
    case WireOpCode::POSEIDON2PERM:
        os << "POSEIDON2PERM";
        break;
    case WireOpCode::SHA256COMPRESSION:
        os << "SHA256COMPRESSION";
        break;
    case WireOpCode::KECCAKF1600:
        os << "KECCAKF1600";
        break;
    case WireOpCode::ECADD:
        os << "ECADD";
        break;
    case WireOpCode::MSM:
        os << "MSM";
        break;
    case WireOpCode::TORADIXBE:
        os << "TORADIXBE";
        break;
    case WireOpCode::LAST_OPCODE_SENTINEL:
        os << "LAST_OPCODE_SENTINEL";
        break;
    }
    return os;
}

std::ostream& operator<<(std::ostream& os, const ExecutionOpCode& op)
{
    switch (op) {
    case ExecutionOpCode::ADD:
        os << "ADD";
        break;
    case ExecutionOpCode::SET:
        os << "SET";
        break;
    case ExecutionOpCode::MOV:
        os << "MOV";
        break;
    case ExecutionOpCode::CALL:
        os << "CALL";
        break;
    case ExecutionOpCode::JUMP:
        os << "JUMP";
        break;
    case ExecutionOpCode::JUMPI:
        os << "JUMPI";
        break;
    case ExecutionOpCode::RETURN:
        os << "RETURN";
        break;
    }
    return os;
}

} // namespace bb::avm2
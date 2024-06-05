#include "barretenberg/vm/avm_trace/avm_opcode.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"

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
    case OpCode::ADD:
        return "ADD";
    case OpCode::SUB:
        return "SUB";
    case OpCode::MUL:
        return "MUL";
    case OpCode::DIV:
        return "DIV";
    case OpCode::FDIV:
        return "FDIV";
    case OpCode::EQ:
        return "EQ";
    case OpCode::LT:
        return "LT";
    case OpCode::LTE:
        return "LTE";
    case OpCode::AND:
        return "AND";
    case OpCode::OR:
        return "OR";
    case OpCode::XOR:
        return "XOR";
    case OpCode::NOT:
        return "NOT";
    case OpCode::SHL:
        return "SHL";
    case OpCode::SHR:
        return "SHR";
    case OpCode::CAST:
        return "CAST";
    case OpCode::ADDRESS:
        return "ADDRESS";
    case OpCode::STORAGEADDRESS:
        return "STORAGEADDRESS";
    case OpCode::SENDER:
        return "SENDER";
    case OpCode::FEEPERL2GAS:
        return "FEEPERL2GAS";
    case OpCode::FEEPERDAGAS:
        return "FEEPERDAGAS";
    case OpCode::TRANSACTIONFEE:
        return "TRANSACTIONFEE";
    case OpCode::CONTRACTCALLDEPTH:
        return "CONTRACTCALLDEPTH";
    case OpCode::CHAINID:
        return "CHAINID";
    case OpCode::VERSION:
        return "VERSION";
    case OpCode::BLOCKNUMBER:
        return "BLOCKNUMBER";
    case OpCode::TIMESTAMP:
        return "TIMESTAMP";
    case OpCode::COINBASE:
        return "COINBASE";
    case OpCode::BLOCKL2GASLIMIT:
        return "BLOCKL2GASLIMIT";
    case OpCode::BLOCKDAGASLIMIT:
        return "BLOCKDAGASLIMIT";
    case OpCode::CALLDATACOPY:
        return "CALLDATACOPY";
    case OpCode::L2GASLEFT:
        return "L2GASLEFT";
    case OpCode::DAGASLEFT:
        return "DAGASLEFT";
    case OpCode::JUMP:
        return "JUMP";
    case OpCode::JUMPI:
        return "JUMPI";
    case OpCode::INTERNALCALL:
        return "INTERNALCALL";
    case OpCode::INTERNALRETURN:
        return "INTERNALRETURN";
    case OpCode::SET:
        return "SET";
    case OpCode::MOV:
        return "MOV";
    case OpCode::CMOV:
        return "CMOV";
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
    case OpCode::HEADERMEMBER:
        return "HEADERMEMBER";
    case OpCode::GETCONTRACTINSTANCE:
        return "GETCONTRACTINSTANCE";
    case OpCode::EMITUNENCRYPTEDLOG:
        return "EMITUNENCRYPTEDLOG";
    case OpCode::SENDL2TOL1MSG:
        return "SENDL2TOL1MSG";
    case OpCode::CALL:
        return "CALL";
    case OpCode::STATICCALL:
        return "STATICCALL";
    case OpCode::DELEGATECALL:
        return "DELEGATECALL";
    case OpCode::RETURN:
        return "RETURN";
    case OpCode::REVERT:
        return "REVERT";
    case OpCode::DEBUGLOG:
        return "DEBUGLOG";
    case OpCode::KECCAK:
        return "KECCAK";
    case OpCode::POSEIDON2:
        return "POSEIDON2";
    case OpCode::SHA256:
        return "SHA256";
    case OpCode::PEDERSEN:
        return "PEDERSEN";
    case OpCode::TORADIXLE:
        return "TORADIXLE";
    case OpCode::SHA256COMPRESSION:
        return "SHA256COMPRESSION";
    case OpCode::KECCAKF1600:
        return "KECCAKF1600";
    case OpCode::LAST_OPCODE_SENTINEL:
        return "LAST_OPCODE_SENTINEL";
    default:
        return "UNKNOWN";
    }
}

} // namespace bb::avm_trace

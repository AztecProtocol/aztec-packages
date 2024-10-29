#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <set>
#include <string>
#include <vector>

namespace bb::avm_trace {

namespace {

const std::vector<OperandType> three_operand_format8 = {
    OperandType::INDIRECT8,
    OperandType::UINT8,
    OperandType::UINT8,
    OperandType::UINT8,
};
const std::vector<OperandType> three_operand_format16 = {
    OperandType::INDIRECT8,
    OperandType::UINT16,
    OperandType::UINT16,
    OperandType::UINT16,
};
const std::vector<OperandType> kernel_input_operand_format = { OperandType::INDIRECT8, OperandType::UINT16 };

const std::vector<OperandType> external_call_format = { OperandType::INDIRECT16,
                                                        /*gasOffset=*/OperandType::UINT16,
                                                        /*addrOffset=*/OperandType::UINT16,
                                                        /*argsOffset=*/OperandType::UINT16,
                                                        /*argsSize=*/OperandType::UINT16,
                                                        /*successOffset=*/OperandType::UINT16 };

// Contrary to TS, the format does not contain the opcode byte which prefixes any instruction.
// The format for OpCode::SET has to be handled separately as it is variable based on the tag.
const std::unordered_map<OpCode, std::vector<OperandType>> OPCODE_WIRE_FORMAT = {
    // Compute
    // Compute - Arithmetic
    { OpCode::ADD_8, three_operand_format8 },
    { OpCode::ADD_16, three_operand_format16 },
    { OpCode::SUB_8, three_operand_format8 },
    { OpCode::SUB_16, three_operand_format16 },
    { OpCode::MUL_8, three_operand_format8 },
    { OpCode::MUL_16, three_operand_format16 },
    { OpCode::DIV_8, three_operand_format8 },
    { OpCode::DIV_16, three_operand_format16 },
    { OpCode::FDIV_8, three_operand_format8 },
    { OpCode::FDIV_16, three_operand_format16 },
    // Compute - Comparison
    { OpCode::EQ_8, three_operand_format8 },
    { OpCode::EQ_16, three_operand_format16 },
    { OpCode::LT_8, three_operand_format8 },
    { OpCode::LT_16, three_operand_format16 },
    { OpCode::LTE_8, three_operand_format8 },
    { OpCode::LTE_16, three_operand_format16 },
    // Compute - Bitwise
    { OpCode::AND_8, three_operand_format8 },
    { OpCode::AND_16, three_operand_format16 },
    { OpCode::OR_8, three_operand_format8 },
    { OpCode::OR_16, three_operand_format16 },
    { OpCode::XOR_8, three_operand_format8 },
    { OpCode::XOR_16, three_operand_format16 },
    { OpCode::NOT_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { OpCode::NOT_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::SHL_8, three_operand_format8 },
    { OpCode::SHL_16, three_operand_format16 },
    { OpCode::SHR_8, three_operand_format8 },
    { OpCode::SHR_16, three_operand_format16 },
    // Compute - Type Conversions
    { OpCode::CAST_8, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT8, OperandType::UINT8 } },
    { OpCode::CAST_16, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT16, OperandType::UINT16 } },

    // Execution Environment - Globals
    { OpCode::GETENVVAR_16,
      {
          OperandType::INDIRECT8,
          OperandType::UINT8, // var idx
          OperandType::UINT16,
      } },

    // Execution Environment - Calldata
    { OpCode::CALLDATACOPY, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::RETURNDATASIZE, { OperandType::INDIRECT8, OperandType::UINT16 } },
    { OpCode::RETURNDATACOPY,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    // Machine State - Internal Control Flow
    { OpCode::JUMP_16, { OperandType::UINT16 } },
    { OpCode::JUMPI_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::INTERNALCALL, { OperandType::UINT16 } },
    { OpCode::INTERNALRETURN, {} },

    // Machine State - Memory
    { OpCode::SET_8, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT8, OperandType::UINT8 } },
    { OpCode::SET_16, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::SET_32, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT32, OperandType::UINT16 } },
    { OpCode::SET_64, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT64, OperandType::UINT16 } },
    { OpCode::SET_128, { OperandType::INDIRECT8, OperandType::TAG, OperandType::UINT128, OperandType::UINT16 } },
    { OpCode::SET_FF, { OperandType::INDIRECT8, OperandType::TAG, OperandType::FF, OperandType::UINT16 } },
    { OpCode::MOV_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { OpCode::MOV_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Side Effects - Public Storage
    { OpCode::SLOAD, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::SSTORE, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // Side Effects - Notes, Nullfiers, Logs, Messages
    { OpCode::NOTEHASHEXISTS,
      { OperandType::INDIRECT8,
        OperandType::UINT16,
        /*TODO: leafIndexOffset is not constrained*/ OperandType::UINT16,
        OperandType::UINT16 } },

    { OpCode::EMITNOTEHASH,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
      } }, // TODO: new format for these
    { OpCode::NULLIFIEREXISTS,
      { OperandType::INDIRECT8,
        OperandType::UINT16,
        /*TODO: Address is not constrained*/ OperandType::UINT16,
        OperandType::UINT16 } },
    { OpCode::EMITNULLIFIER,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
      } }, // TODO: new format for these
    /*TODO: leafIndexOffset is not constrained*/
    { OpCode::L1TOL2MSGEXISTS,
      { OperandType::INDIRECT8,
        OperandType::UINT16,
        /*TODO: leafIndexOffset is not constrained*/ OperandType::UINT16,
        OperandType::UINT16 } },
    { OpCode::GETCONTRACTINSTANCE,
      { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::EMITUNENCRYPTEDLOG,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
          OperandType::UINT16,
      } },
    { OpCode::SENDL2TOL1MSG, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Control Flow - Contract Calls
    { OpCode::CALL, external_call_format },
    { OpCode::STATICCALL, external_call_format },
    { OpCode::RETURN, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // REVERT,
    { OpCode::REVERT_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { OpCode::REVERT_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Misc
    { OpCode::DEBUGLOG,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    // Gadgets
    // Gadgets - Hashing
    { OpCode::POSEIDON2PERM, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::SHA256COMPRESSION,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::KECCAKF1600, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // TEMP ECADD without relative memory
    { OpCode::ECADD,
      { OperandType::INDIRECT16,
        OperandType::UINT16,     // lhs.x
        OperandType::UINT16,     // lhs.y
        OperandType::UINT16,     // lhs.is_infinite
        OperandType::UINT16,     // rhs.x
        OperandType::UINT16,     // rhs.y
        OperandType::UINT16,     // rhs.is_infinite
        OperandType::UINT16 } }, // dst_offset
    { OpCode::MSM,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    // Gadget - Conversion
    { OpCode::TORADIXBE,
      { OperandType::INDIRECT8,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT8 } },
};

const std::unordered_map<OperandType, size_t> OPERAND_TYPE_SIZE = {
    { OperandType::INDIRECT8, 1 }, { OperandType::INDIRECT16, 2 }, { OperandType::TAG, 1 },
    { OperandType::UINT8, 1 },     { OperandType::UINT16, 2 },     { OperandType::UINT32, 4 },
    { OperandType::UINT64, 8 },    { OperandType::UINT128, 16 },   { OperandType::FF, 32 }
};

} // Anonymous namespace

/**
 * @brief Parsing of the supplied bytecode into a vector of instructions. It essentially
 *        checks that each opcode value is in the defined range and extracts the operands
 *        for each opcode based on the specification from OPCODE_WIRE_FORMAT.
 *
 * @param bytecode The bytecode to be parsed as a vector of bytes/uint8_t
 * @throws runtime_error exception when the bytecode is invalid.
 * @return Vector of instructions
 */
std::vector<Instruction> Deserialization::parse(std::vector<uint8_t> const& bytecode)
{
    std::vector<Instruction> instructions;
    size_t pos = 0;
    const auto length = bytecode.size();

    debug("------- PARSING BYTECODE -------");
    debug("Parsing bytecode of length: " + std::to_string(length));
    while (pos < length) {
        const uint8_t opcode_byte = bytecode.at(pos);

        if (!Bytecode::is_valid(opcode_byte)) {
            throw_or_abort("Invalid opcode byte: " + to_hex(opcode_byte) + " at position: " + std::to_string(pos));
        }
        pos++;

        auto const opcode = static_cast<OpCode>(opcode_byte);
        auto const iter = OPCODE_WIRE_FORMAT.find(opcode);
        if (iter == OPCODE_WIRE_FORMAT.end()) {
            throw_or_abort("Opcode not found in OPCODE_WIRE_FORMAT: " + to_hex(opcode) + " name " + to_string(opcode));
        }
        std::vector<OperandType> inst_format = iter->second;

        std::vector<Operand> operands;
        for (OperandType const& opType : inst_format) {
            // No underflow as while condition guarantees pos <= length (after pos++)
            if (length - pos < OPERAND_TYPE_SIZE.at(opType)) {
                throw_or_abort("Operand is missing at position " + std::to_string(pos) + " for opcode " +
                               to_hex(opcode) + " not enough bytes for operand type " +
                               std::to_string(static_cast<int>(opType)));
            }

            switch (opType) {
            case OperandType::TAG: {
                uint8_t tag_u8 = bytecode.at(pos);
                if (tag_u8 > MAX_MEM_TAG) {
                    throw_or_abort("Instruction tag is invalid at position " + std::to_string(pos) +
                                   " value: " + std::to_string(tag_u8) + " for opcode: " + to_string(opcode));
                }
                operands.emplace_back(static_cast<AvmMemoryTag>(tag_u8));
                break;
            }
            case OperandType::INDIRECT8:
            case OperandType::UINT8:
                operands.emplace_back(bytecode.at(pos));
                break;
            case OperandType::INDIRECT16:
            case OperandType::UINT16: {
                uint16_t operand_u16 = 0;
                uint8_t const* pos_ptr = &bytecode.at(pos);
                serialize::read(pos_ptr, operand_u16);
                operands.emplace_back(operand_u16);
                break;
            }
            case OperandType::UINT32: {
                uint32_t operand_u32 = 0;
                uint8_t const* pos_ptr = &bytecode.at(pos);
                serialize::read(pos_ptr, operand_u32);
                operands.emplace_back(operand_u32);
                break;
            }
            case OperandType::UINT64: {
                uint64_t operand_u64 = 0;
                uint8_t const* pos_ptr = &bytecode.at(pos);
                serialize::read(pos_ptr, operand_u64);
                operands.emplace_back(operand_u64);
                break;
            }
            case OperandType::UINT128: {
                uint128_t operand_u128 = 0;
                uint8_t const* pos_ptr = &bytecode.at(pos);
                serialize::read(pos_ptr, operand_u128);
                operands.emplace_back(operand_u128);
                break;
            }
            case OperandType::FF: {
                FF operand_ff;
                uint8_t const* pos_ptr = &bytecode.at(pos);
                read(pos_ptr, operand_ff);
                operands.emplace_back(operand_ff);
            }
            }
            pos += OPERAND_TYPE_SIZE.at(opType);
        }
        auto instruction = Instruction(opcode, operands);
        debug(instruction.to_string());
        instructions.emplace_back(std::move(instruction));
    }
    return instructions;
};

} // namespace bb::avm_trace

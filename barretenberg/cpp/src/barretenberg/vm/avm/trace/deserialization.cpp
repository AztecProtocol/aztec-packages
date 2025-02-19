#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/instructions.hpp"
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
    { OpCode::CAST_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8, OperandType::TAG } },
    { OpCode::CAST_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::TAG } },

    // Execution Environment - Globals
    { OpCode::GETENVVAR_16,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
          OperandType::UINT8, // var idx
      } },

    // Execution Environment - Calldata
    { OpCode::CALLDATACOPY, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { OpCode::RETURNDATASIZE, { OperandType::INDIRECT8, OperandType::UINT16 } },
    { OpCode::RETURNDATACOPY,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    // Machine State - Internal Control Flow
    { OpCode::JUMP_32, { OperandType::UINT32 } },
    { OpCode::JUMPI_32, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT32 } },
    { OpCode::INTERNALCALL, { OperandType::UINT32 } },
    { OpCode::INTERNALRETURN, {} },

    // Machine State - Memory
    { OpCode::SET_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::TAG, OperandType::UINT8 } },
    { OpCode::SET_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT16 } },
    { OpCode::SET_32, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT32 } },
    { OpCode::SET_64, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT64 } },
    { OpCode::SET_128, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT128 } },
    { OpCode::SET_FF, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::FF } },
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
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT8 } },
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
      { OperandType::INDIRECT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16 } },
};

const std::unordered_map<OperandType, uint32_t> OPERAND_TYPE_SIZE = {
    { OperandType::INDIRECT8, 1 }, { OperandType::INDIRECT16, 2 }, { OperandType::TAG, 1 },
    { OperandType::UINT8, 1 },     { OperandType::UINT16, 2 },     { OperandType::UINT32, 4 },
    { OperandType::UINT64, 8 },    { OperandType::UINT128, 16 },   { OperandType::FF, 32 }
};

} // Anonymous namespace

// TODO: once opcodes are frozen, this function can be replaced by a table/map of constants
uint32_t Deserialization::get_pc_increment(OpCode opcode)
{
    const auto iter = OPCODE_WIRE_FORMAT.find(opcode);

    if (iter == OPCODE_WIRE_FORMAT.end()) {
        return 0;
    }

    // OPCODE_WIRE_FORMAT does not contain the opcode itself which accounts for 1 byte
    uint32_t increment = 1;

    const std::vector<OperandType>& inst_format = iter->second;
    for (const auto& op_type : inst_format) {
        increment += OPERAND_TYPE_SIZE.at(op_type);
    }

    return increment;
}

/**
 * @brief Parsing of an instruction in the supplied bytecode at byte position pos. This
 *        checks that the opcode value is in the defined range and extracts the operands
 *        for each opcode based on the specification from OPCODE_WIRE_FORMAT.
 *
 * @param bytecode The bytecode to be parsed as a vector of bytes/uint8_t
 * @param pos Bytecode position
 * @throws runtime_error exception when the bytecode is invalid or pos is out-of-range
 * @return The instruction
 */
InstructionWithError Deserialization::parse(const std::vector<uint8_t>& bytecode, size_t pos)
{
    const auto length = bytecode.size();

    if (pos >= length) {
        info("Position is out of range. Position: " + std::to_string(pos) +
             " Bytecode length: " + std::to_string(length));
        return InstructionWithError{
            .instruction = Instruction(OpCode::LAST_OPCODE_SENTINEL, {}),
            .error = AvmError::INVALID_PROGRAM_COUNTER,
        };
    }

    const uint8_t opcode_byte = bytecode.at(pos);

    if (!Bytecode::is_valid(opcode_byte)) {
        info("Invalid opcode byte: " + to_hex(opcode_byte) + " at position: " + std::to_string(pos));
        return InstructionWithError{
            .instruction = Instruction(OpCode::LAST_OPCODE_SENTINEL, {}),
            .error = AvmError::INVALID_OPCODE,
        };
    }
    pos++;

    const auto opcode = static_cast<OpCode>(opcode_byte);
    const auto iter = OPCODE_WIRE_FORMAT.find(opcode);
    if (iter == OPCODE_WIRE_FORMAT.end()) {
        info("Opcode not found in OPCODE_WIRE_FORMAT: " + to_hex(opcode) + " name " + to_string(opcode));
        return InstructionWithError{
            .instruction = Instruction(OpCode::LAST_OPCODE_SENTINEL, {}),
            .error = AvmError::INVALID_OPCODE,
        };
    }
    const std::vector<OperandType>& inst_format = iter->second;

    std::vector<Operand> operands;
    for (OperandType const& op_type : inst_format) {
        // No underflow as above condition guarantees pos <= length (after pos++)
        const auto operand_size = OPERAND_TYPE_SIZE.at(op_type);
        if (length - pos < operand_size) {
            info("Operand is missing at position " + std::to_string(pos) + " for opcode " + to_hex(opcode) +
                 " not enough bytes for operand type " + std::to_string(static_cast<int>(op_type)));
            return InstructionWithError{
                .instruction = Instruction(OpCode::LAST_OPCODE_SENTINEL, {}),
                .error = AvmError::PARSING_ERROR,
            };
        }

        switch (op_type) {
        case OperandType::TAG: {
            uint8_t tag_u8 = bytecode.at(pos);
            if (tag_u8 > MAX_MEM_TAG) {
                info("Instruction tag is invalid at position " + std::to_string(pos) +
                     " value: " + std::to_string(tag_u8) + " for opcode: " + to_string(opcode));
                return InstructionWithError{
                    .instruction = Instruction(OpCode::LAST_OPCODE_SENTINEL, {}),
                    .error = AvmError::INVALID_TAG_VALUE,
                };
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
        pos += operand_size;
    }

    return InstructionWithError{ .instruction = Instruction(opcode, operands), .error = AvmError::NO_ERROR };
};

/**
 * @brief Parse supplied bytecode in a static manner, i.e., parsing instruction by instruction
 *        without any control flow resolution. In other words, pc is incremented by the size
 *        of the current parsed instruction.
 *
 * @param bytecode The bytecode to be parsed as a vector of bytes/uint8_t
 * @throws runtime_error exception when the bytecode is invalid or pos is out-of-range
 * @return The list of instructions as a vector with an error.
 */
ParsedBytecode Deserialization::parse_bytecode_statically(const std::vector<uint8_t>& bytecode)
{
    uint32_t pc = 0;
    std::vector<Instruction> instructions;
    while (pc < bytecode.size()) {
        const auto [instruction, error] = parse(bytecode, pc);
        if (!is_ok(error)) {
            return ParsedBytecode{
                .instructions = instructions,
                .error = error,
            };
        }
        instructions.emplace_back(instruction);
        pc += get_pc_increment(instruction.op_code);
    }

    return ParsedBytecode{
        .instructions = instructions,
        .error = AvmError::NO_ERROR,
    };
}

} // namespace bb::avm_trace

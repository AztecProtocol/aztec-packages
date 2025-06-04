#include "barretenberg/vm2/simulation/lib/serialization.hpp"

#include <cassert>
#include <cstdint>
#include <iomanip>
#include <span>
#include <sstream>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"

namespace bb::avm2::simulation {

const std::unordered_map<OperandType, uint32_t> OPERAND_TYPE_SIZE_BYTES = {
    { OperandType::INDIRECT8, 1 }, { OperandType::INDIRECT16, 2 }, { OperandType::TAG, 1 },
    { OperandType::UINT8, 1 },     { OperandType::UINT16, 2 },     { OperandType::UINT32, 4 },
    { OperandType::UINT64, 8 },    { OperandType::UINT128, 16 },   { OperandType::FF, 32 }
};

// Instruction wire formats.
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
                                                        /*l2GasOffset=*/OperandType::UINT16,
                                                        /*daGasOffset=*/OperandType::UINT16,
                                                        /*addrOffset=*/OperandType::UINT16,
                                                        /*argsOffset=*/OperandType::UINT16,
                                                        /*argsSizeOffset=*/OperandType::UINT16 };

// Contrary to TS, the format does not contain the WireOpCode byte which prefixes any instruction.
// The format for WireOpCode::SET has to be handled separately as it is variable based on the tag.
const std::unordered_map<WireOpCode, std::vector<OperandType>> WireOpCode_WIRE_FORMAT = {
    // Compute
    // Compute - Arithmetic
    { WireOpCode::ADD_8, three_operand_format8 },
    { WireOpCode::ADD_16, three_operand_format16 },
    { WireOpCode::SUB_8, three_operand_format8 },
    { WireOpCode::SUB_16, three_operand_format16 },
    { WireOpCode::MUL_8, three_operand_format8 },
    { WireOpCode::MUL_16, three_operand_format16 },
    { WireOpCode::DIV_8, three_operand_format8 },
    { WireOpCode::DIV_16, three_operand_format16 },
    { WireOpCode::FDIV_8, three_operand_format8 },
    { WireOpCode::FDIV_16, three_operand_format16 },
    // Compute - Comparison
    { WireOpCode::EQ_8, three_operand_format8 },
    { WireOpCode::EQ_16, three_operand_format16 },
    { WireOpCode::LT_8, three_operand_format8 },
    { WireOpCode::LT_16, three_operand_format16 },
    { WireOpCode::LTE_8, three_operand_format8 },
    { WireOpCode::LTE_16, three_operand_format16 },
    // Compute - Bitwise
    { WireOpCode::AND_8, three_operand_format8 },
    { WireOpCode::AND_16, three_operand_format16 },
    { WireOpCode::OR_8, three_operand_format8 },
    { WireOpCode::OR_16, three_operand_format16 },
    { WireOpCode::XOR_8, three_operand_format8 },
    { WireOpCode::XOR_16, three_operand_format16 },
    { WireOpCode::NOT_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { WireOpCode::NOT_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::SHL_8, three_operand_format8 },
    { WireOpCode::SHL_16, three_operand_format16 },
    { WireOpCode::SHR_8, three_operand_format8 },
    { WireOpCode::SHR_16, three_operand_format16 },
    // Compute - Type Conversions
    { WireOpCode::CAST_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8, OperandType::TAG } },
    { WireOpCode::CAST_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::TAG } },

    // Execution Environment - Globals
    { WireOpCode::GETENVVAR_16,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
          OperandType::UINT8, // var idx
      } },

    // Execution Environment - Calldata
    { WireOpCode::CALLDATACOPY,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::SUCCESSCOPY, { OperandType::INDIRECT8, OperandType::UINT16 } },
    { WireOpCode::RETURNDATASIZE, { OperandType::INDIRECT8, OperandType::UINT16 } },
    { WireOpCode::RETURNDATACOPY,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    // Machine State - Internal Control Flow
    { WireOpCode::JUMP_32, { OperandType::UINT32 } },
    { WireOpCode::JUMPI_32, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT32 } },
    { WireOpCode::INTERNALCALL, { OperandType::UINT32 } },
    { WireOpCode::INTERNALRETURN, {} },

    // Machine State - Memory
    { WireOpCode::SET_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::TAG, OperandType::UINT8 } },
    { WireOpCode::SET_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT16 } },
    { WireOpCode::SET_32, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT32 } },
    { WireOpCode::SET_64, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT64 } },
    { WireOpCode::SET_128, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT128 } },
    { WireOpCode::SET_FF, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::FF } },
    { WireOpCode::MOV_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { WireOpCode::MOV_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Side Effects - Public Storage
    { WireOpCode::SLOAD, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::SSTORE, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // Side Effects - Notes, Nullfiers, Logs, Messages
    { WireOpCode::NOTEHASHEXISTS,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    { WireOpCode::EMITNOTEHASH,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
      } },
    { WireOpCode::NULLIFIEREXISTS,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::EMITNULLIFIER,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
      } },
    { WireOpCode::L1TOL2MSGEXISTS,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::GETCONTRACTINSTANCE,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT8 } },
    { WireOpCode::EMITUNENCRYPTEDLOG,
      {
          OperandType::INDIRECT8,
          OperandType::UINT16,
          OperandType::UINT16,
      } },
    { WireOpCode::SENDL2TOL1MSG, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Control Flow - Contract Calls
    { WireOpCode::CALL, external_call_format },
    { WireOpCode::STATICCALL, external_call_format },
    { WireOpCode::RETURN, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // REVERT,
    { WireOpCode::REVERT_8, { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8 } },
    { WireOpCode::REVERT_16, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },

    // Misc
    { WireOpCode::DEBUGLOG,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },

    // Gadgets
    // Gadgets - Hashing
    { WireOpCode::POSEIDON2PERM, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::SHA256COMPRESSION,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    { WireOpCode::KECCAKF1600, { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16 } },
    // TEMP ECADD without relative memory
    { WireOpCode::ECADD,
      { OperandType::INDIRECT16,
        OperandType::UINT16,     // lhs.x
        OperandType::UINT16,     // lhs.y
        OperandType::UINT16,     // lhs.is_infinite
        OperandType::UINT16,     // rhs.x
        OperandType::UINT16,     // rhs.y
        OperandType::UINT16,     // rhs.is_infinite
        OperandType::UINT16 } }, // dst_offset
    // Gadget - Conversion
    { WireOpCode::TORADIXBE,
      { OperandType::INDIRECT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16 } },
};

namespace testonly {

const std::unordered_map<WireOpCode, std::vector<OperandType>>& get_instruction_wire_formats()
{
    return WireOpCode_WIRE_FORMAT;
}

const std::unordered_map<OperandType, uint32_t>& get_operand_type_sizes()
{
    return OPERAND_TYPE_SIZE_BYTES;
}

} // namespace testonly

namespace {

bool is_wire_opcode_valid(uint8_t w_opcode)
{
    return w_opcode < static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL);
}

} // namespace

Instruction deserialize_instruction(std::span<const uint8_t> bytecode, size_t pos)
{
    const auto bytecode_length = bytecode.size();

    if (pos >= bytecode_length) {
        vinfo("PC is out of range. Position: ", pos, " Bytecode length: ", bytecode_length);
        throw InstrDeserializationError::PC_OUT_OF_RANGE;
    }

    const uint8_t opcode_byte = bytecode[pos];

    if (!is_wire_opcode_valid(opcode_byte)) {
        vinfo("Invalid wire opcode byte: 0x", to_hex(opcode_byte), " at position: ", pos);
        throw InstrDeserializationError::OPCODE_OUT_OF_RANGE;
    }

    const auto opcode = static_cast<WireOpCode>(opcode_byte);
    const auto iter = WireOpCode_WIRE_FORMAT.find(opcode);
    assert(iter != WireOpCode_WIRE_FORMAT.end());
    const auto& inst_format = iter->second;

    const uint32_t instruction_size = WIRE_INSTRUCTION_SPEC.at(opcode).size_in_bytes;

    // We know we will encounter a parsing error, but continue processing because
    // we need the partial instruction to be parsed for witness generation.
    if (pos + instruction_size > bytecode_length) {
        vinfo("Instruction does not fit in remaining bytecode. Wire opcode: ",
              opcode,
              " pos: ",
              pos,
              " instruction size: ",
              instruction_size,
              " bytecode length: ",
              bytecode_length);
        throw InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE;
    }

    pos++; // move after opcode byte

    uint16_t indirect = 0;
    std::vector<Operand> operands;
    for (const OperandType op_type : inst_format) {
        const auto operand_size = OPERAND_TYPE_SIZE_BYTES.at(op_type);
        assert(pos + operand_size <= bytecode_length); // Guaranteed to hold due to
                                                       //  pos + instruction_size <= bytecode_length

        switch (op_type) {
        case OperandType::TAG:
        case OperandType::UINT8: {
            operands.emplace_back(Operand::from<uint8_t>(bytecode[pos]));
            break;
        }
        case OperandType::INDIRECT8: {
            indirect = bytecode[pos];
            break;
        }
        case OperandType::INDIRECT16: {
            uint16_t operand_u16 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u16);
            indirect = operand_u16;
            break;
        }
        case OperandType::UINT16: {
            uint16_t operand_u16 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u16);
            operands.emplace_back(Operand::from<uint16_t>(operand_u16));
            break;
        }
        case OperandType::UINT32: {
            uint32_t operand_u32 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u32);
            operands.emplace_back(Operand::from<uint32_t>(operand_u32));
            break;
        }
        case OperandType::UINT64: {
            uint64_t operand_u64 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u64);
            operands.emplace_back(Operand::from<uint64_t>(operand_u64));
            break;
        }
        case OperandType::UINT128: {
            uint128_t operand_u128 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u128);
            operands.emplace_back(Operand::from<uint128_t>(operand_u128));
            break;
        }
        case OperandType::FF: {
            FF operand_ff;
            uint8_t const* pos_ptr = &bytecode[pos];
            read(pos_ptr, operand_ff);
            operands.emplace_back(Operand::from<FF>(operand_ff));
        }
        }
        pos += operand_size;
    }

    return {
        .opcode = opcode,
        .indirect = indirect,
        .operands = std::move(operands),
    };
};

std::string Instruction::to_string() const
{
    std::ostringstream oss;
    oss << opcode << " indirect: " << indirect << ", operands: [ ";
    for (const auto& operand : operands) {
        oss << std::to_string(operand) << " ";
    }
    oss << "]";
    return oss.str();
}

size_t Instruction::size_in_bytes() const
{
    assert(WIRE_INSTRUCTION_SPEC.contains(opcode));
    return WIRE_INSTRUCTION_SPEC.at(opcode).size_in_bytes;
}

ExecutionOpCode Instruction::get_exec_opcode() const
{
    assert(WIRE_INSTRUCTION_SPEC.contains(opcode));
    return WIRE_INSTRUCTION_SPEC.at(opcode).exec_opcode;
}

std::vector<uint8_t> Instruction::serialize() const
{
    std::vector<uint8_t> output;
    output.reserve(WIRE_INSTRUCTION_SPEC.at(opcode).size_in_bytes);
    output.emplace_back(static_cast<uint8_t>(opcode));
    size_t operand_pos = 0;

    for (const auto& operand_type : WireOpCode_WIRE_FORMAT.at(opcode)) {
        switch (operand_type) {
        case OperandType::INDIRECT8:
            output.emplace_back(static_cast<uint8_t>(indirect));
            break;
        case OperandType::INDIRECT16: {
            const auto indirect_vec = to_buffer(indirect);
            output.insert(output.end(),
                          std::make_move_iterator(indirect_vec.begin()),
                          std::make_move_iterator(indirect_vec.end()));
        } break;
        case OperandType::TAG:
        case OperandType::UINT8:
            output.emplace_back(operands.at(operand_pos++).as<uint8_t>());
            break;
        case OperandType::UINT16: {
            const auto operand_vec = to_buffer(operands.at(operand_pos++).as<uint16_t>());
            output.insert(
                output.end(), std::make_move_iterator(operand_vec.begin()), std::make_move_iterator(operand_vec.end()));
        } break;
        case OperandType::UINT32: {
            const auto operand_vec = to_buffer(operands.at(operand_pos++).as<uint32_t>());
            output.insert(
                output.end(), std::make_move_iterator(operand_vec.begin()), std::make_move_iterator(operand_vec.end()));
        } break;
        case OperandType::UINT64: {
            const auto operand_vec = to_buffer(operands.at(operand_pos++).as<uint64_t>());
            output.insert(
                output.end(), std::make_move_iterator(operand_vec.begin()), std::make_move_iterator(operand_vec.end()));
        } break;
        case OperandType::UINT128: {
            const auto operand_vec = to_buffer(operands.at(operand_pos++).as<uint128_t>());
            output.insert(
                output.end(), std::make_move_iterator(operand_vec.begin()), std::make_move_iterator(operand_vec.end()));
        } break;
        case OperandType::FF: {
            const auto operand_vec = to_buffer(operands.at(operand_pos++).as<FF>());
            output.insert(
                output.end(), std::make_move_iterator(operand_vec.begin()), std::make_move_iterator(operand_vec.end()));
        } break;
        }
    }
    return output;
}

bool check_tag(const Instruction& instruction)
{
    if (instruction.opcode == WireOpCode::LAST_OPCODE_SENTINEL) {
        vinfo("Instruction does not contain a valid wire opcode.");
        return false;
    }

    const auto& wire_format = WireOpCode_WIRE_FORMAT.at(instruction.opcode);

    size_t pos = 0; // Position in instruction operands

    for (size_t i = 0; i < wire_format.size(); i++) {
        if (wire_format[i] == OperandType::INDIRECT8 || wire_format[i] == OperandType::INDIRECT16) {
            continue; // No pos increment
        }

        if (wire_format[i] == OperandType::TAG) {
            if (pos >= instruction.operands.size()) {
                vinfo("Instruction operands size is too small. Tag position: ",
                      pos,
                      " size: ",
                      instruction.operands.size(),
                      " WireOpCode: ",
                      instruction.opcode);
                return false;
            }

            try {
                uint8_t tag = instruction.operands.at(pos).as<uint8_t>(); // Cast to uint8_t might throw

                if (tag > static_cast<uint8_t>(MemoryTag::MAX)) {
                    vinfo("Instruction tag operand at position: ",
                          pos,
                          " is invalid.",
                          " Tag value: ",
                          tag,
                          " WireOpCode: ",
                          instruction.opcode);
                    return false;
                }

            } catch (const std::runtime_error&) {
                vinfo("Instruction operand at position: ",
                      pos,
                      " is longer than a byte.",
                      " WireOpCode: ",
                      instruction.opcode);
                return false;
            }
        }

        pos++;
    }
    return true;
}

} // namespace bb::avm2::simulation

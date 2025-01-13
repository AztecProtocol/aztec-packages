#include "barretenberg/vm2/simulation/lib/serialization.hpp"

#include <cassert>
#include <cstdint>
#include <format>
#include <iomanip>
#include <span>
#include <sstream>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {
namespace {

// Possible types for an instruction's operand in its wire format.
// Note that the TAG enum value is not supported in TS and is parsed as UINT8.
// INDIRECT is parsed as UINT8 where the bits represent the operands that have indirect mem access.
enum class OperandType : uint8_t { INDIRECT8, INDIRECT16, TAG, UINT8, UINT16, UINT32, UINT64, UINT128, FF };

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
                                                        /*gasOffset=*/OperandType::UINT16,
                                                        /*addrOffset=*/OperandType::UINT16,
                                                        /*argsOffset=*/OperandType::UINT16,
                                                        /*argsSizeOffset=*/OperandType::UINT16,
                                                        /*successOffset=*/OperandType::UINT16 };

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
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT8 } },
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
    { WireOpCode::MSM,
      { OperandType::INDIRECT8, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16, OperandType::UINT16 } },
    // Gadget - Conversion
    { WireOpCode::TORADIXBE,
      { OperandType::INDIRECT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16,
        OperandType::UINT16 } },
};

} // namespace

Operand::Operand(const Operand& other)
{
    // Lazy implementation using the assignment operator.
    *this = other;
}

Operand& Operand::operator=(const Operand& other)
{
    if (this != &other) {
        if (std::holds_alternative<uint8_t>(other.value)) {
            value = std::get<uint8_t>(other.value);
        } else if (std::holds_alternative<uint16_t>(other.value)) {
            value = std::get<uint16_t>(other.value);
        } else if (std::holds_alternative<uint32_t>(other.value)) {
            value = std::get<uint32_t>(other.value);
        } else if (std::holds_alternative<uint64_t>(other.value)) {
            value = std::get<uint64_t>(other.value);
        } else if (std::holds_alternative<U128InHeap>(other.value)) {
            value = std::make_unique<uint128_t>(*std::get<U128InHeap>(other.value));
        } else {
            value = std::make_unique<FF>(*std::get<FieldInHeap>(other.value));
        }
    }
    return *this;
}

Operand::operator bool() const
{
    return (this->operator uint8_t() == 1);
}

Operand::operator uint8_t() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    }

    throw std::runtime_error("Operand does not fit in uint8_t");
}

Operand::operator uint16_t() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::get<uint16_t>(value);
    }

    throw std::runtime_error("Operand does not fit in uint16_t");
}

Operand::operator uint32_t() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::get<uint16_t>(value);
    } else if (std::holds_alternative<uint32_t>(value)) {
        return std::get<uint32_t>(value);
    }

    throw std::runtime_error("Operand does not fit in uint32_t");
}

Operand::operator uint64_t() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::get<uint16_t>(value);
    } else if (std::holds_alternative<uint32_t>(value)) {
        return std::get<uint32_t>(value);
    } else if (std::holds_alternative<uint64_t>(value)) {
        return std::get<uint64_t>(value);
    }

    throw std::runtime_error("Operand does not fit in uint64_t");
}

Operand::operator uint128_t() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::get<uint16_t>(value);
    } else if (std::holds_alternative<uint32_t>(value)) {
        return std::get<uint32_t>(value);
    } else if (std::holds_alternative<uint64_t>(value)) {
        return std::get<uint64_t>(value);
    } else if (std::holds_alternative<U128InHeap>(value)) {
        return *std::get<U128InHeap>(value);
    }

    throw std::runtime_error("Operand does not fit in uint128_t");
}

Operand::operator FF() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::get<uint8_t>(value);
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::get<uint16_t>(value);
    } else if (std::holds_alternative<uint32_t>(value)) {
        return std::get<uint32_t>(value);
    } else if (std::holds_alternative<uint64_t>(value)) {
        return std::get<uint64_t>(value);
    } else if (std::holds_alternative<U128InHeap>(value)) {
        return uint256_t::from_uint128(*std::get<U128InHeap>(value));
    } else {
        return *std::get<FieldInHeap>(value);
    }
}

std::string Operand::to_string() const
{
    if (std::holds_alternative<uint8_t>(value)) {
        return std::to_string(std::get<uint8_t>(value));
    } else if (std::holds_alternative<uint16_t>(value)) {
        return std::to_string(std::get<uint16_t>(value));
    } else if (std::holds_alternative<uint32_t>(value)) {
        return std::to_string(std::get<uint32_t>(value));
    } else if (std::holds_alternative<uint64_t>(value)) {
        return std::to_string(std::get<uint64_t>(value));
    } else if (std::holds_alternative<U128InHeap>(value)) {
        return "someu128";
    } else if (std::holds_alternative<FieldInHeap>(value)) {
        return "someff";
    }

    __builtin_unreachable();
}

Instruction decode_instruction(std::span<const uint8_t> bytecode, size_t pos)
{
    const auto bytecode_length = bytecode.size();
    const auto starting_pos = pos;

    assert(pos < bytecode_length);
    (void)bytecode_length; // Avoid GCC unused parameter warning when asserts are disabled.
    // if (pos >= length) {
    //     info("Position is out of range. Position: " + std::to_string(pos) +
    //          " Bytecode length: " + std::to_string(length));
    //     return InstructionWithError{
    //         .instruction = Instruction(WireOpCode::LAST_WireOpCode_SENTINEL, {}),
    //         .error = AvmError::INVALID_PROGRAM_COUNTER,
    //     };
    // }

    const uint8_t opcode_byte = bytecode[pos];

    // if (!Bytecode::is_valid(WireOpCode_byte)) {
    //     info("Invalid WireOpCode byte: " + to_hex(WireOpCode_byte) + " at position: " + std::to_string(pos));
    //     return InstructionWithError{
    //         .instruction = Instruction(WireOpCode::LAST_WireOpCode_SENTINEL, {}),
    //         .error = AvmError::INVALID_WireOpCode,
    //     };
    // }
    pos++;

    const auto opcode = static_cast<WireOpCode>(opcode_byte);
    const auto iter = WireOpCode_WIRE_FORMAT.find(opcode);
    assert(iter != WireOpCode_WIRE_FORMAT.end());
    // if (iter == WireOpCode_WIRE_FORMAT.end()) {
    //     info("WireOpCode not found in WireOpCode_WIRE_FORMAT: " + to_hex(opcode) + " name " + to_string(opcode));
    //     return InstructionWithError{
    //         .instruction = Instruction(WireOpCode::LAST_WireOpCode_SENTINEL, {}),
    //         .error = AvmError::INVALID_WireOpCode,
    //     };
    // }
    const auto& inst_format = iter->second;

    uint16_t indirect = 0;
    std::vector<Operand> operands;
    for (const OperandType op_type : inst_format) {
        // No underflow as above condition guarantees pos <= length (after pos++)
        const auto operand_size = OPERAND_TYPE_SIZE_BYTES.at(op_type);
        assert(pos + operand_size <= bytecode_length);
        // if (length - pos < operand_size) {
        //     info("Operand is missing at position " + std::to_string(pos) + " for WireOpCode " + to_hex(opcode) +
        //          " not enough bytes for operand type " + std::to_string(static_cast<int>(op_type)));
        //     return InstructionWithError{
        //         .instruction = Instruction(WireOpCode::LAST_WireOpCode_SENTINEL, {}),
        //         .error = AvmError::PARSING_ERROR,
        //     };
        // }

        switch (op_type) {
        case OperandType::TAG: {
            uint8_t tag_u8 = bytecode[pos];
            // if (tag_u8 > MAX_MEM_TAG) {
            //     info("Instruction tag is invalid at position " + std::to_string(pos) +
            //          " value: " + std::to_string(tag_u8) + " for WireOpCode: " + to_string(WireOpCode));
            //     return InstructionWithError{
            //         .instruction = Instruction(WireOpCode::LAST_WireOpCode_SENTINEL, {}),
            //         .error = AvmError::INVALID_TAG_VALUE,
            //     };
            // }
            operands.emplace_back(tag_u8);
            break;
        }
        case OperandType::INDIRECT8: {
            indirect = bytecode[pos];
            break;
        }
        case OperandType::UINT8: {
            operands.emplace_back(bytecode[pos]);
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
            operands.emplace_back(operand_u16);
            break;
        }
        case OperandType::UINT32: {
            uint32_t operand_u32 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u32);
            operands.emplace_back(operand_u32);
            break;
        }
        case OperandType::UINT64: {
            uint64_t operand_u64 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u64);
            operands.emplace_back(operand_u64);
            break;
        }
        case OperandType::UINT128: {
            uint128_t operand_u128 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u128);
            operands.emplace_back(Operand::u128(operand_u128));
            break;
        }
        case OperandType::FF: {
            FF operand_ff;
            uint8_t const* pos_ptr = &bytecode[pos];
            read(pos_ptr, operand_ff);
            operands.emplace_back(Operand::ff(operand_ff));
        }
        }
        pos += operand_size;
    }

    return { .opcode = opcode,
             .indirect = indirect,
             .operands = std::move(operands),
             .size_in_bytes = static_cast<uint8_t>(pos - starting_pos) };
};

std::string Instruction::to_string() const
{
    std::ostringstream oss;
    oss << opcode << " indirect: " << std::format("{:b}", indirect) << ", operands: [ ";
    for (const auto& operand : operands) {
        oss << operand.to_string() << " ";
    }
    oss << "], size: " << static_cast<int>(size_in_bytes);
    return oss.str();
}

} // namespace bb::avm2::simulation

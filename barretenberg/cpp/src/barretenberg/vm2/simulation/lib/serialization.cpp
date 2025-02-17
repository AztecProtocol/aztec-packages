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
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

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
    oss << opcode << " indirect: " << indirect << ", operands: [ ";
    for (const auto& operand : operands) {
        oss << operand.to_string() << " ";
    }
    oss << "], size: " << static_cast<int>(size_in_bytes);
    return oss.str();
}

} // namespace bb::avm2::simulation

#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

#include <cstdint>
#include <memory>
#include <variant>
#include <vector>

namespace bb::avm2::simulation {

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
class Operand {
  private:
    // We use unique ptrs to bound the size of the Operand class to the size of a pointer.
    // FIXME: Not true! Sadly the variant is sizeof(ptr) + 1 = 8 + 1, but it's aligned,
    // so it's 16 bytes which wastes 7 bytes. Still better than 32 + 1 + padding = 40 bytes,
    // but worth it?
    using FieldInHeap = std::unique_ptr<FF>;
    using U128InHeap = std::unique_ptr<uint128_t>;
    using Variant = std::variant<uint8_t, uint16_t, uint32_t, uint64_t, FieldInHeap, U128InHeap>;
    Variant value;

  public:
    Operand(Variant value)
        : value(std::move(value))
    {}
    Operand(const Operand& other);
    Operand(Operand&&) = default;
    Operand& operator=(const Operand& other);

    // Helpers for when we want to pass a value without casting.
    static Operand u8(uint8_t value) { return { value }; }
    static Operand u16(uint16_t value) { return { value }; }
    static Operand u32(uint32_t value) { return { value }; }
    static Operand u64(uint64_t value) { return { value }; }
    static Operand u128(uint128_t value) { return { std::make_unique<uint128_t>(value) }; }
    static Operand ff(FF value) { return { std::make_unique<FF>(value) }; }

    // We define conversion to supported types.
    // The conversion will throw if the type would truncate.
    explicit operator bool() const;
    explicit operator uint8_t() const;
    explicit operator uint16_t() const;
    explicit operator uint32_t() const;
    explicit operator uint64_t() const;
    explicit operator uint128_t() const;
    explicit operator FF() const;

    std::string to_string() const;
};

struct Instruction {
    WireOpCode opcode;
    uint16_t indirect;
    std::vector<Operand> operands;
    uint8_t size_in_bytes;

    std::string to_string() const;
};

/**
 * @brief Parsing of an instruction in the supplied bytecode at byte position pos. This
 *        checks that the WireOpCode value is in the defined range and extracts the operands
 *        for each WireOpCode based on the specification from OPCODE_WIRE_FORMAT.
 *
 * @param bytecode The bytecode to be parsed as a vector of bytes/uint8_t
 * @param pos Bytecode position
 * @throws runtime_error exception when the bytecode is invalid or pos is out-of-range
 * @return The instruction
 */
Instruction decode_instruction(std::span<const uint8_t> bytecode, size_t pos);

} // namespace bb::avm2::simulation

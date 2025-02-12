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

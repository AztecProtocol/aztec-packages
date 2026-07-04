#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

namespace bb::avm2::testing {

// Serializes a sequence of AVM instructions into a single contiguous bytecode buffer:
// each instruction is serialized according to its wire format and the results are concatenated.
class BytecodeBuilder {
  public:
    BytecodeBuilder& add(const simulation::Instruction& instruction);
    BytecodeBuilder& add(const InstructionBuilder& builder) { return add(builder.build()); }

    // Appends raw bytes. Used by tests that craft malformed bytecode (invalid opcodes/tags,
    // truncated instructions) which cannot be produced through the instruction encoder.
    BytecodeBuilder& add_raw(std::span<const uint8_t> bytes);

    std::vector<uint8_t> build() const { return bytecode; }
    size_t size() const { return bytecode.size(); }

  private:
    std::vector<uint8_t> bytecode;
};

// Convenience free function that serializes a sequence of instructions into a bytecode buffer.
std::vector<uint8_t> encode_to_bytecode(const std::vector<simulation::Instruction>& instructions);

// Returns the byte offset of the TAG operand within a serialized instruction of the given
// wire opcode (including the leading opcode byte and addressing-mode byte). Used by tests that
// patch the tag byte to an invalid value.
// Asserts that the wire format for the opcode contains a TAG operand.
size_t tag_byte_offset(WireOpCode opcode);

} // namespace bb::avm2::testing

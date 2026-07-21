#include "barretenberg/vm2/testing/bytecode_builder.hpp"

#include "barretenberg/common/assert.hpp"

namespace bb::avm2::testing {

using simulation::Instruction;
using simulation::OperandType;

BytecodeBuilder& BytecodeBuilder::add(const Instruction& instruction)
{
    const auto serialized = instruction.serialize();
    bytecode.insert(bytecode.end(), serialized.begin(), serialized.end());
    return *this;
}

BytecodeBuilder& BytecodeBuilder::add_raw(std::span<const uint8_t> bytes)
{
    bytecode.insert(bytecode.end(), bytes.begin(), bytes.end());
    return *this;
}

std::vector<uint8_t> encode_to_bytecode(const std::vector<Instruction>& instructions)
{
    BytecodeBuilder builder;
    for (const auto& instruction : instructions) {
        builder.add(instruction);
    }
    return builder.build();
}

size_t tag_byte_offset(WireOpCode opcode)
{
    const auto& wire_format = simulation::testonly::get_instruction_wire_formats().at(opcode);
    const auto& operand_sizes = simulation::testonly::get_operand_type_sizes();

    // The serialized instruction starts with the 1-byte opcode, followed by the operands laid
    // out in wire-format order (the addressing-mode byte is the first INDIRECT operand).
    size_t offset = 1;
    for (const auto& operand_type : wire_format) {
        if (operand_type == OperandType::TAG) {
            return offset;
        }
        offset += operand_sizes.at(operand_type);
    }
    BB_ASSERT(false, "Wire format for opcode has no TAG operand");
    return offset;
}

} // namespace bb::avm2::testing

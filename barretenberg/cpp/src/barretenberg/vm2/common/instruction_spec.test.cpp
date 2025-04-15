#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2 {
namespace {

size_t compute_instruction_size(WireOpCode wire_opcode,
                                const std::unordered_map<WireOpCode, std::vector<simulation::OperandType>>& wire_format,
                                const std::unordered_map<simulation::OperandType, uint32_t>& operand_type_sizes)
{
    size_t instr_size = 1; // Take into account the opcode byte
    for (const auto& operand_type : wire_format.at(wire_opcode)) {
        instr_size += operand_type_sizes.at(operand_type);
    }

    return instr_size;
}

// Test checking that the hardcoded size for each instruction specified in WIRE_INSTRUCTION_SPEC
// is correct. This test would fail only when we change the wire format of an instruction.
TEST(InstructionSpecTest, CheckAllInstructionSizes)
{
    const auto& wire_format = simulation::testonly::get_instruction_wire_formats();
    const auto& operand_type_sizes = simulation::testonly::get_operand_type_sizes();

    for (int i = 0; i < static_cast<int>(WireOpCode::LAST_OPCODE_SENTINEL); i++) {
        const auto wire_opcode = static_cast<WireOpCode>(i);
        const auto computed_size = compute_instruction_size(wire_opcode, wire_format, operand_type_sizes);
        EXPECT_EQ(WIRE_INSTRUCTION_SPEC.at(wire_opcode).size_in_bytes, computed_size)
            << "Incorrect size_in_bytes field for " << wire_opcode << " in WIRE_INSTRUCTION_SPEC.";
    }
}

// Test checking that the hardcoded tag related fields in WIRE_INSTRUCTION_SPEC
// are correct. This test would fail only when we change the wire format of an instruction.
TEST(InstructionSpecTest, CheckAllInstructionsTagInformation)
{
    const auto& wire_format = simulation::testonly::get_instruction_wire_formats();

    for (int i = 0; i < static_cast<int>(WireOpCode::LAST_OPCODE_SENTINEL); i++) {
        const auto wire_opcode = static_cast<WireOpCode>(i);
        const auto& operands = wire_format.at(wire_opcode);
        const auto tag_counts = std::count(operands.begin(), operands.end(), simulation::OperandType::TAG);
        const auto& wire_instruction_spec = WIRE_INSTRUCTION_SPEC.at(wire_opcode);

        if (wire_instruction_spec.tag_operand_idx.has_value()) {
            EXPECT_EQ(tag_counts, 1);
            if (wire_instruction_spec.tag_operand_idx.value() == 2) {
                EXPECT_EQ(operands.at(2), simulation::OperandType::TAG);
            } else {
                EXPECT_EQ(operands.at(3), simulation::OperandType::TAG);
            }
        } else {
            EXPECT_EQ(tag_counts, 0);
        }
    }
}

} // namespace
} // namespace bb::avm2

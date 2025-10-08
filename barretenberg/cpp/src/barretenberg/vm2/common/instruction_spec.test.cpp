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

// Test checking that every wire opcode (except for LAST_OPCODE_SENTINEL) has an entry in WIRE_INSTRUCTION_SPEC
// and contains a valid exec opcode that this one has an entry in EXEC_INSTRUCTION_SPEC.
// Check also that the set of these exec opcodes contain all the values defined in the ExecutionOpCode enum.
TEST(InstructionSpecTest, CheckWireOpCodeAndExecOpcodeConsistency)
{
    std::set<ExecutionOpCode> exec_opcodes;
    for (int i = 0; i < static_cast<int>(WireOpCode::LAST_OPCODE_SENTINEL); i++) {
        const auto wire_opcode = static_cast<WireOpCode>(i);
        const auto& wire_instruction_spec = WIRE_INSTRUCTION_SPEC.at(wire_opcode);
        EXPECT_TRUE(EXEC_INSTRUCTION_SPEC.contains(wire_instruction_spec.exec_opcode));

        exec_opcodes.insert(wire_instruction_spec.exec_opcode);
    }

    for (int i = 0; i <= static_cast<int>(ExecutionOpCode::MAX); i++) {
        const auto exec_opcode = static_cast<ExecutionOpCode>(i);
        EXPECT_TRUE(exec_opcodes.contains(exec_opcode));
    }
}

// Compute the maximum size of instruction in bytes and enforces it to be equal to DECOMPOSE_WINDOW_SIZE.
TEST(InstructionSpecTest, CheckDecomposeWindowSize)
{
    // We cannot use a static assert in the code as MAX_INSTRUCTION_SIZE is not a constexpr.
    static const uint32_t MAX_INSTRUCTION_SIZE =
        std::ranges::max_element(
            WIRE_INSTRUCTION_SPEC.begin(),
            WIRE_INSTRUCTION_SPEC.end(),
            [](const auto& a, const auto& b) { return a.second.size_in_bytes < b.second.size_in_bytes; })
            ->second.size_in_bytes;

    EXPECT_EQ(DECOMPOSE_WINDOW_SIZE, MAX_INSTRUCTION_SIZE);
}

} // namespace
} // namespace bb::avm2

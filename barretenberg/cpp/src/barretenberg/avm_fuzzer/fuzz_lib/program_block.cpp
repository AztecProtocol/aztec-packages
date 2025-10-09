#include "program_block.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

std::optional<uint32_t> ProgramBlock::get_variable_by_tag_and_index(bb::avm2::MemoryTag tag, uint32_t index)
{
    auto it = this->stored_variables.find(tag);
    if (it == this->stored_variables.end() || it->second.empty()) {
        return std::nullopt;
    }
    auto& arr = it->second;
    if (arr.size() == 0) {
        return std::nullopt;
    }
    return arr[index % arr.size()];
}

void ProgramBlock::process_add_8_instruction(ADD_8_Instruction instruction)
{
    // Get the actual memory addresses for the operands
    auto a_addr = get_variable_by_tag_and_index(instruction.a.argument_tag, instruction.a.offset_index);
    auto b_addr = get_variable_by_tag_and_index(instruction.b.argument_tag, instruction.b.offset_index);
    // Skip this instruction if any of the operands are not available
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result.argument_tag)
                                 .build();
    instructions.push_back(add_8_instruction);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
    instructions.push_back(instruction.opcode);
}

void ProgramBlock::process_instruction(Instruction instruction)
{
    std::visit(overloaded_instruction{
                   [](auto) { throw std::runtime_error("Invalid instruction"); },
                   [this](ADD_8_Instruction instruction) { return this->process_add_8_instruction(instruction); },
                   [this](SET_8_Instruction instruction) { return this->process_set_8_instruction(instruction); },
               },
               instruction);
}

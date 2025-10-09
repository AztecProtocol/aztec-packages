// TODO(defkit) GET RID OF STATIC CASTS, EVERY INSTRUCTION SHOULD DESCRIBE IT

#include "program_block.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
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
    auto a_addr = get_variable_by_tag_and_index(instruction.a.argument_tag, instruction.a.offset_index);
    auto b_addr = get_variable_by_tag_and_index(instruction.a.argument_tag, instruction.b.offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(static_cast<uint8_t>(a_addr.value()))
                                 .operand(static_cast<uint8_t>(b_addr.value()))
                                 .operand(static_cast<uint8_t>(instruction.result.offset_index))
                                 .build();
    instructions.push_back(add_8_instruction);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                               .operand(instruction.argument.offset_index)
                               .operand(instruction.argument.argument_tag)
                               .operand(instruction.value)
                               .build());
    this->stored_variables[instruction.argument.argument_tag].push_back(instruction.argument.offset_index);
}

void ProgramBlock::process_return_instruction(RETURN_Instruction instruction)
{
    auto return_addr = get_variable_by_tag_and_index(instruction.return_value_offset_index.argument_tag,
                                                     instruction.return_value_offset_index.offset_index);

    if (!return_addr.has_value()) {
        throw std::runtime_error("Return variable not found");
    }

    // TODO(defkit) temp
    uint8_t return_size_offset = 5U;
    auto set_size_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                                    .operand(return_size_offset)
                                    .operand(bb::avm2::MemoryTag::U32)
                                    .operand(instruction.return_size)
                                    .build();
    instructions.push_back(set_size_instruction);
    auto return_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURN)
                                  .operand(static_cast<uint16_t>(return_size_offset))
                                  .operand(static_cast<uint16_t>(return_addr.value()))
                                  .build();
    instructions.push_back(return_instruction);
}

void ProgramBlock::process_instruction(Instruction instruction)
{
    std::visit(overloaded_instruction{
                   [this](ADD_8_Instruction instruction) { return this->process_add_8_instruction(instruction); },
                   [this](SET_8_Instruction instruction) { return this->process_set_8_instruction(instruction); },
                   [this](RETURN_Instruction instruction) { return this->process_return_instruction(instruction); },
                   [](auto) { throw std::runtime_error("Invalid instruction"); },
               },
               instruction);
}

std::vector<bb::avm2::simulation::Instruction> ProgramBlock::get_instructions()
{
    return instructions;
}

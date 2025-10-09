// TODO(defkit) GET RID OF STATIC CASTS, EVERY INSTRUCTION SHOULD DESCRIBE IT

#include "program_block.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

std::optional<uint16_t> ProgramBlock::get_16_bit_offset_by_tag_and_index(bb::avm2::MemoryTag tag, uint16_t index)
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

std::optional<uint8_t> ProgramBlock::get_8_bit_offset_by_tag_and_index(bb::avm2::MemoryTag tag, uint16_t index)
{
    auto value = get_16_bit_offset_by_tag_and_index(tag, index);

    if (!value.has_value()) {
        return std::nullopt;
    }

    // live is life nanananana
    // most of the 8bit wide ops will fail
    // i have no clue how to handle this
    if (value.value() > 255) {
        return std::nullopt;
    }

    return static_cast<uint8_t>(value.value());
}

void ProgramBlock::process_add_8_instruction(ADD_8_Instruction instruction)
{
    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(add_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_sub_8_instruction(SUB_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto sub_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(sub_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_mul_8_instruction(MUL_8_Instruction instruction)
{
    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto mul_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(mul_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_div_8_instruction(DIV_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto div_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(div_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_eq_8_instruction(EQ_8_Instruction instruction)
{
    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto eq_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(eq_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_lt_8_instruction(LT_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lt_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(lt_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_lte_8_instruction(LTE_8_Instruction instruction)
{
    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lte_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(lte_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_and_8_instruction(AND_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto and_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(and_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_or_8_instruction(OR_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto or_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(or_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_xor_8_instruction(XOR_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto xor_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(xor_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_shl_8_instruction(SHL_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shl_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(shl_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_shr_8_instruction(SHR_8_Instruction instruction)
{

    auto a_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.a_offset_index);
    auto b_addr = get_8_bit_offset_by_tag_and_index(instruction.argument_tag, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shr_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(shr_8_instruction);
    this->stored_variables[instruction.argument_tag].push_back(instruction.result_offset);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag)
                               .operand(instruction.value)
                               .build());
    this->stored_variables[instruction.value_tag].push_back(instruction.offset);
}

void ProgramBlock::process_return_instruction(RETURN_Instruction instruction)
{
    auto return_addr =
        get_16_bit_offset_by_tag_and_index(instruction.return_value_tag, instruction.return_value_offset_index);

    // TODO(defkit) fix, should return something... or just not throw
    if (!return_addr.has_value()) {
        throw std::runtime_error("Return variable not found");
    }

    // TODO(defkit) temp
    uint16_t return_size_offset = 5U;
    auto set_size_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                                    .operand(return_size_offset)
                                    .operand(bb::avm2::MemoryTag::U32)
                                    .operand(static_cast<uint16_t>(instruction.return_size))
                                    .build();
    instructions.push_back(set_size_instruction);
    auto return_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURN)
                                  .operand(return_size_offset)
                                  .operand(return_addr.value())
                                  .build();
    instructions.push_back(return_instruction);
}

void ProgramBlock::process_instruction(FuzzInstruction instruction)
{
    std::visit(overloaded_instruction{
                   [this](ADD_8_Instruction instruction) { return this->process_add_8_instruction(instruction); },
                   [this](SUB_8_Instruction instruction) { return this->process_sub_8_instruction(instruction); },
                   [this](MUL_8_Instruction instruction) { return this->process_mul_8_instruction(instruction); },
                   [this](DIV_8_Instruction instruction) { return this->process_div_8_instruction(instruction); },
                   [this](EQ_8_Instruction instruction) { return this->process_eq_8_instruction(instruction); },
                   [this](LT_8_Instruction instruction) { return this->process_lt_8_instruction(instruction); },
                   [this](LTE_8_Instruction instruction) { return this->process_lte_8_instruction(instruction); },
                   [this](AND_8_Instruction instruction) { return this->process_and_8_instruction(instruction); },
                   [this](OR_8_Instruction instruction) { return this->process_or_8_instruction(instruction); },
                   [this](XOR_8_Instruction instruction) { return this->process_xor_8_instruction(instruction); },
                   [this](SHL_8_Instruction instruction) { return this->process_shl_8_instruction(instruction); },
                   [this](SHR_8_Instruction instruction) { return this->process_shr_8_instruction(instruction); },
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

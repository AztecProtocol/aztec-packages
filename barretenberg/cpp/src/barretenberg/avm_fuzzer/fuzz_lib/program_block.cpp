#include "barretenberg/avm_fuzzer/fuzz_lib/program_block.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

void ProgramBlock::process_add_8_instruction(ADD_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(add_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_sub_8_instruction(SUB_8_Instruction instruction)
{

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto sub_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(sub_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_mul_8_instruction(MUL_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto mul_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(mul_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_div_8_instruction(DIV_8_Instruction instruction)
{

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto div_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(div_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_eq_8_instruction(EQ_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto eq_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(eq_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_lt_8_instruction(LT_8_Instruction instruction)
{

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lt_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(lt_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_lte_8_instruction(LTE_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lte_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(lte_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_and_8_instruction(AND_8_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto and_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(and_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_or_8_instruction(OR_8_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto or_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_8)
                                .operand(a_addr.value())
                                .operand(b_addr.value())
                                .operand(instruction.result_offset)
                                .build();
    instructions.push_back(or_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_xor_8_instruction(XOR_8_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto xor_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(xor_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_shl_8_instruction(SHL_8_Instruction instruction)
{

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shl_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(shl_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_shr_8_instruction(SHR_8_Instruction instruction)
{

    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shr_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_8)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(shr_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_set_16_instruction(SET_16_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_set_32_instruction(SET_32_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_set_64_instruction(SET_64_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_64)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_set_128_instruction(SET_128_Instruction instruction)
{
    uint128_t value =
        (static_cast<uint128_t>(instruction.value_high) << 64) | static_cast<uint128_t>(instruction.value_low);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_128)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_set_ff_instruction(SET_FF_Instruction instruction)
{
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_FF)
                               .operand(instruction.offset)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.offset);
}

void ProgramBlock::process_mov_8_instruction(MOV_8_Instruction instruction)
{
    auto src_addr = memory_manager.get_memory_offset_8_bit(instruction.value_tag.value, instruction.src_offset_index);
    if (!src_addr.has_value()) {
        return;
    }

    auto mov_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_8)
                                 .operand(src_addr.value())
                                 .operand(instruction.dst_offset)
                                 .build();
    instructions.push_back(mov_8_instruction);
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.dst_offset);
}

void ProgramBlock::process_mov_16_instruction(MOV_16_Instruction instruction)
{
    auto src_addr = memory_manager.get_memory_offset_16_bit(instruction.value_tag.value, instruction.src_offset_index);
    if (!src_addr.has_value()) {
        return;
    }

    auto mov_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_16)
                                  .operand(src_addr.value())
                                  .operand(instruction.dst_offset)
                                  .build();
    instructions.push_back(mov_16_instruction);
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.dst_offset);
}

void ProgramBlock::process_fdiv_8_instruction(FDIV_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto fdiv_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_8)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(fdiv_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_not_8_instruction(NOT_8_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_8_bit(instruction.argument_tag.value, instruction.a_offset_index);
    if (!a_addr.has_value()) {
        return;
    }

    auto not_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_8)
                                 .operand(a_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(not_8_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_add_16_instruction(ADD_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto add_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(add_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_sub_16_instruction(SUB_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto sub_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(sub_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_mul_16_instruction(MUL_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto mul_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(mul_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_div_16_instruction(DIV_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto div_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(div_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_fdiv_16_instruction(FDIV_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto fdiv_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_16)
                                   .operand(a_addr.value())
                                   .operand(b_addr.value())
                                   .operand(instruction.result_offset)
                                   .build();
    instructions.push_back(fdiv_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_eq_16_instruction(EQ_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto eq_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_16)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(eq_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_lt_16_instruction(LT_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lt_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_16)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(lt_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_lte_16_instruction(LTE_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto lte_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(lte_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_and_16_instruction(AND_16_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto and_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(and_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_or_16_instruction(OR_16_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto or_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_16)
                                 .operand(a_addr.value())
                                 .operand(b_addr.value())
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(or_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_xor_16_instruction(XOR_16_Instruction instruction)
{
    if (instruction.argument_tag.value == bb::avm2::MemoryTag::FF) {
        return;
    }

    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto xor_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(xor_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_not_16_instruction(NOT_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    if (!a_addr.has_value()) {
        return;
    }

    auto not_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_16)
                                  .operand(a_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(not_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_shl_16_instruction(SHL_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shl_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(shl_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_shr_16_instruction(SHR_16_Instruction instruction)
{
    auto a_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.a_offset_index);
    auto b_addr = memory_manager.get_memory_offset_16_bit(instruction.argument_tag.value, instruction.b_offset_index);
    if (!a_addr.has_value() || !b_addr.has_value()) {
        return;
    }

    auto shr_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_16)
                                  .operand(a_addr.value())
                                  .operand(b_addr.value())
                                  .operand(instruction.result_offset)
                                  .build();
    instructions.push_back(shr_16_instruction);
    memory_manager.set_memory_address(instruction.argument_tag.value, instruction.result_offset);
}

void ProgramBlock::process_cast_8_instruction(CAST_8_Instruction instruction)
{
    auto src_addr = memory_manager.get_memory_offset_8_bit(instruction.src_tag.value, instruction.src_offset_index);
    if (!src_addr.has_value()) {
        return;
    }

    auto cast_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_8)
                                  .operand(src_addr.value())
                                  .operand(instruction.dst_offset)
                                  .operand(instruction.target_tag.value)
                                  .build();
    instructions.push_back(cast_8_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value, instruction.dst_offset);
}

void ProgramBlock::process_cast_16_instruction(CAST_16_Instruction instruction)
{
    auto src_addr = memory_manager.get_memory_offset_16_bit(instruction.src_tag.value, instruction.src_offset_index);
    if (!src_addr.has_value()) {
        return;
    }

    auto cast_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_16)
                                   .operand(src_addr.value())
                                   .operand(instruction.dst_offset)
                                   .operand(instruction.target_tag.value)
                                   .build();
    instructions.push_back(cast_16_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value, instruction.dst_offset);
}

void ProgramBlock::process_sstore_instruction(SSTORE_Instruction instruction)
{
    auto src_addr = memory_manager.get_memory_offset_16_bit(bb::avm2::MemoryTag::FF, instruction.src_offset_index);
    if (!src_addr.has_value()) {
        return;
    }
    auto set_slot_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                    .offset = instruction.slot_offset,
                                                    .value = instruction.slot };
    this->process_set_ff_instruction(set_slot_instruction);

    auto sstore_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SSTORE)
                                  .operand(src_addr.value())
                                  .operand(instruction.slot_offset)
                                  .build();
    instructions.push_back(sstore_instruction);
}

void ProgramBlock::process_sload_instruction(SLOAD_Instruction instruction)
{
    auto slot_addr = memory_manager.get_slot(instruction.slot_index);
    if (!slot_addr.has_value()) {
        return;
    }

    auto set_slot_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                    .offset = instruction.slot_offset,
                                                    .value = *slot_addr };
    this->process_set_ff_instruction(set_slot_instruction);

    auto sload_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SLOAD)
                                 .operand(instruction.slot_offset)
                                 .operand(instruction.result_offset)
                                 .build();
    instructions.push_back(sload_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, instruction.result_offset);
}

void ProgramBlock::process_getenvvar_instruction(GETENVVAR_Instruction instruction)
{
    auto instruction_type = static_cast<uint8_t>(instruction.type % 12);
    auto getenvvar_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::GETENVVAR_16)
                                     .operand(instruction.result_offset)
                                     .operand(instruction_type)
                                     .build();
    instructions.push_back(getenvvar_instruction);
    // special case for timestamp, it returns a 64-bit value
    if (instruction_type == 6) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::U64, instruction.result_offset);
    } else {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, instruction.result_offset);
    }
}

void ProgramBlock::process_emitnulifier_instruction(EMITNULLIFIER_Instruction instruction)
{
    auto nullifier_addr =
        memory_manager.get_memory_offset_16_bit(bb::avm2::MemoryTag::FF, instruction.nullifier_offset_index);
    if (!nullifier_addr.has_value()) {
        return;
    }

    auto emitnulifier_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNULLIFIER)
                                        .operand(nullifier_addr.value())
                                        .build();
    instructions.push_back(emitnulifier_instruction);
}

void ProgramBlock::process_nullifierexists_instruction(NULLIFIEREXISTS_Instruction instruction)
{
    auto nullifier_addr =
        memory_manager.get_memory_offset_16_bit(bb::avm2::MemoryTag::FF, instruction.nullifier_offset_index);
    if (!nullifier_addr.has_value()) {
        return;
    }

    auto get_contract_address_instruction =
        GETENVVAR_Instruction{ .result_offset = instruction.contract_address_offset, .type = 0 };
    this->process_getenvvar_instruction(get_contract_address_instruction);

    auto nullifierexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NULLIFIEREXISTS)
                                           .operand(nullifier_addr.value())
                                           .operand(instruction.contract_address_offset)
                                           .operand(instruction.result_offset)
                                           .build();
    instructions.push_back(nullifierexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::process_emitnotehash_instruction(EMITNOTEHASH_Instruction instruction)
{
    auto set_note_hash_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .offset = instruction.note_hash_offset,
                                                         .value = instruction.note_hash };
    this->process_set_ff_instruction(set_note_hash_instruction);

    auto emitnotehash_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNOTEHASH)
                                        .operand(instruction.note_hash_offset)
                                        .build();
    instructions.push_back(emitnotehash_instruction);
    memory_manager.append_emitted_note_hash(instruction.note_hash);
}

void ProgramBlock::process_notehashexists_instruction(NOTEHASHEXISTS_Instruction instruction)
{
    auto note_hash = memory_manager.get_emitted_note_hash(instruction.notehash_index);
    if (!note_hash.has_value()) {
        return;
    }
    auto leaf_index = memory_manager.get_leaf_index(instruction.notehash_index);
    if (!leaf_index.has_value()) {
        return;
    }
    auto set_note_hash_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .offset = instruction.notehash_offset,
                                                         .value = *note_hash };
    this->process_set_ff_instruction(set_note_hash_instruction);
    auto set_leaf_index_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::U64,
                                                          .offset = instruction.leaf_index_offset,
                                                          .value = *leaf_index };
    this->process_set_ff_instruction(set_leaf_index_instruction);

    auto notehashexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOTEHASHEXISTS)
                                          .operand(instruction.notehash_offset)
                                          .operand(instruction.leaf_index_offset)
                                          .operand(instruction.result_offset)
                                          .build();
    instructions.push_back(notehashexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_offset);
}

void ProgramBlock::finalize_with_return(uint8_t return_size,
                                        MemoryTagWrapper return_value_tag,
                                        uint16_t return_value_offset_index)
{
    auto return_addr = memory_manager.get_memory_offset_16_bit(return_value_tag.value, return_value_offset_index);
    if (!return_addr.has_value()) {
        return_addr = std::optional<uint16_t>(0);
    }

    // TODO(defkit): return_size_offset should be const and defined by fuzzer

    uint16_t return_size_offset = 5U;
    auto set_size_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                                    .operand(return_size_offset)
                                    .operand(bb::avm2::MemoryTag::U32)
                                    .operand(static_cast<uint16_t>(return_size))
                                    .build();
    instructions.push_back(set_size_instruction);
    auto return_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURN)
                                  .operand(return_size_offset)
                                  .operand(return_addr.value())
                                  .build();
    instructions.push_back(return_instruction);

    terminated = true;
}

void ProgramBlock::finalize_with_jump(ProgramBlock* target_block, bool copy_memory_manager)
{
    terminated = true;
    successors.push_back(target_block);
    target_block->predecessors.push_back(this);
    if (copy_memory_manager) {
        target_block->memory_manager = memory_manager;
    }
}

void ProgramBlock::finalize_with_jump_if(ProgramBlock* target_then_block,
                                         ProgramBlock* target_else_block,
                                         uint16_t condition_offset,
                                         bool copy_memory_manager)
{
    terminated = true;
    successors.push_back(target_then_block);
    successors.push_back(target_else_block);
    this->condition_offset_index = condition_offset;
    target_then_block->predecessors.push_back(this);
    target_else_block->predecessors.push_back(this);
    if (copy_memory_manager) {
        target_then_block->memory_manager = memory_manager;
        target_else_block->memory_manager = memory_manager;
    }
}

std::optional<uint16_t> ProgramBlock::get_terminating_condition_value()
{
    auto condition_addr = memory_manager.get_memory_offset_16_bit(bb::avm2::MemoryTag::U1, condition_offset_index);
    if (!condition_addr.has_value()) {
        return std::nullopt;
    }
    return condition_addr;
}

bool ProgramBlock::is_memory_address_set(uint16_t address)
{
    return memory_manager.is_memory_address_set(address);
}

void ProgramBlock::process_instruction(FuzzInstruction instruction)
{
    std::visit(
        overloaded_instruction{
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
            [this](SET_16_Instruction instruction) { return this->process_set_16_instruction(instruction); },
            [this](SET_32_Instruction instruction) { return this->process_set_32_instruction(instruction); },
            [this](SET_64_Instruction instruction) { return this->process_set_64_instruction(instruction); },
            [this](SET_128_Instruction instruction) { return this->process_set_128_instruction(instruction); },
            [this](SET_FF_Instruction instruction) { return this->process_set_ff_instruction(instruction); },
            [this](MOV_8_Instruction instruction) { return this->process_mov_8_instruction(instruction); },
            [this](MOV_16_Instruction instruction) { return this->process_mov_16_instruction(instruction); },
            [this](FDIV_8_Instruction instruction) { return this->process_fdiv_8_instruction(instruction); },
            [this](NOT_8_Instruction instruction) { return this->process_not_8_instruction(instruction); },
            [this](ADD_16_Instruction instruction) { return this->process_add_16_instruction(instruction); },
            [this](SUB_16_Instruction instruction) { return this->process_sub_16_instruction(instruction); },
            [this](MUL_16_Instruction instruction) { return this->process_mul_16_instruction(instruction); },
            [this](DIV_16_Instruction instruction) { return this->process_div_16_instruction(instruction); },
            [this](FDIV_16_Instruction instruction) { return this->process_fdiv_16_instruction(instruction); },
            [this](EQ_16_Instruction instruction) { return this->process_eq_16_instruction(instruction); },
            [this](LT_16_Instruction instruction) { return this->process_lt_16_instruction(instruction); },
            [this](LTE_16_Instruction instruction) { return this->process_lte_16_instruction(instruction); },
            [this](AND_16_Instruction instruction) { return this->process_and_16_instruction(instruction); },
            [this](OR_16_Instruction instruction) { return this->process_or_16_instruction(instruction); },
            [this](XOR_16_Instruction instruction) { return this->process_xor_16_instruction(instruction); },
            [this](NOT_16_Instruction instruction) { return this->process_not_16_instruction(instruction); },
            [this](SHL_16_Instruction instruction) { return this->process_shl_16_instruction(instruction); },
            [this](SHR_16_Instruction instruction) { return this->process_shr_16_instruction(instruction); },
            [this](CAST_8_Instruction instruction) { return this->process_cast_8_instruction(instruction); },
            [this](CAST_16_Instruction instruction) { return this->process_cast_16_instruction(instruction); },
            [this](SSTORE_Instruction instruction) { return this->process_sstore_instruction(instruction); },
            [this](SLOAD_Instruction instruction) { return this->process_sload_instruction(instruction); },
            [this](GETENVVAR_Instruction instruction) { return this->process_getenvvar_instruction(instruction); },
            [this](EMITNULLIFIER_Instruction instruction) {
                return this->process_emitnulifier_instruction(instruction);
            },
            [this](NULLIFIEREXISTS_Instruction instruction) {
                return this->process_nullifierexists_instruction(instruction);
            },
            [this](EMITNOTEHASH_Instruction instruction) {
                return this->process_emitnotehash_instruction(instruction);
            },
            [this](NOTEHASHEXISTS_Instruction instruction) {
                return this->process_notehashexists_instruction(instruction);
            },
            [](auto) { throw std::runtime_error("Unknown instruction"); },
        },
        instruction);
}

std::vector<bb::avm2::simulation::Instruction> ProgramBlock::get_instructions()
{
    return instructions;
}

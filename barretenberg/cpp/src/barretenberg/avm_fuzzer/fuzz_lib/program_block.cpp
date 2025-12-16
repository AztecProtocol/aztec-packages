#include "barretenberg/avm_fuzzer/fuzz_lib/program_block.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/contract_db_proxy.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

void ProgramBlock::preprocess_memory_addresses(AddressRef address, uint32_t actual_address)
{
    auto set_base_offset_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                                           .operand(static_cast<uint16_t>(0))
                                           .operand(bb::avm2::MemoryTag::U32)
                                           .operand(address.base_offset)
                                           .build();
    auto set_pointer_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                                       .operand(address.pointer_address)
                                       .operand(bb::avm2::MemoryTag::U32)
                                       .operand(actual_address)
                                       .build();
    switch (address.mode) {
    case AddressingMode::Indirect: {
        instructions.push_back(set_pointer_instruction);
        memory_manager.set_memory_address(bb::avm2::ValueTag::U32, address.pointer_address);
        break;
    }
    case AddressingMode::Relative: {
        instructions.push_back(set_base_offset_instruction);
        memory_manager.set_memory_address(bb::avm2::ValueTag::U32, 0U);
        break;
    }
    case AddressingMode::IndirectRelative: {
        instructions.push_back(set_pointer_instruction);
        instructions.push_back(set_base_offset_instruction);
        memory_manager.set_memory_address(bb::avm2::ValueTag::U32, address.pointer_address);
        memory_manager.set_memory_address(bb::avm2::ValueTag::U32, 0U);
        break;
    }
    case AddressingMode::Direct:
        break;
    }
}

void ProgramBlock::preprocess_memory_addresses(ResultAddressRef address, uint32_t actual_address)
{
    // hack: just converting it to AddressRef and using the same function
    auto address_ref = AddressRef{ .tag = bb::avm2::ValueTag::U32,
                                   .pointer_address = address.pointer_address,
                                   .base_offset = address.base_offset,
                                   .mode = address.mode };
    preprocess_memory_addresses(address_ref, actual_address);
}

void ProgramBlock::process_add_8_instruction(ADD_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(add_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_sub_8_instruction(SUB_8_Instruction instruction)
{

    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto sub_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(sub_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_mul_8_instruction(MUL_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto mul_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(mul_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_div_8_instruction(DIV_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto div_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(div_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_eq_8_instruction(EQ_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto eq_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(eq_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_lt_8_instruction(LT_8_Instruction instruction)
{

    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto lt_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(lt_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_lte_8_instruction(LTE_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto lte_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(lte_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_and_8_instruction(AND_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto and_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(and_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_or_8_instruction(OR_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto or_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(or_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_xor_8_instruction(XOR_8_Instruction instruction)
{
    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto xor_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(xor_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_shl_8_instruction(SHL_8_Instruction instruction)
{

    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto shl_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(shl_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_shr_8_instruction(SHR_8_Instruction instruction)
{

    auto a = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a.value().first);
    preprocess_memory_addresses(instruction.b_address, b.value().first);
    preprocess_memory_addresses(instruction.result_address, result.value().first);
    auto shr_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(shr_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_set_16_instruction(SET_16_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_set_32_instruction(SET_32_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_set_64_instruction(SET_64_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_64)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_set_128_instruction(SET_128_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    uint128_t value =
        (static_cast<uint128_t>(instruction.value_high) << 64) | static_cast<uint128_t>(instruction.value_low);
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_128)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_set_ff_instruction(SET_FF_Instruction instruction)
{
    auto effective_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_FF)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_mov_8_instruction(MOV_8_Instruction instruction)
{
    auto src_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.src_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.src_address, src_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto mov_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_8)
                                 .operand(src_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(mov_8_instruction);
    memory_manager.set_memory_address(instruction.src_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_mov_16_instruction(MOV_16_Instruction instruction)
{
    auto src_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.src_address, src_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto mov_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_16)
                                  .operand(src_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(mov_16_instruction);
    memory_manager.set_memory_address(instruction.src_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_fdiv_8_instruction(FDIV_8_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto fdiv_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_8)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(fdiv_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_not_8_instruction(NOT_8_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.a_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!a_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto not_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_8)
                                 .operand(a_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(not_8_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_add_16_instruction(ADD_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto add_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(add_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_sub_16_instruction(SUB_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto sub_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(sub_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_mul_16_instruction(MUL_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto mul_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(mul_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_div_16_instruction(DIV_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto div_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(div_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_fdiv_16_instruction(FDIV_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto fdiv_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_16)
                                   .operand(a_address_operand.value().second)
                                   .operand(b_address_operand.value().second)
                                   .operand(result_address_operand.value().second)
                                   .build();
    instructions.push_back(fdiv_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_eq_16_instruction(EQ_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto eq_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(eq_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_lt_16_instruction(LT_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto lt_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(lt_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_lte_16_instruction(LTE_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto lte_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(lte_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_and_16_instruction(AND_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto and_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(and_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_or_16_instruction(OR_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto or_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(or_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_xor_16_instruction(XOR_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto xor_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(xor_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_not_16_instruction(NOT_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto not_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(not_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_shl_16_instruction(SHL_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);

    auto shl_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(shl_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_shr_16_instruction(SHR_16_Instruction instruction)
{
    auto a_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.a_address, a_address_operand.value().first);
    preprocess_memory_addresses(instruction.b_address, b_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto shr_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(shr_16_instruction);
    memory_manager.set_memory_address(instruction.a_address.tag, instruction.result_address.address);
}

void ProgramBlock::process_cast_8_instruction(CAST_8_Instruction instruction)
{
    auto src_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.src_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_8(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.src_address, src_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto cast_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_8)
                                  .operand(src_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .operand(instruction.target_tag.value)
                                  .build();
    instructions.push_back(cast_8_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_cast_16_instruction(CAST_16_Instruction instruction)
{
    auto src_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.src_address, src_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto cast_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_16)
                                   .operand(src_address_operand.value().second)
                                   .operand(result_address_operand.value().second)
                                   .operand(instruction.target_tag.value)
                                   .build();
    instructions.push_back(cast_16_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value, instruction.result_address.address);
}

void ProgramBlock::process_sstore_instruction(SSTORE_Instruction instruction)
{
    auto src_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.src_address, src_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto set_slot_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                    .result_address = instruction.result_address,
                                                    .value = instruction.slot };
    this->process_set_ff_instruction(set_slot_instruction);
    auto sstore_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SSTORE)
                                  .operand(src_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(sstore_instruction);
    memory_manager.append_slot(instruction.slot);
}

void ProgramBlock::process_sload_instruction(SLOAD_Instruction instruction)
{
    auto slot_addr = memory_manager.get_slot(instruction.slot_index);
    if (!slot_addr.has_value()) {
        return;
    }

    auto set_slot_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                    .result_address = instruction.slot_address,
                                                    .value = *slot_addr };
    this->process_set_ff_instruction(set_slot_instruction);
    auto slot_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.slot_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!slot_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.slot_address, slot_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);

    auto sload_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SLOAD)
                                 .operand(slot_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(sload_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, instruction.result_address.address);
}

void ProgramBlock::process_getenvvar_instruction(GETENVVAR_Instruction instruction)
{
    auto instruction_type = static_cast<uint8_t>(instruction.type % 12);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto getenvvar_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::GETENVVAR_16)
                                     .operand(result_address_operand.value().second)
                                     .operand(instruction_type)
                                     .build();
    instructions.push_back(getenvvar_instruction);
    // special case for timestamp, it returns a 64-bit value
    if (instruction_type == 6) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::U64, instruction.result_address.address);
    } else {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, instruction.result_address.address);
    }
}

void ProgramBlock::process_emitnulifier_instruction(EMITNULLIFIER_Instruction instruction)
{
    auto nullifier_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.nullifier_address);
    if (!nullifier_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.nullifier_address, nullifier_address_operand.value().first);
    auto emitnulifier_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNULLIFIER)
                                        .operand(nullifier_address_operand.value().second)
                                        .build();
    instructions.push_back(emitnulifier_instruction);
}

void ProgramBlock::process_nullifierexists_instruction(NULLIFIEREXISTS_Instruction instruction)
{
    auto nullifier_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.nullifier_address);
    auto contract_address_operand =
        memory_manager.get_memory_address_and_operand_16(instruction.contract_address_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!nullifier_address_operand.has_value() || !contract_address_operand.has_value() ||
        !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.nullifier_address, nullifier_address_operand.value().first);
    preprocess_memory_addresses(instruction.contract_address_address, contract_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);
    auto get_contract_address_instruction =
        GETENVVAR_Instruction{ .result_address = instruction.contract_address_address, .type = 0 };
    this->process_getenvvar_instruction(get_contract_address_instruction);

    auto nullifierexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NULLIFIEREXISTS)
                                           .operand(nullifier_address_operand.value().second)
                                           .operand(contract_address_operand.value().second)
                                           .operand(result_address_operand.value().second)
                                           .build();
    instructions.push_back(nullifierexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_emitnotehash_instruction(EMITNOTEHASH_Instruction instruction)
{
    auto set_note_hash_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = instruction.note_hash_address,
                                                         .value = instruction.note_hash };
    this->process_set_ff_instruction(set_note_hash_instruction);

    // EMITNOTEHASH expects UINT16 operand
    auto note_hash_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.note_hash_address);
    if (!note_hash_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.note_hash_address, note_hash_address_operand.value().first);

    auto emitnotehash_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNOTEHASH)
                                        .operand(note_hash_address_operand.value().second)
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
    auto contract_address = CONTRACT_ADDRESS;
    auto note_hash_counter = static_cast<uint64_t>(*leaf_index);
    auto siloed_note_computed_hash = bb::avm2::simulation::unconstrained_silo_note_hash(contract_address, *note_hash);
    auto unique_note_computed_hash = bb::avm2::simulation::unconstrained_make_unique_note_hash(
        siloed_note_computed_hash, FIRST_NULLIFIER, note_hash_counter);

    auto set_note_hash_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = instruction.notehash_address,
                                                         .value = unique_note_computed_hash };
    this->process_set_ff_instruction(set_note_hash_instruction);
    auto set_leaf_index_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::U64,
                                                          .result_address = instruction.leaf_index_address,
                                                          .value = *leaf_index };
    this->process_set_ff_instruction(set_leaf_index_instruction);

    auto notehash_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.notehash_address);
    auto leaf_index_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.leaf_index_address);
    auto result_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.result_address);
    if (!notehash_address_operand.has_value() || !leaf_index_address_operand.has_value() ||
        !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.notehash_address, notehash_address_operand.value().first);
    preprocess_memory_addresses(instruction.leaf_index_address, leaf_index_address_operand.value().first);
    preprocess_memory_addresses(instruction.result_address, result_address_operand.value().first);

    auto notehashexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOTEHASHEXISTS)
                                          .operand(notehash_address_operand.value().second)
                                          .operand(leaf_index_address_operand.value().second)
                                          .operand(result_address_operand.value().second)
                                          .build();
    instructions.push_back(notehashexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, instruction.result_address.address);
}

void ProgramBlock::process_calldatacopy_instruction(CALLDATACOPY_Instruction instruction)
{
    auto copy_size_set_instruction = SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                         .result_address = instruction.copy_size_address,
                                                         .value = instruction.copy_size };
    this->process_set_32_instruction(copy_size_set_instruction);
    auto cd_start_set_instruction = SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                        .result_address = instruction.cd_start_address,
                                                        .value = instruction.cd_start };
    this->process_set_32_instruction(cd_start_set_instruction);
    // CALLDATACOPY expects UINT16 operands for all three addresses
    auto copy_size_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.copy_size_address);
    auto cd_start_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.cd_start_address);
    auto dst_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.dst_address);
    if (!copy_size_address_operand.has_value() || !cd_start_address_operand.has_value() ||
        !dst_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(instruction.copy_size_address, copy_size_address_operand.value().first);
    preprocess_memory_addresses(instruction.cd_start_address, cd_start_address_operand.value().first);
    preprocess_memory_addresses(instruction.dst_address, dst_address_operand.value().first);
    auto calldatacopy_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CALLDATACOPY)
                                        .operand(copy_size_address_operand.value().second)
                                        .operand(cd_start_address_operand.value().second)
                                        .operand(dst_address_operand.value().second)
                                        .build();
    instructions.push_back(calldatacopy_instruction);

    // setting calldata_addr to u32 to avoid overflows
    auto loop_upper_bound =
        static_cast<uint32_t>(std::min((instruction.dst_address.address) + instruction.copy_size, 65535U));
    for (uint32_t calldata_addr = instruction.dst_address.address; calldata_addr < loop_upper_bound; calldata_addr++) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, calldata_addr);
    }
}

void ProgramBlock::process_sendl2tol1msg_instruction(SENDL2TOL1MSG_Instruction instruction)
{
    auto set_recipient_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = instruction.recipient_address,
                                                         .value = instruction.recipient };
    this->process_set_ff_instruction(set_recipient_instruction);
    auto set_content_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                       .result_address = instruction.content_address,
                                                       .value = instruction.content };
    this->process_set_ff_instruction(set_content_instruction);

    auto recipient_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.recipient_address);
    auto content_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.content_address);
    if (!recipient_address_operand.has_value() || !content_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.recipient_address, recipient_address_operand.value().first);
    preprocess_memory_addresses(instruction.content_address, content_address_operand.value().first);
    auto sendl2tol1msg_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SENDL2TOL1MSG)
                                         .operand(recipient_address_operand.value().second)
                                         .operand(content_address_operand.value().second)
                                         .build();
    instructions.push_back(sendl2tol1msg_instruction);
}

void ProgramBlock::process_emitunencryptedlog_instruction(EMITUNENCRYPTEDLOG_Instruction instruction)
{
    auto log_size_set_instruction = SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                        .result_address = instruction.log_size_address,
                                                        .value = instruction.log_size };
    this->process_set_32_instruction(log_size_set_instruction);
    size_t counter = 0;
    for (const auto& value : instruction.log_values) {
        auto log_values_address =
            ResultAddressRef{ .address = static_cast<uint32_t>(instruction.log_values_address_start + counter),
                              .mode = AddressingMode::Direct };
        auto set_value_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = log_values_address,
                                                         .value = value };
        this->process_set_ff_instruction(set_value_instruction);
        counter++;
    }
    auto log_size_address_operand = memory_manager.get_memory_address_and_operand_16(instruction.log_size_address);
    if (!log_size_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(instruction.log_size_address, log_size_address_operand.value().first);
    auto emitunencryptedlog_instruction =
        bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITUNENCRYPTEDLOG)
            .operand(log_size_address_operand.value().second)
            .operand(instruction.log_values_address_start)
            .build();
    instructions.push_back(emitunencryptedlog_instruction);
}

void ProgramBlock::process_call_instruction(CALL_Instruction instruction)
{
    FF function_address =
        bb::avm2::fuzzer::ContractDBProxy::get_instance()->get_function_address(instruction.function_index);
    auto set_function_address_instruction =
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                            .result_address = ResultAddressRef{ .address = instruction.address_offset,
                                                                .mode = AddressingMode::Direct },
                            .value = function_address };
    this->process_set_ff_instruction(set_function_address_instruction);
    auto set_l2_gas_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = ResultAddressRef{ .address = instruction.l2_gas_address,
                                                                .mode = AddressingMode::Direct },
                            .value = instruction.l2_gas };
    this->process_set_32_instruction(set_l2_gas_instruction);
    auto set_da_gas_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = ResultAddressRef{ .address = instruction.da_gas_address,
                                                                .mode = AddressingMode::Direct },
                            .value = instruction.da_gas };
    this->process_set_32_instruction(set_da_gas_instruction);
    auto set_arg_size_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = ResultAddressRef{ .address = instruction.arg_size_offset,
                                                                .mode = AddressingMode::Direct },
                            .value = static_cast<uint32_t>(instruction.args.size()) };
    this->process_set_32_instruction(set_arg_size_instruction);

    uint16_t arg_index = 0;
    for (const auto& arg : instruction.args) {
        auto set_arg_instruction = SET_FF_Instruction{
            .value_tag = bb::avm2::MemoryTag::FF,
            .result_address = ResultAddressRef{ .address = static_cast<uint32_t>(instruction.args_offset + arg_index),
                                                .mode = AddressingMode::Direct },
            .value = arg
        };
        this->process_set_ff_instruction(set_arg_instruction);
        arg_index++;
    }
    auto call_instruction_builde = instruction.is_static_call
                                       ? bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::STATICCALL)
                                       : bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CALL);
    auto call_instruction = call_instruction_builde.operand(instruction.l2_gas_address)
                                .operand(instruction.da_gas_address)
                                .operand(instruction.address_offset)
                                .operand(instruction.arg_size_offset)
                                .operand(instruction.args_offset)
                                .build();
    instructions.push_back(call_instruction);
}

void ProgramBlock::process_returndatasize_with_returndatacopy_instruction(
    RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction instruction)
{
    auto returndatasize_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURNDATASIZE)
                                          .operand(instruction.copy_size_offset)
                                          .build();
    instructions.push_back(returndatasize_instruction);
    auto rd_start_set_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = ResultAddressRef{ .address = instruction.rd_start_offset,
                                                                .mode = AddressingMode::Direct },
                            .value = instruction.rd_start };
    this->process_set_32_instruction(rd_start_set_instruction);
    auto returndatacopy_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURNDATACOPY)
                                          .operand(instruction.copy_size_offset)
                                          .operand(instruction.rd_start_offset)
                                          .operand(instruction.dst_address)
                                          .build();
    // TODO(defkit): function can return more than one value :D
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, instruction.dst_address);
    instructions.push_back(returndatacopy_instruction);
}

void ProgramBlock::finalize_with_return(uint8_t return_size,
                                        MemoryTagWrapper return_value_tag,
                                        uint16_t return_value_offset_index)
{
    this->terminator_type = TerminatorType::RETURN;
    // if the block is called by INTERNALCALL, just insert INTERNALRETURN
    if (caller != nullptr) {
        auto internalreturn_instruction =
            bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::INTERNALRETURN).build();
        instructions.push_back(internalreturn_instruction);
        return;
    }

    auto return_addr = memory_manager.get_memory_offset(return_value_tag.value, return_value_offset_index);
    if (!return_addr.has_value()) {
        return_addr = std::optional<uint32_t>(0);
    }

    // TODO(defkit): return_size_offset should be const and defined by fuzzer

    uint16_t return_size_offset = 5U;
    // Ensure operands are created as U16 to match wire format (UINT16)
    auto set_size_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                                    .operand(return_size_offset)
                                    .operand(bb::avm2::MemoryTag::U32)
                                    .operand(static_cast<uint16_t>(return_size))
                                    .build();
    instructions.push_back(set_size_instruction);
    // RETURN expects UINT16 operands, ensure we cast to uint16_t explicitly
    auto return_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURN)
                                  .operand(static_cast<uint16_t>(return_size_offset))
                                  .operand(static_cast<uint16_t>(return_addr.value()))
                                  .build();
    instructions.push_back(return_instruction);
}

void ProgramBlock::finalize_with_jump(ProgramBlock* target_block, bool copy_memory_manager)
{
    this->terminator_type = TerminatorType::JUMP;
    successors.push_back(target_block);
    target_block->predecessors.push_back(this);
    target_block->caller = this->caller;
    if (copy_memory_manager) {
        target_block->memory_manager = memory_manager;
    }
}

void ProgramBlock::finalize_with_jump_if(ProgramBlock* target_then_block,
                                         ProgramBlock* target_else_block,
                                         uint16_t condition_offset,
                                         bool copy_memory_manager)
{
    this->terminator_type = TerminatorType::JUMP_IF;
    successors.push_back(target_then_block);
    successors.push_back(target_else_block);
    this->condition_offset_index = condition_offset;
    target_then_block->predecessors.push_back(this);
    target_else_block->predecessors.push_back(this);
    target_then_block->caller = this->caller;
    target_else_block->caller = this->caller;
    if (copy_memory_manager) {
        target_then_block->memory_manager = memory_manager;
        target_else_block->memory_manager = memory_manager;
    }
}

void ProgramBlock::insert_internal_call(ProgramBlock* target_block)
{
    auto internalcall_instruction =
        bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::INTERNALCALL).operand(0U).build();
    instructions.push_back(internalcall_instruction);
    internal_call_instruction_indicies_to_patch[instructions.size() - 1] = target_block;
    this->successors.push_back(target_block);
    target_block->predecessors.push_back(this);
    target_block->caller = this->caller;
}

void ProgramBlock::patch_internal_calls()
{
    for (auto [instruction_index, target_block] : internal_call_instruction_indicies_to_patch) {
        auto internalcall_instruction = instructions.at(instruction_index);
        if (target_block->offset == -1) {
            throw std::runtime_error("Target block offset is not set, should not happen");
        }
        auto internalcall_instruction_builder =
            bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::INTERNALCALL)
                .operand(static_cast<uint32_t>(target_block->offset));
        instructions.at(instruction_index) = internalcall_instruction_builder.build();
    }
    internal_call_instruction_indicies_to_patch.clear();
}

std::optional<uint16_t> ProgramBlock::get_terminating_condition_value()
{
    auto condition_addr = memory_manager.get_memory_offset(bb::avm2::MemoryTag::U1, condition_offset_index);
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
            [this](CALLDATACOPY_Instruction instruction) {
                return this->process_calldatacopy_instruction(instruction);
            },
            [this](SENDL2TOL1MSG_Instruction instruction) {
                return this->process_sendl2tol1msg_instruction(instruction);
            },
            [this](EMITUNENCRYPTEDLOG_Instruction instruction) {
                return this->process_emitunencryptedlog_instruction(instruction);
            },
            [this](CALL_Instruction instruction) { return this->process_call_instruction(instruction); },
            [this](RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction instruction) {
                return this->process_returndatasize_with_returndatacopy_instruction(instruction);
            },
            [](auto) { throw std::runtime_error("Unknown instruction"); },
        },
        instruction);
}

std::vector<bb::avm2::simulation::Instruction> ProgramBlock::get_instructions()
{
    return instructions;
}

#include "barretenberg/avm_fuzzer/fuzz_lib/program_block.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction_settings.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

void ProgramBlock::preprocess_memory_addresses(ResolvedAddress resolved_address)
{
    if (resolved_address.pointer_address.has_value()) {
        if (resolved_address.via_relative) {
            // Indirect relative: Write the pointer in a relative manner
            auto set_pointer_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                                               .operand(static_cast<uint16_t>(resolved_address.operand_address))
                                               .relative()
                                               .operand(bb::avm2::MemoryTag::U32)
                                               .operand(resolved_address.absolute_address)
                                               .build();
            instructions.push_back(set_pointer_instruction);
        } else {
            // Indirect: Write the pointer directly
            auto set_pointer_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                                               .operand(static_cast<uint16_t>(resolved_address.pointer_address.value()))
                                               .operand(bb::avm2::MemoryTag::U32)
                                               .operand(resolved_address.absolute_address)
                                               .build();
            instructions.push_back(set_pointer_instruction);
        }

        memory_manager.set_memory_address(bb::avm2::ValueTag::U32, resolved_address.pointer_address.value());
    }
}

void ProgramBlock::record_result_tag_from_param_tags(std::initializer_list<ParamRef> params,
                                                     ResolvedAddress result_address)
{
    for (const auto& param : params) {
        auto tag =
            std::visit(overloaded{ [](const VariableRef& var) -> std::optional<MemoryTag> { return var.tag.value; },
                                   [](const AddressRef&) -> std::optional<MemoryTag> { return std::nullopt; } },
                       param);
        if (tag.has_value()) {
            memory_manager.set_memory_address(tag.value(), result_address.absolute_address);
            return;
        }
    }
}

void ProgramBlock::process_add_8_instruction(ADD_8_Instruction instruction)
{
#ifdef DISABLE_ADD_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);

    auto add_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(add_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_sub_8_instruction(SUB_8_Instruction instruction)
{
#ifdef DISABLE_SUB_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto sub_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(sub_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_mul_8_instruction(MUL_8_Instruction instruction)
{
#ifdef DISABLE_MUL_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto mul_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(mul_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_div_8_instruction(DIV_8_Instruction instruction)
{
#ifdef DISABLE_DIV_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto div_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(div_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_eq_8_instruction(EQ_8_Instruction instruction)
{
#ifdef DISABLE_EQ_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto eq_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(eq_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result.value().first.absolute_address);
}

void ProgramBlock::process_lt_8_instruction(LT_8_Instruction instruction)
{
#ifdef DISABLE_LT_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto lt_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(lt_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result.value().first.absolute_address);
}

void ProgramBlock::process_lte_8_instruction(LTE_8_Instruction instruction)
{
#ifdef DISABLE_LTE_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }
    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto lte_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(lte_8_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result.value().first.absolute_address);
}

void ProgramBlock::process_and_8_instruction(AND_8_Instruction instruction)
{
#ifdef DISABLE_AND_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto and_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(and_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_or_8_instruction(OR_8_Instruction instruction)
{
#ifdef DISABLE_OR_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto or_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_8)
                                .operand(a.value().second)
                                .operand(b.value().second)
                                .operand(result.value().second)
                                .build();
    instructions.push_back(or_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_xor_8_instruction(XOR_8_Instruction instruction)
{
#ifdef DISABLE_XOR_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto xor_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(xor_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_shl_8_instruction(SHL_8_Instruction instruction)
{
#ifdef DISABLE_SHL_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto shl_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(shl_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_shr_8_instruction(SHR_8_Instruction instruction)
{
#ifdef DISABLE_SHR_8_INSTRUCTION
    return;
#endif
    auto a = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a.has_value() || !b.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(a.value().first);
    preprocess_memory_addresses(b.value().first);
    preprocess_memory_addresses(result.value().first);
    auto shr_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_8)
                                 .operand(a.value().second)
                                 .operand(b.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(shr_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address }, result.value().first);
}

void ProgramBlock::process_set_8_instruction(SET_8_Instruction instruction)
{
#ifdef DISABLE_SET_8_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_8)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_set_16_instruction(SET_16_Instruction instruction)
{
#ifdef DISABLE_SET_16_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_set_32_instruction(SET_32_Instruction instruction)
{
#ifdef DISABLE_SET_32_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_32)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_set_64_instruction(SET_64_Instruction instruction)
{
#ifdef DISABLE_SET_64_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_64)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_set_128_instruction(SET_128_Instruction instruction)
{
#ifdef DISABLE_SET_128_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    uint128_t value =
        (static_cast<uint128_t>(instruction.value_high) << 64) | static_cast<uint128_t>(instruction.value_low);
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_128)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_set_ff_instruction(SET_FF_Instruction instruction)
{
#ifdef DISABLE_SET_FF_INSTRUCTION
    return;
#endif
    auto effective_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!effective_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(effective_address_operand.value().first);
    instructions.push_back(bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_FF)
                               .operand(effective_address_operand.value().second)
                               .operand(instruction.value_tag.value)
                               .operand(instruction.value)
                               .build());
    memory_manager.set_memory_address(instruction.value_tag.value,
                                      effective_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_mov_8_instruction(MOV_8_Instruction instruction)
{
#ifdef DISABLE_MOV_8_INSTRUCTION
    return;
#endif
    auto src_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.src_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(src_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto mov_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_8)
                                 .operand(src_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(mov_8_instruction);
    record_result_tag_from_param_tags({ instruction.src_address }, result_address_operand.value().first);
}

void ProgramBlock::process_mov_16_instruction(MOV_16_Instruction instruction)
{
#ifdef DISABLE_MOV_16_INSTRUCTION
    return;
#endif
    auto src_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(src_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto mov_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MOV_16)
                                  .operand(src_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(mov_16_instruction);
    record_result_tag_from_param_tags({ instruction.src_address }, result_address_operand.value().first);
}

void ProgramBlock::process_fdiv_8_instruction(FDIV_8_Instruction instruction)
{
#ifdef DISABLE_FDIV_8_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto fdiv_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_8)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(fdiv_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_not_8_instruction(NOT_8_Instruction instruction)
{
#ifdef DISABLE_NOT_8_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.a_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!a_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto not_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_8)
                                 .operand(a_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(not_8_instruction);
    record_result_tag_from_param_tags({ instruction.a_address }, result_address_operand.value().first);
}

void ProgramBlock::process_add_16_instruction(ADD_16_Instruction instruction)
{
#ifdef DISABLE_ADD_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto add_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ADD_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(add_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_sub_16_instruction(SUB_16_Instruction instruction)
{
#ifdef DISABLE_SUB_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto sub_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUB_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(sub_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_mul_16_instruction(MUL_16_Instruction instruction)
{
#ifdef DISABLE_MUL_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto mul_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::MUL_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(mul_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_div_16_instruction(DIV_16_Instruction instruction)
{
#ifdef DISABLE_DIV_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto div_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DIV_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(div_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_fdiv_16_instruction(FDIV_16_Instruction instruction)
{
#ifdef DISABLE_FDIV_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto fdiv_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::FDIV_16)
                                   .operand(a_address_operand.value().second)
                                   .operand(b_address_operand.value().second)
                                   .operand(result_address_operand.value().second)
                                   .build();
    instructions.push_back(fdiv_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_eq_16_instruction(EQ_16_Instruction instruction)
{
#ifdef DISABLE_EQ_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto eq_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EQ_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(eq_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_lt_16_instruction(LT_16_Instruction instruction)
{
#ifdef DISABLE_LT_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto lt_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LT_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(lt_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_lte_16_instruction(LTE_16_Instruction instruction)
{
#ifdef DISABLE_LTE_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto lte_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::LTE_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(lte_16_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_and_16_instruction(AND_16_Instruction instruction)
{
#ifdef DISABLE_AND_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto and_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::AND_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(and_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_or_16_instruction(OR_16_Instruction instruction)
{
#ifdef DISABLE_OR_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto or_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::OR_16)
                                 .operand(a_address_operand.value().second)
                                 .operand(b_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(or_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_xor_16_instruction(XOR_16_Instruction instruction)
{
#ifdef DISABLE_XOR_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto xor_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::XOR_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(xor_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_not_16_instruction(NOT_16_Instruction instruction)
{
#ifdef DISABLE_NOT_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto not_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOT_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(not_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address }, result_address_operand.value().first);
}

void ProgramBlock::process_shl_16_instruction(SHL_16_Instruction instruction)
{
#ifdef DISABLE_SHL_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);

    auto shl_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHL_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(shl_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_shr_16_instruction(SHR_16_Instruction instruction)
{
#ifdef DISABLE_SHR_16_INSTRUCTION
    return;
#endif
    auto a_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.a_address);
    auto b_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.b_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!a_address_operand.has_value() || !b_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(a_address_operand.value().first);
    preprocess_memory_addresses(b_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto shr_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHR_16)
                                  .operand(a_address_operand.value().second)
                                  .operand(b_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .build();
    instructions.push_back(shr_16_instruction);
    record_result_tag_from_param_tags({ instruction.a_address, instruction.b_address },
                                      result_address_operand.value().first);
}

void ProgramBlock::process_cast_8_instruction(CAST_8_Instruction instruction)
{
#ifdef DISABLE_CAST_8_INSTRUCTION
    return;
#endif
    auto src_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.src_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_8(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(src_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto cast_8_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_8)
                                  .operand(src_address_operand.value().second)
                                  .operand(result_address_operand.value().second)
                                  .operand(instruction.target_tag.value)
                                  .build();
    instructions.push_back(cast_8_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value,
                                      result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_cast_16_instruction(CAST_16_Instruction instruction)
{
#ifdef DISABLE_CAST_16_INSTRUCTION
    return;
#endif
    auto src_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(src_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto cast_16_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CAST_16)
                                   .operand(src_address_operand.value().second)
                                   .operand(result_address_operand.value().second)
                                   .operand(instruction.target_tag.value)
                                   .build();
    instructions.push_back(cast_16_instruction);
    memory_manager.set_memory_address(instruction.target_tag.value,
                                      result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_sstore_instruction(SSTORE_Instruction instruction)
{
#ifdef DISABLE_SSTORE_INSTRUCTION
    return;
#endif
    auto src_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.src_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!src_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(src_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
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
#ifdef DISABLE_SLOAD_INSTRUCTION
    return;
#endif
    auto slot_addr = memory_manager.get_slot(instruction.slot_index);
    if (!slot_addr.has_value()) {
        return;
    }

    auto set_slot_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                    .result_address = instruction.slot_address,
                                                    .value = *slot_addr };
    this->process_set_ff_instruction(set_slot_instruction);
    auto slot_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.slot_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!slot_address_operand.has_value() || !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(slot_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);

    auto sload_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SLOAD)
                                 .operand(slot_address_operand.value().second)
                                 .operand(result_address_operand.value().second)
                                 .build();
    instructions.push_back(sload_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_getenvvar_instruction(GETENVVAR_Instruction instruction)
{
#ifdef DISABLE_GETENVVAR_INSTRUCTION
    return;
#endif
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(result_address_operand.value().first);
    auto getenvvar_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::GETENVVAR_16)
                                     .operand(result_address_operand.value().second)
                                     .operand(instruction.type)
                                     .build();
    instructions.push_back(getenvvar_instruction);
    // special case for timestamp, it returns a 64-bit value
    if (instruction.type == 6) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::U64,
                                          result_address_operand.value().first.absolute_address);
    } else {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF,
                                          result_address_operand.value().first.absolute_address);
    }
}

void ProgramBlock::process_emitnulifier_instruction(EMITNULLIFIER_Instruction instruction)
{
#ifdef DISABLE_EMITNULLIFIER_INSTRUCTION
    return;
#endif
    auto nullifier_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.nullifier_address);
    if (!nullifier_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(nullifier_address_operand.value().first);
    auto emitnulifier_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNULLIFIER)
                                        .operand(nullifier_address_operand.value().second)
                                        .build();
    instructions.push_back(emitnulifier_instruction);
}

void ProgramBlock::process_nullifierexists_instruction(NULLIFIEREXISTS_Instruction instruction)
{
#ifdef DISABLE_NULLIFIEREXISTS_INSTRUCTION
    return;
#endif
    auto nullifier_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.nullifier_address);
    auto contract_address_operand =
        memory_manager.get_resolved_address_and_operand_16(instruction.contract_address_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!nullifier_address_operand.has_value() || !contract_address_operand.has_value() ||
        !result_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(nullifier_address_operand.value().first);
    preprocess_memory_addresses(contract_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);
    auto get_contract_address_instruction =
        GETENVVAR_Instruction{ .result_address = instruction.contract_address_address, .type = 0 };
    this->process_getenvvar_instruction(get_contract_address_instruction);

    auto nullifierexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NULLIFIEREXISTS)
                                           .operand(nullifier_address_operand.value().second)
                                           .operand(contract_address_operand.value().second)
                                           .operand(result_address_operand.value().second)
                                           .build();
    instructions.push_back(nullifierexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_emitnotehash_instruction(EMITNOTEHASH_Instruction instruction)
{
#ifdef DISABLE_EMITNOTEHASH_INSTRUCTION
    return;
#endif
    auto set_note_hash_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = instruction.note_hash_address,
                                                         .value = instruction.note_hash };
    this->process_set_ff_instruction(set_note_hash_instruction);

    // EMITNOTEHASH expects UINT16 operand
    auto note_hash_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.note_hash_address);
    if (!note_hash_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(note_hash_address_operand.value().first);

    auto emitnotehash_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITNOTEHASH)
                                        .operand(note_hash_address_operand.value().second)
                                        .build();
    instructions.push_back(emitnotehash_instruction);
}

void ProgramBlock::process_notehashexists_instruction(NOTEHASHEXISTS_Instruction instruction)
{
#ifdef DISABLE_NOTEHASHEXISTS_INSTRUCTION
    return;
#endif
    auto notehash_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.notehash_address);
    auto leaf_index_address_operand =
        memory_manager.get_resolved_address_and_operand_16(instruction.leaf_index_address);
    auto result_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);
    if (!notehash_address_operand.has_value() || !leaf_index_address_operand.has_value() ||
        !result_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(notehash_address_operand.value().first);
    preprocess_memory_addresses(leaf_index_address_operand.value().first);
    preprocess_memory_addresses(result_address_operand.value().first);

    auto notehashexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::NOTEHASHEXISTS)
                                          .operand(notehash_address_operand.value().second)
                                          .operand(leaf_index_address_operand.value().second)
                                          .operand(result_address_operand.value().second)
                                          .build();
    instructions.push_back(notehashexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_calldatacopy_instruction(CALLDATACOPY_Instruction instruction)
{
#ifdef DISABLE_CALLDATACOPY_INSTRUCTION
    return;
#endif
    auto copy_size_set_instruction = SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                         .result_address = instruction.copy_size_address,
                                                         .value = instruction.copy_size };
    this->process_set_32_instruction(copy_size_set_instruction);
    auto cd_start_set_instruction = SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                        .result_address = instruction.cd_start_address,
                                                        .value = instruction.cd_start };
    this->process_set_32_instruction(cd_start_set_instruction);
    // CALLDATACOPY expects UINT16 operands for all three addresses
    auto copy_size_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.copy_size_address);
    auto cd_start_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.cd_start_address);
    auto dst_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);
    if (!copy_size_address_operand.has_value() || !cd_start_address_operand.has_value() ||
        !dst_address_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(copy_size_address_operand.value().first);
    preprocess_memory_addresses(cd_start_address_operand.value().first);
    preprocess_memory_addresses(dst_address_operand.value().first);
    auto calldatacopy_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CALLDATACOPY)
                                        .operand(copy_size_address_operand.value().second)
                                        .operand(cd_start_address_operand.value().second)
                                        .operand(dst_address_operand.value().second)
                                        .build();
    instructions.push_back(calldatacopy_instruction);

    // setting calldata_addr to u32 to avoid overflows
    uint32_t calldata_base_offset = dst_address_operand.value().first.absolute_address;
    auto loop_upper_bound = static_cast<uint32_t>(std::min((calldata_base_offset) + instruction.copy_size, 65535U));
    for (uint32_t calldata_addr = calldata_base_offset; calldata_addr < loop_upper_bound; calldata_addr++) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, calldata_addr);
    }
}

void ProgramBlock::process_sendl2tol1msg_instruction(SENDL2TOL1MSG_Instruction instruction)
{
#ifdef DISABLE_SENDL2TOL1MSG_INSTRUCTION
    return;
#endif
    auto set_recipient_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                         .result_address = instruction.recipient_address,
                                                         .value = instruction.recipient };
    this->process_set_ff_instruction(set_recipient_instruction);
    auto set_content_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                                       .result_address = instruction.content_address,
                                                       .value = instruction.content };
    this->process_set_ff_instruction(set_content_instruction);

    auto recipient_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.recipient_address);
    auto content_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.content_address);
    if (!recipient_address_operand.has_value() || !content_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(recipient_address_operand.value().first);
    preprocess_memory_addresses(content_address_operand.value().first);
    auto sendl2tol1msg_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SENDL2TOL1MSG)
                                         .operand(recipient_address_operand.value().second)
                                         .operand(content_address_operand.value().second)
                                         .build();
    instructions.push_back(sendl2tol1msg_instruction);
}

void ProgramBlock::process_emitunencryptedlog_instruction(EMITUNENCRYPTEDLOG_Instruction instruction)
{
#ifdef DISABLE_EMITUNENCRYPTEDLOG_INSTRUCTION
    return;
#endif
    auto log_size_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.log_size_address);
    auto log_values_address_operand =
        memory_manager.get_resolved_address_and_operand_16(instruction.log_values_address);
    if (!log_size_address_operand.has_value() || !log_values_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(log_size_address_operand.value().first);
    preprocess_memory_addresses(log_values_address_operand.value().first);
    auto emitunencryptedlog_instruction =
        bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::EMITUNENCRYPTEDLOG)
            .operand(log_size_address_operand.value().second)
            .operand(log_values_address_operand.value().second)
            .build();
    instructions.push_back(emitunencryptedlog_instruction);
}

void ProgramBlock::process_call_instruction(CALL_Instruction instruction)
{
#ifdef DISABLE_CALL_INSTRUCTION
    return;
#endif
    auto l2_gas = memory_manager.get_resolved_address_and_operand_16(instruction.l2_gas_address);
    auto da_gas = memory_manager.get_resolved_address_and_operand_16(instruction.da_gas_address);
    auto contract_address_address =
        memory_manager.get_resolved_address_and_operand_16(instruction.contract_address_address);
    auto calldata_size_address = memory_manager.get_resolved_address_and_operand_16(instruction.calldata_size_address);
    auto calldata_address = memory_manager.get_resolved_address_and_operand_16(instruction.calldata_address);
    if (!l2_gas.has_value() || !da_gas.has_value() || !contract_address_address.has_value() ||
        !calldata_size_address.has_value() || !calldata_address.has_value()) {
        return;
    }
    preprocess_memory_addresses(l2_gas.value().first);
    preprocess_memory_addresses(da_gas.value().first);
    preprocess_memory_addresses(contract_address_address.value().first);
    preprocess_memory_addresses(calldata_size_address.value().first);
    preprocess_memory_addresses(calldata_address.value().first);

    this->process_set_32_instruction(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                         .result_address = instruction.calldata_size_address,
                                                         .value = static_cast<uint32_t>(instruction.calldata_size) });

    auto call_instruction_builder = instruction.is_static_call
                                        ? bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::STATICCALL)
                                        : bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::CALL);
    auto call_instruction = call_instruction_builder.operand(l2_gas.value().second)
                                .operand(da_gas.value().second)
                                .operand(contract_address_address.value().second)
                                .operand(calldata_size_address.value().second)
                                .operand(calldata_address.value().second)
                                .build();
    instructions.push_back(call_instruction);
}

void ProgramBlock::process_returndatasize_with_returndatacopy_instruction(
    RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction instruction)
{
#ifdef DISABLE_RETURNDATASIZE_WITH_RETURNDATACOPY_INSTRUCTION
    return;
#endif
    auto returndatasize_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::RETURNDATASIZE)
                                          .operand(instruction.copy_size_offset)
                                          .build();
    instructions.push_back(returndatasize_instruction);
    auto rd_start_set_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address =
                                AddressRef{ .address = instruction.rd_start_offset, .mode = AddressingMode::Direct },
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

void ProgramBlock::process_getcontractinstance_instruction(GETCONTRACTINSTANCE_Instruction instruction)
{
#ifdef DISABLE_GETCONTRACTINSTANCE_INSTRUCTION
    return;
#endif
    auto contract_address_address =
        memory_manager.get_resolved_address_and_operand_16(instruction.contract_address_address);

    auto dst_address = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);
    if (!contract_address_address.has_value() || !dst_address.has_value()) {
        return;
    }
    preprocess_memory_addresses(contract_address_address.value().first);
    preprocess_memory_addresses(dst_address.value().first);

    auto get_contract_instance_instruction =
        bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::GETCONTRACTINSTANCE)
            .operand(contract_address_address.value().second)
            .operand(dst_address.value().second)
            .operand(instruction.member_enum)
            .build();
    instructions.push_back(get_contract_instance_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, dst_address.value().first.absolute_address);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, dst_address.value().first.absolute_address + 1);
}

void ProgramBlock::process_successcopy_instruction(SUCCESSCOPY_Instruction instruction)
{
#ifdef DISABLE_SUCCESSCOPY_INSTRUCTION
    return;
#endif
    auto dst_address_operand = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);
    if (!dst_address_operand.has_value()) {
        return;
    }
    preprocess_memory_addresses(dst_address_operand.value().first);
    auto successcopy_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SUCCESSCOPY)
                                       .operand(dst_address_operand.value().second)
                                       .build();
    instructions.push_back(successcopy_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, dst_address_operand.value().first.absolute_address);
}

void ProgramBlock::process_ecadd_instruction(ECADD_Instruction instruction)
{
#ifdef DISABLE_ECADD_INSTRUCTION
    return;
#endif
    auto p1_x = memory_manager.get_resolved_address_and_operand_16(instruction.p1_x);
    auto p1_y = memory_manager.get_resolved_address_and_operand_16(instruction.p1_y);
    auto p1_inf = memory_manager.get_resolved_address_and_operand_16(instruction.p1_infinite);
    auto p2_x = memory_manager.get_resolved_address_and_operand_16(instruction.p2_x);
    auto p2_y = memory_manager.get_resolved_address_and_operand_16(instruction.p2_y);
    auto p2_inf = memory_manager.get_resolved_address_and_operand_16(instruction.p2_infinite);
    auto result = memory_manager.get_resolved_address_and_operand_16(instruction.result);

    if (!p1_x.has_value() || !p1_y.has_value() || !p1_inf.has_value() || !p2_x.has_value() || !p2_y.has_value() ||
        !p2_inf.has_value() || !result.has_value()) {
        return;
    }

    preprocess_memory_addresses(p1_x.value().first);
    preprocess_memory_addresses(p1_y.value().first);
    preprocess_memory_addresses(p1_inf.value().first);
    preprocess_memory_addresses(p2_x.value().first);
    preprocess_memory_addresses(p2_y.value().first);
    preprocess_memory_addresses(p2_inf.value().first);
    preprocess_memory_addresses(result.value().first);

    auto ecadd_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::ECADD)
                                 .operand(p1_x.value().second)
                                 .operand(p1_y.value().second)
                                 .operand(p1_inf.value().second)
                                 .operand(p2_x.value().second)
                                 .operand(p2_y.value().second)
                                 .operand(p2_inf.value().second)
                                 .operand(result.value().second)
                                 .build();
    instructions.push_back(ecadd_instruction);

    // ECADD writes 3 consecutive memory locations: result_x (FF), result_y (FF), result_is_inf (U1)
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, result.value().first.absolute_address);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, result.value().first.absolute_address + 1);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result.value().first.absolute_address + 2);
}

void ProgramBlock::process_poseidon2perm_instruction(POSEIDON2PERM_Instruction instruction)
{
#ifdef DISABLE_POSEIDON2PERM_INSTRUCTION
    return;
#endif
    auto src = memory_manager.get_resolved_address_and_operand_16(instruction.src_address);
    auto dst = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);

    if (!src.has_value() || !dst.has_value()) {
        return;
    }

    preprocess_memory_addresses(src.value().first);
    preprocess_memory_addresses(dst.value().first);

    auto poseidon2perm_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::POSEIDON2PERM)
                                         .operand(src.value().second)
                                         .operand(dst.value().second)
                                         .build();
    instructions.push_back(poseidon2perm_instruction);

    // Poseidon2 permutation writes 4 consecutive FF values to dst
    for (uint32_t i = 0; i < 4; i++) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::FF, dst.value().first.absolute_address + i);
    }
}

void ProgramBlock::process_keccakf1600_instruction(KECCAKF1600_Instruction instruction)
{
#ifdef DISABLE_KECCAKF1600_INSTRUCTION
    return;
#endif
    auto src = memory_manager.get_resolved_address_and_operand_16(instruction.src_address);
    auto dst = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);

    if (!src.has_value() || !dst.has_value()) {
        return;
    }

    preprocess_memory_addresses(src.value().first);
    preprocess_memory_addresses(dst.value().first);

    auto keccakf1600_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::KECCAKF1600)
                                       .operand(dst.value().second)
                                       .operand(src.value().second)
                                       .build();
    instructions.push_back(keccakf1600_instruction);

    // Keccak-f[1600] permutation writes 25 consecutive U64 values to dst
    for (uint32_t i = 0; i < 25; i++) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::U64, dst.value().first.absolute_address + i);
    }
}

void ProgramBlock::process_sha256compression_instruction(SHA256COMPRESSION_Instruction instruction)
{
#ifdef DISABLE_SHA256COMPRESSION_INSTRUCTION
    return;
#endif
    auto state = memory_manager.get_resolved_address_and_operand_16(instruction.state_address);
    auto input = memory_manager.get_resolved_address_and_operand_16(instruction.input_address);
    auto dst = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);

    if (!state.has_value() || !input.has_value() || !dst.has_value()) {
        return;
    }

    preprocess_memory_addresses(state.value().first);
    preprocess_memory_addresses(input.value().first);
    preprocess_memory_addresses(dst.value().first);

    auto sha256compression_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SHA256COMPRESSION)
                                             .operand(dst.value().second)
                                             .operand(state.value().second)
                                             .operand(input.value().second)
                                             .build();
    instructions.push_back(sha256compression_instruction);

    // SHA256 compression writes 8 consecutive U32 values to dst
    for (uint32_t i = 0; i < 8; i++) {
        memory_manager.set_memory_address(bb::avm2::MemoryTag::U32, dst.value().first.absolute_address + i);
    }
}

void ProgramBlock::process_l1tol2msgexists_instruction(L1TOL2MSGEXISTS_Instruction instruction)
{
    auto msg_hash_operand = memory_manager.get_resolved_address_and_operand_16(instruction.msg_hash_address);
    auto leaf_index_operand = memory_manager.get_resolved_address_and_operand_16(instruction.leaf_index_address);
    auto result_operand = memory_manager.get_resolved_address_and_operand_16(instruction.result_address);

    if (!msg_hash_operand.has_value() || !leaf_index_operand.has_value() || !result_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(msg_hash_operand.value().first);
    preprocess_memory_addresses(leaf_index_operand.value().first);
    preprocess_memory_addresses(result_operand.value().first);

    auto l1tol2msgexists_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::L1TOL2MSGEXISTS)
                                           .operand(msg_hash_operand.value().second)
                                           .operand(leaf_index_operand.value().second)
                                           .operand(result_operand.value().second)
                                           .build();
    instructions.push_back(l1tol2msgexists_instruction);
    memory_manager.set_memory_address(bb::avm2::MemoryTag::U1, result_operand.value().first.absolute_address);
}

void ProgramBlock::process_toradixbe_instruction(TORADIXBE_Instruction instruction)
{
    auto value_operand = memory_manager.get_resolved_address_and_operand_16(instruction.value_address);
    auto radix_operand = memory_manager.get_resolved_address_and_operand_16(instruction.radix_address);
    auto num_limbs_operand = memory_manager.get_resolved_address_and_operand_16(instruction.num_limbs_address);
    auto output_bits_operand = memory_manager.get_resolved_address_and_operand_16(instruction.output_bits_address);
    auto dst_operand = memory_manager.get_resolved_address_and_operand_16(instruction.dst_address);

    if (!value_operand.has_value() || !radix_operand.has_value() || !num_limbs_operand.has_value() ||
        !output_bits_operand.has_value() || !dst_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(value_operand.value().first);
    preprocess_memory_addresses(radix_operand.value().first);
    preprocess_memory_addresses(num_limbs_operand.value().first);
    preprocess_memory_addresses(output_bits_operand.value().first);
    preprocess_memory_addresses(dst_operand.value().first);

    auto toradixbe_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::TORADIXBE)
                                     .operand(dst_operand.value().second)
                                     .operand(value_operand.value().second)
                                     .operand(radix_operand.value().second)
                                     .operand(num_limbs_operand.value().second)
                                     .operand(output_bits_operand.value().second)
                                     .build();
    instructions.push_back(toradixbe_instruction);

    // Use is_output_bits to determine the output memory tag
    auto output_tag = instruction.is_output_bits ? bb::avm2::MemoryTag::U1 : bb::avm2::MemoryTag::U8;
    memory_manager.set_memory_address(output_tag, dst_operand.value().first.absolute_address);
}

void ProgramBlock::process_debuglog_instruction(DEBUGLOG_Instruction instruction)
{
    auto level_operand = memory_manager.get_resolved_address_and_operand_16(instruction.level_offset);
    auto message_operand = memory_manager.get_resolved_address_and_operand_16(instruction.message_offset);
    auto fields_operand = memory_manager.get_resolved_address_and_operand_16(instruction.fields_offset);
    auto fields_size_operand = memory_manager.get_resolved_address_and_operand_16(instruction.fields_size_offset);
    auto message_size = instruction.message_size;

    if (!level_operand.has_value() || !message_operand.has_value() || !fields_operand.has_value() ||
        !fields_size_operand.has_value()) {
        return;
    }

    preprocess_memory_addresses(level_operand.value().first);
    preprocess_memory_addresses(message_operand.value().first);
    preprocess_memory_addresses(fields_operand.value().first);
    preprocess_memory_addresses(fields_size_operand.value().first);

    auto debuglog_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::DEBUGLOG)
                                    .operand(level_operand.value().second)
                                    .operand(message_operand.value().second)
                                    .operand(fields_operand.value().second)
                                    .operand(fields_size_operand.value().second)
                                    .operand(message_size)
                                    .build();
    instructions.push_back(debuglog_instruction);
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

    auto return_addr = memory_manager.get_memory_offset_16(return_value_tag.value, return_value_offset_index);
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
                                  .operand(return_addr.value())
                                  .build();
    instructions.push_back(return_instruction);
}

void ProgramBlock::finalize_with_revert(uint8_t revert_size,
                                        MemoryTagWrapper revert_value_tag,
                                        uint16_t revert_value_offset_index)
{
    this->terminator_type = TerminatorType::REVERT;

    auto revert_addr = memory_manager.get_memory_offset_16(revert_value_tag.value, revert_value_offset_index);
    if (!revert_addr.has_value()) {
        revert_addr = std::optional<uint32_t>(0);
    }

    // Once we do more of the randomness in Instruction selection, revert_size_offset we shouldnt need to hardcode
    uint16_t revert_size_offset = 5U;
    // Ensure operands are created as U16 to match wire format (UINT16)
    auto set_size_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::SET_16)
                                    .operand(revert_size_offset)
                                    .operand(bb::avm2::MemoryTag::U32)
                                    .operand(static_cast<uint16_t>(revert_size))
                                    .build();
    instructions.push_back(set_size_instruction);
    // REVERT_16 expects UINT16 operands, ensure we cast to uint16_t explicitly
    auto revert_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::REVERT_16)
                                  .operand(static_cast<uint16_t>(revert_size_offset))
                                  .operand(revert_addr.value())
                                  .build();
    instructions.push_back(revert_instruction);
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
    auto condition_addr = memory_manager.get_memory_offset_16(bb::avm2::MemoryTag::U1, condition_offset_index);
    if (!condition_addr.has_value()) {
        return std::nullopt;
    }
    return condition_addr;
}

void ProgramBlock::process_write_terminating_condition_value()
{
    uint16_t value = condition_offset_index % 2;
    process_set_16_instruction(SET_16_Instruction{
        .value_tag = bb::avm2::MemoryTag::U1,
        .result_address = AddressRef{ .address = condition_offset_index, .mode = AddressingMode::Direct },
        .value = value });
}

bool ProgramBlock::is_memory_address_set(uint16_t address)
{
    return memory_manager.is_memory_address_set(address);
}

void ProgramBlock::process_instruction_block(InstructionBlock& instruction_block)
{
    memory_manager.set_base_offset(instruction_block.base_offset);
    process_set_32_instruction(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                            .result_address = AddressRef{ .address = 0, .mode = AddressingMode::Direct },
                            .value = instruction_block.base_offset });
    for (const auto& instr : instruction_block.instructions) {
        process_instruction(instr);
    }
}

void ProgramBlock::process_instruction(FuzzInstruction instruction)
{
    std::visit(
        overloaded{
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
            [this](GETCONTRACTINSTANCE_Instruction instruction) {
                return this->process_getcontractinstance_instruction(instruction);
            },
            [this](SUCCESSCOPY_Instruction instruction) { return this->process_successcopy_instruction(instruction); },
            [this](ECADD_Instruction instruction) { return this->process_ecadd_instruction(instruction); },
            [this](POSEIDON2PERM_Instruction instruction) {
                return this->process_poseidon2perm_instruction(instruction);
            },
            [this](KECCAKF1600_Instruction instruction) { return this->process_keccakf1600_instruction(instruction); },
            [this](SHA256COMPRESSION_Instruction instruction) {
                return this->process_sha256compression_instruction(instruction);
            },
            [this](L1TOL2MSGEXISTS_Instruction instruction) {
                return this->process_l1tol2msgexists_instruction(instruction);
            },
            [this](TORADIXBE_Instruction instruction) { return this->process_toradixbe_instruction(instruction); },
            [this](DEBUGLOG_Instruction instruction) { return this->process_debuglog_instruction(instruction); },
            [](auto) { throw std::runtime_error("Unknown instruction"); },
        },
        instruction);
}

std::vector<bb::avm2::simulation::Instruction> ProgramBlock::get_instructions()
{
    return instructions;
}

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

AddressingMode generate_addressing_mode(std::mt19937_64& rng)
{
    return static_cast<AddressingMode>(generate_random_uint8(rng) % 4);
}

AddressRef generate_address_ref(std::mt19937_64& rng)
{
    auto tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION);
    auto index = generate_random_uint32(rng);
    auto pointer_address = generate_random_uint16(rng);
    auto base_offset = generate_random_uint32(rng);
    auto mode = generate_addressing_mode(rng);
    return AddressRef{
        .tag = tag, .index = index, .pointer_address = pointer_address, .base_offset = base_offset, .mode = mode
    };
}

ResultAddressRef generate_result_address_ref(std::mt19937_64& rng)
{
    auto address = generate_random_uint32(rng);
    auto pointer_address = generate_random_uint16(rng);
    auto base_offset = generate_random_uint32(rng);
    auto mode = generate_addressing_mode(rng);
    return ResultAddressRef{
        .address = address, .pointer_address = pointer_address, .base_offset = base_offset, .mode = mode
    };
}

FuzzInstruction generate_instruction(std::mt19937_64& rng)
{
    InstructionGenerationOptions option = BASIC_INSTRUCTION_GENERATION_CONFIGURATION.select(rng);
    // forgive me
    switch (option) {
    case InstructionGenerationOptions::ADD_8:
        return ADD_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SUB_8:
        return SUB_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::MUL_8:
        return MUL_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::DIV_8:
        return DIV_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::EQ_8:
        return EQ_8_Instruction{ .a_address = generate_address_ref(rng),
                                 .b_address = generate_address_ref(rng),
                                 .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::LT_8:
        return LT_8_Instruction{ .a_address = generate_address_ref(rng),
                                 .b_address = generate_address_ref(rng),
                                 .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::LTE_8:
        return LTE_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::AND_8:
        return AND_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::OR_8:
        return OR_8_Instruction{ .a_address = generate_address_ref(rng),
                                 .b_address = generate_address_ref(rng),
                                 .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::XOR_8:
        return XOR_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SHL_8:
        return SHL_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };

    case InstructionGenerationOptions::SHR_8:
        return SHR_8_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SET_8:
        return SET_8_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .result_address = generate_result_address_ref(rng),
                                  .value = generate_random_uint8(rng) };
    case InstructionGenerationOptions::SET_16:
        return SET_16_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .result_address = generate_result_address_ref(rng),
                                   .value = generate_random_uint16(rng) };
    case InstructionGenerationOptions::SET_32:
        return SET_32_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .result_address = generate_result_address_ref(rng),
                                   .value = generate_random_uint32(rng) };
    case InstructionGenerationOptions::SET_64:
        return SET_64_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .result_address = generate_result_address_ref(rng),
                                   .value = generate_random_uint64(rng) };
    case InstructionGenerationOptions::SET_128:
        return SET_128_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .result_address = generate_result_address_ref(rng),
                                    .value_low = generate_random_uint64(rng),
                                    .value_high = generate_random_uint64(rng) };
    case InstructionGenerationOptions::SET_FF:
        return SET_FF_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .result_address = generate_result_address_ref(rng),
                                   .value = generate_random_field(rng) };
    case InstructionGenerationOptions::ADD_16:
        return ADD_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SUB_16:
        return SUB_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::MUL_16:
        return MUL_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::DIV_16:
        return DIV_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::FDIV_16:
        return FDIV_16_Instruction{ .a_address = generate_address_ref(rng),
                                    .b_address = generate_address_ref(rng),
                                    .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::EQ_16:
        return EQ_16_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::LT_16:
        return LT_16_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::LTE_16:
        return LTE_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::AND_16:
        return AND_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::OR_16:
        return OR_16_Instruction{ .a_address = generate_address_ref(rng),
                                  .b_address = generate_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::XOR_16:
        return XOR_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::NOT_16:
        return NOT_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SHL_16:
        return SHL_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SHR_16:
        return SHR_16_Instruction{ .a_address = generate_address_ref(rng),
                                   .b_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::CAST_8:
        return CAST_8_Instruction{ .src_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng),
                                   .target_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) };
    case InstructionGenerationOptions::CAST_16:
        return CAST_16_Instruction{ .src_address = generate_address_ref(rng),
                                    .result_address = generate_result_address_ref(rng),
                                    .target_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) };
    case InstructionGenerationOptions::SSTORE:
        return SSTORE_Instruction{ .src_address = generate_address_ref(rng),
                                   .result_address = generate_result_address_ref(rng),
                                   .slot = generate_random_field(rng) };
    case InstructionGenerationOptions::SLOAD:
        return SLOAD_Instruction{ .slot_index = generate_random_uint16(rng),
                                  .slot_address = generate_result_address_ref(rng),
                                  .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::GETENVVAR:
        return GETENVVAR_Instruction{ .result_address = generate_result_address_ref(rng),
                                      .type = generate_random_uint8(rng) };
    case InstructionGenerationOptions::EMITNULLIFIER:
        return EMITNULLIFIER_Instruction{ .nullifier_address = generate_address_ref(rng) };
    case InstructionGenerationOptions::NULLIFIEREXISTS:
        return NULLIFIEREXISTS_Instruction{ .nullifier_address = generate_address_ref(rng),
                                            .contract_address_address = generate_result_address_ref(rng),
                                            .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::EMITNOTEHASH:
        return EMITNOTEHASH_Instruction{ .note_hash_address = generate_result_address_ref(rng),
                                         .note_hash = generate_random_field(rng) };
    case InstructionGenerationOptions::NOTEHASHEXISTS:
        return NOTEHASHEXISTS_Instruction{ .notehash_index = generate_random_uint16(rng),
                                           .notehash_address = generate_result_address_ref(rng),
                                           .leaf_index_address = generate_result_address_ref(rng),
                                           .result_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::CALLDATACOPY:
        return CALLDATACOPY_Instruction{ .dst_address = generate_result_address_ref(rng),
                                         .copy_size = generate_random_uint8(rng),
                                         .copy_size_address = generate_result_address_ref(rng),
                                         .cd_start = generate_random_uint16(rng),
                                         .cd_start_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::SENDL2TOL1MSG:
        return SENDL2TOL1MSG_Instruction{ .recipient = generate_random_field(rng),
                                          .recipient_address = generate_result_address_ref(rng),
                                          .content = generate_random_field(rng),
                                          .content_address = generate_result_address_ref(rng) };
    case InstructionGenerationOptions::EMITUNENCRYPTEDLOG:
        return EMITUNENCRYPTEDLOG_Instruction{ .log_size = generate_random_uint8(rng),
                                               .log_size_address = generate_result_address_ref(rng),
                                               .log_values = { generate_random_field(rng) },
                                               .log_values_address_start = generate_random_uint16(rng) };
    case InstructionGenerationOptions::CALL:
        return CALL_Instruction{ .function_index = generate_random_uint16(rng),
                                 .address_offset = generate_random_uint16(rng),
                                 .l2_gas = generate_random_uint32(rng),
                                 .l2_gas_address = generate_random_uint16(rng),
                                 .da_gas = generate_random_uint32(rng),
                                 .da_gas_address = generate_random_uint16(rng),
                                 .arg_size_offset = generate_random_uint16(rng),
                                 .args_offset = generate_random_uint16(rng),
                                 .args = { generate_random_field(rng) },
                                 .is_static_call = rng() % 2 == 0 };
    case InstructionGenerationOptions::RETURNDATASIZE_WITH_RETURNDATACOPY:
        return RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction{ .copy_size_offset = generate_random_uint16(rng),
                                                               .dst_address = generate_random_uint16(rng),
                                                               .rd_start_offset = generate_random_uint16(rng) };
    }
}
/// Most of the tags will be equal to the default tag
void mutate_address_ref(AddressRef& address, std::mt19937_64& rng, std::optional<MemoryTag> default_tag)
{
    AddressRefMutationOptions option = BASIC_ADDRESS_REF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case AddressRefMutationOptions::tag:
        if (default_tag.has_value()) {
            mutate_or_default_tag(address.tag.value, rng, default_tag.value());
        } else {
            mutate_memory_tag(address.tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        }
        break;
    case AddressRefMutationOptions::index:
        mutate_uint32_t(address.index, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case AddressRefMutationOptions::pointer_address:
        mutate_uint16_t(address.pointer_address, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case AddressRefMutationOptions::base_offset:
        mutate_uint32_t(address.base_offset, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case AddressRefMutationOptions::mode:
        address.mode = generate_addressing_mode(rng);
        break;
    }
}

void mutate_result_address_ref(ResultAddressRef& address, std::mt19937_64& rng)
{
    ResultAddressRefMutationOptions option = BASIC_RESULT_ADDRESS_REF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case ResultAddressRefMutationOptions::address:
        mutate_uint32_t(address.address, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case ResultAddressRefMutationOptions::pointer_address:
        mutate_uint16_t(address.pointer_address, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case ResultAddressRefMutationOptions::base_offset:
        mutate_uint32_t(address.base_offset, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case ResultAddressRefMutationOptions::mode:
        address.mode = generate_addressing_mode(rng);
        break;
    }
}

template <typename BinaryInstructionType>
void mutate_binary_instruction_8(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.a_address, rng, std::nullopt);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_address_ref(instruction.b_address, rng, instruction.a_address.tag);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

template <typename BinaryInstructionType>
void mutate_binary_instruction_16(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.a_address, rng, std::nullopt);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_address_ref(instruction.b_address, rng, instruction.a_address.tag);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_not_8_instruction(NOT_8_Instruction& instruction, std::mt19937_64& rng)
{

    UnaryInstruction8MutationOptions option = BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case UnaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.a_address, rng, std::nullopt);
        break;
    case UnaryInstruction8MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_set_8_instruction(SET_8_Instruction& instruction, std::mt19937_64& rng)
{

    Set8MutationOptions option = BASIC_SET_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set8MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set8MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case Set8MutationOptions::value:
        mutate_uint8_t(instruction.value, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_set_16_instruction(SET_16_Instruction& instruction, std::mt19937_64& rng)
{

    Set16MutationOptions option = BASIC_SET_16_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set16MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set16MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case Set16MutationOptions::value:
        mutate_uint16_t(instruction.value, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_set_32_instruction(SET_32_Instruction& instruction, std::mt19937_64& rng)
{

    Set32MutationOptions option = BASIC_SET_32_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set32MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set32MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case Set32MutationOptions::value:
        mutate_uint32_t(instruction.value, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_set_64_instruction(SET_64_Instruction& instruction, std::mt19937_64& rng)
{

    Set64MutationOptions option = BASIC_SET_64_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set64MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set64MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case Set64MutationOptions::value:
        mutate_uint64_t(instruction.value, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_set_128_instruction(SET_128_Instruction& instruction, std::mt19937_64& rng)
{

    Set128MutationOptions option = BASIC_SET_128_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set128MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set128MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case Set128MutationOptions::value_low:
        mutate_uint64_t(instruction.value_low, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    case Set128MutationOptions::value_high:
        mutate_uint64_t(instruction.value_high, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_set_ff_instruction(SET_FF_Instruction& instruction, std::mt19937_64& rng)
{

    SetFFMutationOptions option = BASIC_SET_FF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SetFFMutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case SetFFMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case SetFFMutationOptions::value:
        mutate_field(instruction.value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_not_16_instruction(NOT_16_Instruction& instruction, std::mt19937_64& rng)
{

    UnaryInstruction8MutationOptions option = BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case UnaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.a_address, rng, std::nullopt);
        break;
    case UnaryInstruction8MutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_cast_8_instruction(CAST_8_Instruction& instruction, std::mt19937_64& rng)
{

    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.src_address, rng, std::nullopt);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_cast_16_instruction(CAST_16_Instruction& instruction, std::mt19937_64& rng)
{

    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_address_ref(instruction.src_address, rng, std::nullopt);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_sstore_instruction(SSTORE_Instruction& instruction, std::mt19937_64& rng)
{

    SStoreMutationOptions option = BASIC_SSTORE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SStoreMutationOptions::src_address:
        mutate_address_ref(instruction.src_address, rng, MemoryTag::FF);
        break;
    case SStoreMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case SStoreMutationOptions::slot:
        mutate_field(instruction.slot, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_sload_instruction(SLOAD_Instruction& instruction, std::mt19937_64& rng)
{

    SLoadMutationOptions option = BASIC_SLOAD_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SLoadMutationOptions::slot_index:
        mutate_uint16_t(instruction.slot_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case SLoadMutationOptions::slot_address:
        mutate_result_address_ref(instruction.slot_address, rng);
        break;
    case SLoadMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_getenvvar_instruction(GETENVVAR_Instruction& instruction, std::mt19937_64& rng)
{

    GetEnvVarMutationOptions option = BASIC_GETENVVAR_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case GetEnvVarMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    case GetEnvVarMutationOptions::type:
        mutate_uint8_t(instruction.type, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_emit_nullifier_instruction(EMITNULLIFIER_Instruction& instruction, std::mt19937_64& rng)
{
    // emitnulifier only has one field

    mutate_address_ref(instruction.nullifier_address, rng, MemoryTag::FF);
}

void mutate_nullifier_exists_instruction(NULLIFIEREXISTS_Instruction& instruction, std::mt19937_64& rng)
{

    NullifierExistsMutationOptions option = BASIC_NULLIFIER_EXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case NullifierExistsMutationOptions::nullifier_address:
        mutate_address_ref(instruction.nullifier_address, rng, MemoryTag::FF);
        break;
    case NullifierExistsMutationOptions::contract_address_address:
        mutate_result_address_ref(instruction.contract_address_address, rng);
        break;
    case NullifierExistsMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_emit_note_hash_instruction(EMITNOTEHASH_Instruction& instruction, std::mt19937_64& rng)
{

    EmitNoteHashMutationOptions option = BASIC_EMITNOTEHASH_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmitNoteHashMutationOptions::note_hash_address:
        mutate_result_address_ref(instruction.note_hash_address, rng);
        break;
    case EmitNoteHashMutationOptions::note_hash:
        mutate_field(instruction.note_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}
void mutate_note_hash_exists_instruction(NOTEHASHEXISTS_Instruction& instruction, std::mt19937_64& rng)
{

    NoteHashExistsMutationOptions option = BASIC_NOTEHASHEXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case NoteHashExistsMutationOptions::notehash_index:
        mutate_uint16_t(instruction.notehash_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case NoteHashExistsMutationOptions::notehash_address:
        mutate_result_address_ref(instruction.notehash_address, rng);
        break;
    case NoteHashExistsMutationOptions::leaf_index_address:
        mutate_result_address_ref(instruction.leaf_index_address, rng);
        break;
    case NoteHashExistsMutationOptions::result_address:
        mutate_result_address_ref(instruction.result_address, rng);
        break;
    }
}

void mutate_calldatacopy_instruction(CALLDATACOPY_Instruction& instruction, std::mt19937_64& rng)
{

    CalldataCopyMutationOptions option = BASIC_CALLDATACOPY_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case CalldataCopyMutationOptions::dst_address:
        mutate_result_address_ref(instruction.dst_address, rng);
        break;
    case CalldataCopyMutationOptions::copy_size:
        mutate_uint8_t(instruction.copy_size, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    case CalldataCopyMutationOptions::copy_size_address:
        mutate_result_address_ref(instruction.copy_size_address, rng);
        break;
    case CalldataCopyMutationOptions::cd_start:
        mutate_uint16_t(instruction.cd_start, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CalldataCopyMutationOptions::cd_start_address:
        mutate_result_address_ref(instruction.cd_start_address, rng);
        break;
    }
}

void mutate_sendl2tol1msg_instruction(SENDL2TOL1MSG_Instruction& instruction, std::mt19937_64& rng)
{
    SendL2ToL1MsgMutationOptions option = BASIC_SENDL2TOL1MSG_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SendL2ToL1MsgMutationOptions::recipient:
        mutate_field(instruction.recipient, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case SendL2ToL1MsgMutationOptions::recipient_address:
        mutate_result_address_ref(instruction.recipient_address, rng);
        break;
    case SendL2ToL1MsgMutationOptions::content:
        mutate_field(instruction.content, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case SendL2ToL1MsgMutationOptions::content_address:
        mutate_result_address_ref(instruction.content_address, rng);
        break;
    }
}

void mutate_emitunencryptedlog_instruction(EMITUNENCRYPTEDLOG_Instruction& instruction, std::mt19937_64& rng)
{
    EmitUnencryptedLogMutationOptions option = BASIC_EMITUNENCRYPTEDLOG_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmitUnencryptedLogMutationOptions::log_size:
        mutate_uint8_t(instruction.log_size, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    case EmitUnencryptedLogMutationOptions::log_size_address:
        mutate_result_address_ref(instruction.log_size_address, rng);
        break;
    case EmitUnencryptedLogMutationOptions::log_values:
        mutate_vec<bb::avm2::FF>(
            instruction.log_values,
            rng,
            [](bb::avm2::FF& value, std::mt19937_64& rng) {
                mutate_field(value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
            },
            generate_random_field,
            BASIC_VEC_MUTATION_CONFIGURATION);
        break;
    case EmitUnencryptedLogMutationOptions::log_values_address_start:
        mutate_uint16_t(instruction.log_values_address_start, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_call_instruction(CALL_Instruction& instruction, std::mt19937_64& rng)
{
    CallMutationOptions option = BASIC_CALL_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case CallMutationOptions::function_index:
        mutate_uint16_t(instruction.function_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::address_offset:
        mutate_uint16_t(instruction.address_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::l2_gas:
        mutate_uint32_t(instruction.l2_gas, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::l2_gas_address:
        mutate_uint16_t(instruction.l2_gas_address, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::da_gas:
        mutate_uint32_t(instruction.da_gas, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::da_gas_address:
        mutate_uint16_t(instruction.da_gas_address, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::arg_size_offset:
        mutate_uint16_t(instruction.arg_size_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::args:
        mutate_vec<bb::avm2::FF>(
            instruction.args,
            rng,
            [](bb::avm2::FF& value, std::mt19937_64& rng) {
                mutate_field(value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
            },
            generate_random_field,
            BASIC_VEC_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::args_offset:
        mutate_uint16_t(instruction.args_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::is_static_call:
        // with 0.5 probability, set to true, otherwise false
        instruction.is_static_call = rng() % 2 == 0;
        break;
    }
}

void mutate_returndatasize_with_returndatacopy_instruction(RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction& instruction,
                                                           std::mt19937_64& rng)
{
    ReturndatasizeWithReturndatacopyMutationOptions option =
        BASIC_RETURNDATASIZE_WITH_RETURNDATACOPY_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case ReturndatasizeWithReturndatacopyMutationOptions::copy_size_offset:
        mutate_uint16_t(instruction.copy_size_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case ReturndatasizeWithReturndatacopyMutationOptions::dst_address:
        mutate_uint16_t(instruction.dst_address, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case ReturndatasizeWithReturndatacopyMutationOptions::rd_start_offset:
        mutate_uint16_t(instruction.rd_start_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}
void mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng)
{
    std::visit(overloaded_instruction{
                   [&rng](ADD_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](SUB_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](MUL_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](DIV_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](EQ_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](LT_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](LTE_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](AND_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](OR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](XOR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](SHL_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](SHR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](SET_8_Instruction& instr) { mutate_set_8_instruction(instr, rng); },
                   [&rng](SET_16_Instruction& instr) { mutate_set_16_instruction(instr, rng); },
                   [&rng](SET_32_Instruction& instr) { mutate_set_32_instruction(instr, rng); },
                   [&rng](SET_64_Instruction& instr) { mutate_set_64_instruction(instr, rng); },
                   [&rng](SET_128_Instruction& instr) { mutate_set_128_instruction(instr, rng); },
                   [&rng](SET_FF_Instruction& instr) { mutate_set_ff_instruction(instr, rng); },
                   [&rng](FDIV_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
                   [&rng](NOT_8_Instruction& instr) { mutate_not_8_instruction(instr, rng); },
                   [&rng](ADD_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](SUB_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](MUL_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](DIV_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](FDIV_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](EQ_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](LT_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](LTE_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](AND_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](OR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](XOR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](NOT_16_Instruction& instr) { mutate_not_16_instruction(instr, rng); },
                   [&rng](SHL_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](SHR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
                   [&rng](CAST_8_Instruction& instr) { mutate_cast_8_instruction(instr, rng); },
                   [&rng](CAST_16_Instruction& instr) { mutate_cast_16_instruction(instr, rng); },
                   [&rng](SSTORE_Instruction& instr) { mutate_sstore_instruction(instr, rng); },
                   [&rng](SLOAD_Instruction& instr) { mutate_sload_instruction(instr, rng); },
                   [&rng](GETENVVAR_Instruction& instr) { mutate_getenvvar_instruction(instr, rng); },
                   [&rng](EMITNULLIFIER_Instruction& instr) { mutate_emit_nullifier_instruction(instr, rng); },
                   [&rng](NULLIFIEREXISTS_Instruction& instr) { mutate_nullifier_exists_instruction(instr, rng); },
                   [&rng](EMITNOTEHASH_Instruction& instr) { mutate_emit_note_hash_instruction(instr, rng); },
                   [&rng](NOTEHASHEXISTS_Instruction& instr) { mutate_note_hash_exists_instruction(instr, rng); },
                   [&rng](CALLDATACOPY_Instruction& instr) { mutate_calldatacopy_instruction(instr, rng); },
                   [&rng](SENDL2TOL1MSG_Instruction& instr) { mutate_sendl2tol1msg_instruction(instr, rng); },
                   [&rng](RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction& instr) {
                       mutate_returndatasize_with_returndatacopy_instruction(instr, rng);
                   },
                   [](auto&) { throw std::runtime_error("Unknown instruction"); } },
               instruction);
}

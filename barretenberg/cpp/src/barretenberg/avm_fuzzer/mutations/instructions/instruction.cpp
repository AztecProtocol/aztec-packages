#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

FuzzInstruction generate_instruction(std::mt19937_64& rng)
{
    InstructionGenerationOptions option = BASIC_INSTRUCTION_GENERATION_CONFIGURATION.select(rng);
    // forgive me
    switch (option) {
    case InstructionGenerationOptions::ADD_8:
        return ADD_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::SUB_8:
        return SUB_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::MUL_8:
        return MUL_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::DIV_8:
        return DIV_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::EQ_8:
        return EQ_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                 .a_offset_index = generate_random_uint16(rng),
                                 .b_offset_index = generate_random_uint16(rng),
                                 .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::LT_8:
        return LT_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                 .a_offset_index = generate_random_uint16(rng),
                                 .b_offset_index = generate_random_uint16(rng),
                                 .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::LTE_8:
        return LTE_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::AND_8:
        return AND_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::OR_8:
        return OR_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                 .a_offset_index = generate_random_uint16(rng),
                                 .b_offset_index = generate_random_uint16(rng),
                                 .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::XOR_8:
        return XOR_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::SHL_8:
        return SHL_8_Instruction{
            .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
            .a_offset_index = generate_random_uint16(rng),
            .b_offset_index = generate_random_uint16(rng),
        };
    case InstructionGenerationOptions::SHR_8:
        return SHR_8_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint8(rng) };
    case InstructionGenerationOptions::SET_8:
        return SET_8_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .offset = generate_random_uint8(rng),
                                  .value = generate_random_uint8(rng) };
    case InstructionGenerationOptions::SET_16:
        return SET_16_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .offset = generate_random_uint16(rng),
                                   .value = generate_random_uint16(rng) };
    case InstructionGenerationOptions::SET_32:
        return SET_32_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .offset = generate_random_uint16(rng),
                                   .value = generate_random_uint32(rng) };
    case InstructionGenerationOptions::SET_64:
        return SET_64_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .offset = generate_random_uint16(rng),
                                   .value = generate_random_uint64(rng) };
    case InstructionGenerationOptions::SET_128:
        return SET_128_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .offset = generate_random_uint16(rng),
                                    .value_low = generate_random_uint64(rng),
                                    .value_high = generate_random_uint64(rng) };
    case InstructionGenerationOptions::SET_FF:
        return SET_FF_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .offset = generate_random_uint16(rng),
                                   .value = generate_random_field(rng) };
    case InstructionGenerationOptions::ADD_16:
        return ADD_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::SUB_16:
        return SUB_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::MUL_16:
        return MUL_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::DIV_16:
        return DIV_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::FDIV_16:
        return FDIV_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .a_offset_index = generate_random_uint16(rng),
                                    .b_offset_index = generate_random_uint16(rng),
                                    .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::EQ_16:
        return EQ_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::LT_16:
        return LT_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::LTE_16:
        return LTE_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::AND_16:
        return AND_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::OR_16:
        return OR_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                  .a_offset_index = generate_random_uint16(rng),
                                  .b_offset_index = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::XOR_16:
        return XOR_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::NOT_16:
        return NOT_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::SHL_16:
        return SHL_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::SHR_16:
        return SHR_16_Instruction{ .argument_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .a_offset_index = generate_random_uint16(rng),
                                   .b_offset_index = generate_random_uint16(rng),
                                   .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::CAST_8:
        return CAST_8_Instruction{ .src_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                   .src_offset_index = generate_random_uint16(rng),
                                   .dst_offset = generate_random_uint8(rng),
                                   .target_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) };
    case InstructionGenerationOptions::CAST_16:
        return CAST_16_Instruction{ .src_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .src_offset_index = generate_random_uint16(rng),
                                    .dst_offset = generate_random_uint16(rng),
                                    .target_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) };
    case InstructionGenerationOptions::SSTORE:
        return SSTORE_Instruction{ .src_offset_index = generate_random_uint16(rng),
                                   .slot_offset = generate_random_uint16(rng),
                                   .slot = generate_random_field(rng) };
    case InstructionGenerationOptions::SLOAD:
        return SLOAD_Instruction{ .slot_index = generate_random_uint16(rng),
                                  .slot_offset = generate_random_uint16(rng),
                                  .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::GETENVVAR:
        return GETENVVAR_Instruction{ .result_offset = generate_random_uint16(rng),
                                      .type = generate_random_uint8(rng) };
    case InstructionGenerationOptions::EMITNULLIFIER:
        return EMITNULLIFIER_Instruction{ .nullifier_offset_index = generate_random_uint16(rng) };
    case InstructionGenerationOptions::NULLIFIEREXISTS:
        return NULLIFIEREXISTS_Instruction{ .nullifier_offset_index = generate_random_uint16(rng),
                                            .contract_address_offset = generate_random_uint16(rng),
                                            .result_offset = generate_random_uint16(rng) };
    case InstructionGenerationOptions::EMITNOTEHASH:
        return EMITNOTEHASH_Instruction{ .note_hash_offset = generate_random_uint16(rng),
                                         .note_hash = generate_random_field(rng) };
    case InstructionGenerationOptions::NOTEHASHEXISTS:
        return NOTEHASHEXISTS_Instruction{ .notehash_index = generate_random_uint16(rng),
                                           .notehash_offset = generate_random_uint16(rng),
                                           .leaf_index_offset = generate_random_uint16(rng),
                                           .result_offset = generate_random_uint16(rng) };
    }
}
template <typename BinaryInstructionType>
void mutate_binary_instruction_8(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.argument_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::a_offset_index:
        mutate_uint16_t(instruction.a_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::b_offset_index:
        mutate_uint16_t(instruction.b_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::result_offset:
        mutate_uint8_t(instruction.result_offset, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

template <typename BinaryInstructionType>
void mutate_binary_instruction_16(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.argument_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::a_offset_index:
        mutate_uint16_t(instruction.a_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::b_offset_index:
        mutate_uint16_t(instruction.b_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_not_8_instruction(NOT_8_Instruction& instruction, std::mt19937_64& rng)
{
    UnaryInstruction8MutationOptions option = BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case UnaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.argument_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case UnaryInstruction8MutationOptions::offset:
        mutate_uint16_t(instruction.a_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case UnaryInstruction8MutationOptions::result_offset:
        mutate_uint8_t(instruction.result_offset, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
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
    case Set8MutationOptions::offset:
        mutate_uint8_t(instruction.offset, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
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
    case Set16MutationOptions::offset:
        mutate_uint16_t(instruction.offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case Set32MutationOptions::offset:
        mutate_uint16_t(instruction.offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case Set64MutationOptions::offset:
        mutate_uint16_t(instruction.offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case Set128MutationOptions::offset:
        mutate_uint16_t(instruction.offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case SetFFMutationOptions::offset:
        mutate_uint16_t(instruction.offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case UnaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.argument_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case UnaryInstruction8MutationOptions::offset:
        mutate_uint16_t(instruction.a_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case UnaryInstruction8MutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_cast_8_instruction(CAST_8_Instruction& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.src_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::a_offset_index:
        mutate_uint16_t(instruction.src_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::b_offset_index:
        mutate_uint8_t(instruction.dst_offset, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::result_offset:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_cast_16_instruction(CAST_16_Instruction& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::memory_tag:
        mutate_memory_tag(instruction.src_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::a_offset_index:
        mutate_uint16_t(instruction.src_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::b_offset_index:
        mutate_uint16_t(instruction.dst_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case BinaryInstruction8MutationOptions::result_offset:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_sstore_instruction(SSTORE_Instruction& instruction, std::mt19937_64& rng)
{
    SStoreMutationOptions option = BASIC_SSTORE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SStoreMutationOptions::src_offset_index:
        mutate_uint16_t(instruction.src_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case SStoreMutationOptions::slot_offset:
        mutate_uint16_t(instruction.slot_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case SLoadMutationOptions::slot_offset:
        mutate_uint16_t(instruction.slot_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case SLoadMutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_getenvvar_instruction(GETENVVAR_Instruction& instruction, std::mt19937_64& rng)
{
    GetEnvVarMutationOptions option = BASIC_GETENVVAR_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case GetEnvVarMutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case GetEnvVarMutationOptions::type:
        mutate_uint8_t(instruction.type, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_emit_nullifier_instruction(EMITNULLIFIER_Instruction& instruction, std::mt19937_64& rng)
{
    // emitnulifier only has one field
    mutate_uint16_t(instruction.nullifier_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

void mutate_nullifier_exists_instruction(NULLIFIEREXISTS_Instruction& instruction, std::mt19937_64& rng)
{
    NullifierExistsMutationOptions option = BASIC_NULLIFIER_EXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case NullifierExistsMutationOptions::nullifier_offset_index:
        mutate_uint16_t(instruction.nullifier_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case NullifierExistsMutationOptions::contract_address_offset:
        mutate_uint16_t(instruction.contract_address_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case NullifierExistsMutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_emit_note_hash_instruction(EMITNOTEHASH_Instruction& instruction, std::mt19937_64& rng)
{
    EmitNoteHashMutationOptions option = BASIC_EMITNOTEHASH_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmitNoteHashMutationOptions::note_hash_offset:
        mutate_uint16_t(instruction.note_hash_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
    case NoteHashExistsMutationOptions::notehash_offset:
        mutate_uint16_t(instruction.notehash_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case NoteHashExistsMutationOptions::leaf_index_offset:
        mutate_uint16_t(instruction.leaf_index_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case NoteHashExistsMutationOptions::result_offset:
        mutate_uint16_t(instruction.result_offset, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
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
                   [](auto&) { throw std::runtime_error("Unknown instruction"); } },
               instruction);
}

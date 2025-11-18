#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/return_options.hpp"

void mutate_insert_simple_instruction_block(InsertSimpleInstructionBlock& instr, std::mt19937_64& rng)
{
    mutate_uint16_t(instr.instruction_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

void mutate_jump_to_new_block(JumpToNewBlock& instr, std::mt19937_64& rng)
{
    mutate_uint16_t(instr.target_program_block_instruction_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

void mutate_jump_if_to_new_block(JumpIfToNewBlock& instr, std::mt19937_64& rng)
{
    JumpIfMutationOptions option = BASIC_JUMP_IF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case JumpIfMutationOptions::then_program_block_instruction_block_idx:
        mutate_uint16_t(instr.then_program_block_instruction_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case JumpIfMutationOptions::else_program_block_instruction_block_idx:
        mutate_uint16_t(instr.else_program_block_instruction_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case JumpIfMutationOptions::condition_offset:
        mutate_uint16_t(instr.condition_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_jump_to_block(JumpToBlock& instr, std::mt19937_64& rng)
{
    mutate_uint16_t(instr.target_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

void mutate_jump_if_to_block(JumpIfToBlock& instr, std::mt19937_64& rng)
{
    JumpIfToBlockMutationOptions option = BASIC_JUMP_IF_TO_BLOCK_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case JumpIfToBlockMutationOptions::target_then_block_idx:
        mutate_uint16_t(instr.target_then_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case JumpIfToBlockMutationOptions::target_else_block_idx:
        mutate_uint16_t(instr.target_else_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case JumpIfToBlockMutationOptions::condition_offset_index:
        mutate_uint16_t(instr.condition_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_finalize_with_return(FinalizeWithReturn& instr, std::mt19937_64& rng)
{
    mutate_return_options(instr.return_options, rng, BASIC_RETURN_OPTIONS_MUTATION_CONFIGURATION);
}

void mutate_switch_to_non_terminated_block(SwitchToNonTerminatedBlock& instr, std::mt19937_64& rng)
{
    mutate_uint16_t(instr.non_terminated_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

CFGInstruction generate_cfg_instruction(std::mt19937_64& rng)
{
    CFGInstructionGenerationOptions option = BASIC_CFG_INSTRUCTION_GENERATION_CONFIGURATION.select(rng);
    switch (option) {
    case CFGInstructionGenerationOptions::InsertSimpleInstructionBlock:
        return InsertSimpleInstructionBlock(generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpToNewBlock:
        return JumpToNewBlock(generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpIfToNewBlock:
        return JumpIfToNewBlock(generate_random_uint16(rng), generate_random_uint16(rng), generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpToBlock:
        return JumpToBlock(generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpIfToBlock:
        return JumpIfToBlock(generate_random_uint16(rng), generate_random_uint16(rng), generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::FinalizeWithReturn:
        return FinalizeWithReturn(ReturnOptions(generate_random_uint8(rng),
                                                generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                                generate_random_uint16(rng)));
    case CFGInstructionGenerationOptions::SwitchToNonTerminatedBlock:
        return SwitchToNonTerminatedBlock(generate_random_uint16(rng));
    }
}

void mutate_cfg_instruction(CFGInstruction& cfg_instruction, std::mt19937_64& rng)
{
    std::visit(overloaded_cfg_instruction{
                   [&](InsertSimpleInstructionBlock& instr) { mutate_insert_simple_instruction_block(instr, rng); },
                   [&](JumpToNewBlock& instr) { mutate_jump_to_new_block(instr, rng); },
                   [&](JumpIfToNewBlock& instr) { mutate_jump_if_to_new_block(instr, rng); },
                   [&](JumpToBlock& instr) { mutate_jump_to_block(instr, rng); },
                   [&](JumpIfToBlock& instr) { mutate_jump_if_to_block(instr, rng); },
                   [&](FinalizeWithReturn& instr) { mutate_finalize_with_return(instr, rng); },
                   [&](SwitchToNonTerminatedBlock& instr) { mutate_switch_to_non_terminated_block(instr, rng); } },
               cfg_instruction);
}

void mutate_control_flow_vec(std::vector<CFGInstruction>& control_flow_vec, std::mt19937_64& rng)
{
    mutate_vec<CFGInstruction>(
        control_flow_vec, rng, mutate_cfg_instruction, generate_cfg_instruction, BASIC_VEC_MUTATION_CONFIGURATION);
}

#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"

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

CFGInstruction generate_cfg_instruction(std::mt19937_64& rng)
{
    // TODO(defkit): only one option right now
    CFGInstructionGenerationOptions option = BASIC_CFG_INSTRUCTION_GENERATION_CONFIGURATION.select(rng);
    switch (option) {
    case CFGInstructionGenerationOptions::InsertSimpleInstructionBlock:
        return InsertSimpleInstructionBlock(generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpToNewBlock:
        return JumpToNewBlock(generate_random_uint16(rng));
    case CFGInstructionGenerationOptions::JumpIfToNewBlock:
        return JumpIfToNewBlock(generate_random_uint16(rng), generate_random_uint16(rng), generate_random_uint16(rng));
    }
}

void mutate_cfg_instruction(CFGInstruction& cfg_instruction, std::mt19937_64& rng)
{
    std::visit(overloaded_cfg_instruction{
                   [&](InsertSimpleInstructionBlock& instr) { mutate_insert_simple_instruction_block(instr, rng); },
                   [&](JumpToNewBlock& instr) { mutate_jump_to_new_block(instr, rng); },
                   [&](JumpIfToNewBlock& instr) { mutate_jump_if_to_new_block(instr, rng); } },
               cfg_instruction);
}

void mutate_control_flow_vec(std::vector<CFGInstruction>& control_flow_vec, std::mt19937_64& rng)
{
    mutate_vec<CFGInstruction>(
        control_flow_vec, rng, mutate_cfg_instruction, generate_cfg_instruction, BASIC_VEC_MUTATION_CONFIGURATION);
}

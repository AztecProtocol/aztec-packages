#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"

void mutate_insert_simple_instruction_block(InsertSimpleInstructionBlock& instr, std::mt19937_64& rng)
{
    mutate_uint16_t(instr.instruction_block_idx, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
}

CFGInstruction generate_cfg_instruction(std::mt19937_64& rng)
{
    // TODO(defkit): only one option right now
    return InsertSimpleInstructionBlock(generate_random_uint16(rng));
}

void mutate_cfg_instruction(CFGInstruction& cfg_instruction, std::mt19937_64& rng)
{
    std::visit(overloaded_cfg_instruction{ [&](InsertSimpleInstructionBlock& instr) {
                   mutate_insert_simple_instruction_block(instr, rng);
               } },
               cfg_instruction);
}

void mutate_control_flow_vec(std::vector<CFGInstruction>& control_flow_vec, std::mt19937_64& rng)
{
    mutate_vec<CFGInstruction>(
        control_flow_vec, rng, mutate_cfg_instruction, generate_cfg_instruction, BASIC_VEC_MUTATION_CONFIGURATION);
}

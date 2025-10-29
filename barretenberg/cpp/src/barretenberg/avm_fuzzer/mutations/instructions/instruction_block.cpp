#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"

constexpr uint16_t MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION = 10;

std::vector<FuzzInstruction> generate_instruction_block(std::mt19937_64& rng)
{
    std::vector<FuzzInstruction> instruction_block;
    for (uint16_t i = 0; i < std::uniform_int_distribution<uint16_t>(1, MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION)(rng);
         i++) {
        instruction_block.push_back(generate_instruction(rng));
    }
    return instruction_block;
}

void mutate_instruction_block(std::vector<FuzzInstruction>& instruction_block, std::mt19937_64& rng)
{
    mutate_vec<FuzzInstruction>(
        instruction_block, rng, mutate_instruction, generate_instruction, BASIC_VEC_MUTATION_CONFIGURATION);
}

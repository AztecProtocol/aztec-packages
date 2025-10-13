#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"
#include <random>
#include <vector>

void mutate_instruction_vec(std::vector<FuzzInstruction>& instructions, std::mt19937_64& rng)
{
    mutate_vec<FuzzInstruction>(
        instructions, rng, mutate_instruction, generate_instruction, BASIC_VEC_MUTATION_CONFIGURATION);
}

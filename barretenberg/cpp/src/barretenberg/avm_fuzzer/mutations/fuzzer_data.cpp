#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_vec.hpp"
#include <random>

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng)
{
    auto num_of_mutation = std::uniform_int_distribution<uint8_t>(0, MAX_MUTATION_NUM)(rng);
    auto mutation_config = BASIC_FUZZER_DATA_MUTATION_CONFIGURATION.select(rng);
    for (uint8_t i = 0; i < num_of_mutation; i++) {
        switch (mutation_config) {
        case FuzzerDataMutationOptions::InstructionMutation:
            mutate_instruction_vec(fuzzer_data.instructions, rng);
            break;
        case FuzzerDataMutationOptions::CalldataMutation:
            // TODO: implement calldata mutation
            break;
        }
    }
}

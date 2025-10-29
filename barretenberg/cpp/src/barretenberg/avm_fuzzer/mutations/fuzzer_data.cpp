#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"

#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/return_options.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng)
{
    auto num_of_mutation = std::uniform_int_distribution<uint8_t>(0, MAX_MUTATION_NUM)(rng);
    auto mutation_config = BASIC_FUZZER_DATA_MUTATION_CONFIGURATION.select(rng);
    for (uint8_t i = 0; i < num_of_mutation; i++) {
        switch (mutation_config) {
        case FuzzerDataMutationOptions::InstructionMutation:
            mutate_vec<std::vector<FuzzInstruction>>(fuzzer_data.instruction_blocks,
                                                     rng,
                                                     mutate_instruction_block,
                                                     generate_instruction_block,
                                                     BASIC_VEC_MUTATION_CONFIGURATION);
            break;
        case FuzzerDataMutationOptions::ControlFlowCommandMutation:
            mutate_control_flow_vec(fuzzer_data.cfg_instructions, rng);
            break;
        case FuzzerDataMutationOptions::ReturnOptionsMutation:
            mutate_return_options(fuzzer_data.return_options, rng, BASIC_RETURN_OPTIONS_MUTATION_CONFIGURATION);
            break;
        case FuzzerDataMutationOptions::CalldataMutation:
            // TODO(defkit): implement calldata mutation
            break;
        }
    }
}

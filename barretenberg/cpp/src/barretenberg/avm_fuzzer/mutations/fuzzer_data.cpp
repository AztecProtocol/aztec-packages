#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"

#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/calldata/calldata_vec.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/return_options.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::fuzzer {

using ValueTag = bb::avm2::ValueTag;

namespace {

// Coverage feedback can only attribute a gain to the edit that produced it, so stacking up to twenty
// structural mutations makes each input close to an independent sample rather than a step. Take one
// or two most of the time, and occasionally a burst to escape a local optimum.
uint8_t choose_mutation_count(std::mt19937_64& rng)
{
    if (std::uniform_int_distribution<int>(0, 15)(rng) == 0) {
        return std::uniform_int_distribution<uint8_t>(1, MAX_MUTATION_NUM)(rng);
    }
    return std::uniform_int_distribution<uint8_t>(1, 4)(rng);
}

} // namespace

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng, const FuzzerContext& context)
{
    auto num_of_mutation = choose_mutation_count(rng);
    for (uint8_t i = 0; i < num_of_mutation; i++) {
        // Select mutation type each iteration for more variety
        auto mutation_config = BASIC_FUZZER_DATA_MUTATION_CONFIGURATION.select(rng);
        switch (mutation_config) {
        case FuzzerDataMutationOptions::InstructionMutation:
            mutate_vec<InstructionBlock>(
                fuzzer_data.instruction_blocks,
                rng,
                [&context](InstructionBlock& block, std::mt19937_64& r) {
                    mutate_instruction_block(block, r, context);
                },
                [&context](std::mt19937_64& r) { return generate_instruction_block(r, context); },
                BASIC_VEC_MUTATION_CONFIGURATION);
            break;
        case FuzzerDataMutationOptions::ControlFlowCommandMutation:
            mutate_control_flow_vec(fuzzer_data.cfg_instructions, rng);
            break;
        case FuzzerDataMutationOptions::ReturnOptionsMutation:
            mutate_return_options(fuzzer_data.return_options, rng, BASIC_RETURN_OPTIONS_MUTATION_CONFIGURATION);
            break;
        case FuzzerDataMutationOptions::CalldataMutation:
            mutate_calldata_vec(fuzzer_data.calldata, rng);
            if (fuzzer_data.calldata.size() > 0) {
                // For ts simulator, Selector must fit in 4 bytes (1st calldata element is perceived as the selector)
                // just setting it to 0
                fuzzer_data.calldata[0] = bb::avm2::FF(0);
            }
            break;
        }
    }
}

void add_default_instruction_block_if_empty(FuzzerData& fuzzer_data, std::mt19937_64& rng, const FuzzerContext& context)
{
    if (fuzzer_data.instruction_blocks.empty()) {
        InstructionBlock instruction_block = generate_instruction_block(rng, context);
        std::vector<FuzzInstruction> preamble;
        uint32_t num_tags = static_cast<uint32_t>(ValueTag::MAX);
        preamble.reserve(num_tags);
        // Add one set per memory tag type
        for (uint32_t i = 0; i < num_tags; i++) {
            // TODO: Randomize address, value. Keep address < 255 so it can be used anywhere.
            auto tag = static_cast<ValueTag>(i);
            preamble.push_back(SET_8_Instruction{
                .value_tag = tag,
                .result_address =
                    AddressRef{
                        .address = i + 1, // Skip address 0
                    },
                .value = 1,
            });
        }
        instruction_block.instructions.insert(instruction_block.instructions.begin(), preamble.begin(), preamble.end());
        fuzzer_data.instruction_blocks.push_back(instruction_block);
        fuzzer_data.cfg_instructions.push_back(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    }
}

FuzzerData generate_fuzzer_data(std::mt19937_64& rng, const FuzzerContext& context)
{
    FuzzerData fuzzer_data = FuzzerData();
    add_default_instruction_block_if_empty(fuzzer_data, rng, context);
    return fuzzer_data;
}

} // namespace bb::avm2::fuzzer

#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"

namespace bb::avm2::fuzzer {

constexpr uint16_t MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION = 10;

std::vector<FuzzInstruction> generate_instruction_block(std::mt19937_64& rng, const FuzzerContext& context)
{
    std::vector<FuzzInstruction> instruction_block;
    for (uint16_t i = 0; i < std::uniform_int_distribution<uint16_t>(1, MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION)(rng);
         i++) {
        auto instructions = generate_instruction(rng, context);
        instruction_block.insert(instruction_block.end(), instructions.begin(), instructions.end());
    }
    return instruction_block;
}

void mutate_instruction_block(std::vector<FuzzInstruction>& instruction_block,
                              std::mt19937_64& rng,
                              const FuzzerContext& context)
{
    // If vector is empty, force insertion (other mutations do nothing on empty vectors)
    if (instruction_block.empty()) {
        auto new_instructions = generate_instruction(rng, context);
        instruction_block.insert(instruction_block.end(), new_instructions.begin(), new_instructions.end());
        return;
    }

    VecMutationOptions option = BASIC_VEC_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case VecMutationOptions::Insertion: {
        // Custom insertion logic to handle vector-returning generator
        auto new_instructions = generate_instruction(rng, context);
        if (!new_instructions.empty()) {
            std::uniform_int_distribution<size_t> dist(0, instruction_block.size());
            size_t index = dist(rng);
            instruction_block.insert(instruction_block.begin() + static_cast<std::ptrdiff_t>(index),
                                     new_instructions.begin(),
                                     new_instructions.end());
        }
        break;
    }
    case VecMutationOptions::Deletion:
        RandomDeletion::mutate(rng, instruction_block);
        break;
    case VecMutationOptions::Swap:
        RandomSwap::mutate(rng, instruction_block);
        break;
    case VecMutationOptions::ElementMutation:
        RandomElementMutation::mutate(rng, instruction_block, [&context](FuzzInstruction& instr, std::mt19937_64& r) {
            mutate_instruction(instr, r, context);
        });
        break;
    }
}

} // namespace bb::avm2::fuzzer

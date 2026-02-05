#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"

namespace bb::avm2::fuzzer {

constexpr uint16_t MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION = 10;

InstructionBlock generate_instruction_block(std::mt19937_64& rng, const FuzzerContext& context)
{
    InstructionBlock instruction_block;
    instruction_block.base_offset = std::uniform_int_distribution<uint32_t>(0, AVM_HIGHEST_MEM_ADDRESS)(rng);
    InstructionMutator instruction_mutator(instruction_block, context);
    for (uint16_t i = 0; i < std::uniform_int_distribution<uint16_t>(1, MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION)(rng);
         i++) {
        auto new_instructions = instruction_mutator.generate_instruction(rng);
        instruction_block.instructions.insert(
            instruction_block.instructions.end(), new_instructions.begin(), new_instructions.end());
    }
    return instruction_block;
}

void mutate_instruction_block(InstructionBlock& instruction_block, std::mt19937_64& rng, const FuzzerContext& context)
{
    InstructionMutator instruction_mutator(instruction_block, context);

    // If vector is empty, force insertion (other mutations do nothing on empty vectors)
    if (instruction_block.instructions.empty()) {
        auto new_instructions = instruction_mutator.generate_instruction(rng);
        instruction_block.instructions.insert(
            instruction_block.instructions.end(), new_instructions.begin(), new_instructions.end());
        return;
    }

    VecMutationOptions option = BASIC_VEC_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case VecMutationOptions::Insertion: {
        // Custom insertion logic to handle vector-returning generator
        auto new_instructions = instruction_mutator.generate_instruction(rng);
        if (!new_instructions.empty()) {
            std::uniform_int_distribution<size_t> dist(0, instruction_block.instructions.size());
            size_t index = dist(rng);
            instruction_block.instructions.insert(instruction_block.instructions.begin() +
                                                      static_cast<std::ptrdiff_t>(index),
                                                  new_instructions.begin(),
                                                  new_instructions.end());
        }
        break;
    }
    case VecMutationOptions::Deletion:
        RandomDeletion::mutate(rng, instruction_block.instructions);
        break;
    case VecMutationOptions::Swap:
        RandomSwap::mutate(rng, instruction_block.instructions);
        break;
    case VecMutationOptions::ElementMutation:
        RandomElementMutation::mutate(
            rng, instruction_block.instructions, [&instruction_mutator](FuzzInstruction& instr, std::mt19937_64& r) {
                instruction_mutator.mutate_instruction(instr, r);
            });
        break;
    }
}

} // namespace bb::avm2::fuzzer

#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"

namespace bb::avm2::fuzzer {

constexpr uint16_t MAX_INSTRUCTION_BLOCK_SIZE_ON_GENERATION = 10;

// A relative operand reaches base_offset + operand, and operands are at most 16 bits wide. Drawn
// uniformly over the whole address space, almost every base offset puts that sum out of range, so
// the first relative access in the block raises an addressing error and halts the enqueued call.
// Keep the bulk of them within reach and visit the top of memory occasionally, which is enough to
// exercise the addressing error path without making it the only thing that happens.
uint32_t generate_base_offset(std::mt19937_64& rng)
{
    if (std::uniform_int_distribution<int>(0, 15)(rng) == 0) {
        return AVM_HIGHEST_MEM_ADDRESS - std::uniform_int_distribution<uint32_t>(0, 65535)(rng);
    }
    return std::uniform_int_distribution<uint32_t>(0, 65535)(rng);
}

InstructionBlock generate_instruction_block(std::mt19937_64& rng, const FuzzerContext& context)
{
    InstructionBlock instruction_block;
    instruction_block.base_offset = generate_base_offset(rng);
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

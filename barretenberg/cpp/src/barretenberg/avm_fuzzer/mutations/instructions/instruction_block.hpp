#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"

namespace bb::avm2::fuzzer {

struct InstructionBlock {
    std::vector<FuzzInstruction> instructions;
    uint32_t base_offset = 0;

    SERIALIZATION_FIELDS(instructions, base_offset);
};

inline std::ostream& operator<<(std::ostream& os, const InstructionBlock& instruction_block)
{
    os << "InstructionBlock {\n";
    os << "  instructions: [\n";
    for (const auto& instr : instruction_block.instructions) {
        os << "    " << instr << ",\n";
    }
    os << "  ],\n";
    os << "  base_offset: " << instruction_block.base_offset << ",\n";
    os << "}";
    return os;
}

InstructionBlock generate_instruction_block(std::mt19937_64& rng, const FuzzerContext& context);

void mutate_instruction_block(InstructionBlock& instruction_block, std::mt19937_64& rng, const FuzzerContext& context);

} // namespace bb::avm2::fuzzer

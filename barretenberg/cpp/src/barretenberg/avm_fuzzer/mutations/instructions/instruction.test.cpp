// Generated and mutated instructions must always build. The operand range checks live in the
// bytecode builder, and the tx fuzzer only runs the builder from its custom mutator, where a failure
// kills the process while libFuzzer's crash artifact holds the input the mutator was handed rather
// than the program that failed. Those failures therefore do not reproduce from the artifact, and the
// seed sweeps below are what catches them instead.
#include <gtest/gtest.h>

#include <cstdint>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

namespace {

using bb::avm2::fuzzer::FuzzerContext;
using bb::avm2::fuzzer::generate_fuzzer_data;
using bb::avm2::fuzzer::generate_instruction_block;
using bb::avm2::fuzzer::mutate_fuzzer_data;
using bb::avm2::fuzzer::mutate_instruction_block;

constexpr uint64_t SEED_COUNT = 2000;

ReturnOptions default_return_options()
{
    return ReturnOptions{ .return_size = 1,
                          .return_value_tag = bb::avm2::MemoryTag::U8,
                          .return_value_offset_index = 0 };
}

std::vector<uint8_t> build_single_block(std::vector<InstructionBlock>& instruction_blocks)
{
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    return control_flow.build_bytecode(default_return_options());
}

// The bytecode build that runs in the mutator, without the contract artifact hashing around it.
std::vector<uint8_t> build_program(FuzzerData& fuzzer_data)
{
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    return control_flow.build_bytecode(fuzzer_data.return_options);
}

TEST(InstructionGenerationTest, GeneratedBlocksBuild)
{
    FuzzerContext context;
    for (uint64_t seed = 0; seed < SEED_COUNT; seed++) {
        std::mt19937_64 rng(seed);
        auto instruction_blocks = std::vector<InstructionBlock>{ generate_instruction_block(rng, context) };
        ASSERT_NO_THROW(build_single_block(instruction_blocks)) << "seed " << seed;
    }
}

TEST(InstructionGenerationTest, MutatedBlocksBuild)
{
    FuzzerContext context;
    for (uint64_t seed = 0; seed < SEED_COUNT; seed++) {
        std::mt19937_64 rng(seed);
        auto instruction_blocks = std::vector<InstructionBlock>{ generate_instruction_block(rng, context) };
        for (size_t round = 0; round < 8; round++) {
            mutate_instruction_block(instruction_blocks[0], rng, context);
        }
        ASSERT_NO_THROW(build_single_block(instruction_blocks)) << "seed " << seed;
    }
}

// Whole programs, which is what the mutator builds. This is also the path an input that fails to
// deserialize takes: the mutator generates a default program with its own seed.
TEST(InstructionGenerationTest, GeneratedProgramsBuild)
{
    FuzzerContext context;
    for (uint64_t seed = 0; seed < SEED_COUNT; seed++) {
        std::mt19937_64 rng(seed);
        auto fuzzer_data = generate_fuzzer_data(rng, context);
        ASSERT_NO_THROW(build_program(fuzzer_data)) << "seed " << seed;
    }
}

TEST(InstructionGenerationTest, MutatedProgramsBuild)
{
    FuzzerContext context;
    for (uint64_t seed = 0; seed < SEED_COUNT; seed++) {
        std::mt19937_64 rng(seed);
        auto fuzzer_data = generate_fuzzer_data(rng, context);
        for (size_t round = 0; round < 8; round++) {
            mutate_fuzzer_data(fuzzer_data, rng, context);
        }
        ASSERT_NO_THROW(build_program(fuzzer_data)) << "seed " << seed;
    }
}

} // namespace

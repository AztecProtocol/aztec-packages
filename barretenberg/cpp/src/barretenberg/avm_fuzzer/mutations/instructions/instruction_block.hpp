#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"

namespace bb::avm2::fuzzer {

std::vector<FuzzInstruction> generate_instruction_block(std::mt19937_64& rng, const FuzzerContext& context);
void mutate_instruction_block(std::vector<FuzzInstruction>& instruction_block,
                              std::mt19937_64& rng,
                              const FuzzerContext& context);

} // namespace bb::avm2::fuzzer

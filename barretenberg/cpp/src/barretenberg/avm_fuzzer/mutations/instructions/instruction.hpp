#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

namespace bb::avm2::fuzzer {

/// @brief Generate one instruction and optionally backfill
std::vector<FuzzInstruction> generate_instruction(std::mt19937_64& rng, const FuzzerContext& context);
void mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng, const FuzzerContext& context);

} // namespace bb::avm2::fuzzer

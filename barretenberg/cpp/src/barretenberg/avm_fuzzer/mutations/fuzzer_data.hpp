#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"

namespace bb::avm2::fuzzer {

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng, const FuzzerContext& context);
FuzzerData generate_fuzzer_data(std::mt19937_64& rng, const FuzzerContext& context);
void add_default_instruction_block_if_empty(FuzzerData& fuzzer_data,
                                            std::mt19937_64& rng,
                                            const FuzzerContext& context);

} // namespace bb::avm2::fuzzer

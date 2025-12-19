#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng);
FuzzerData generate_fuzzer_data(std::mt19937_64& rng);
void add_default_instruction_block_if_empty(FuzzerData& fuzzer_data, std::mt19937_64& rng);

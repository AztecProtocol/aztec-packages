#pragma once
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include <random>

void mutate_fuzzer_data(FuzzerData& fuzzer_data, std::mt19937_64& rng);

#pragma once
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include <random>

void mutate_return_options(ReturnOptions& return_options, std::mt19937_64 rng);

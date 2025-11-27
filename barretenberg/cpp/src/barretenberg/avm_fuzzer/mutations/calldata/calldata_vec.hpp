#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

void mutate_calldata_vec(std::vector<bb::avm2::FF>& calldata, std::mt19937_64& rng);

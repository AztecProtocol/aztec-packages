#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

void mutate_return_options(ReturnOptions& return_options,
                           std::mt19937_64& rng,
                           const ReturnOptionsMutationConfig& config);

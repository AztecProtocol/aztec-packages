#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

void mutate_uint8_t(uint8_t& value, std::mt19937_64& rng, const Uint8MutationConfig& config);

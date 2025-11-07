#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

void mutate_uint128_t(uint128_t& value, std::mt19937_64& rng, const Uint128MutationConfig& config);

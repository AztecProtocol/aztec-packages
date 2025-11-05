#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

uint8_t generate_random_uint8(std::mt19937_64& rng);
void mutate_uint8_t(uint8_t& value, std::mt19937_64& rng, const Uint8MutationConfig& config);

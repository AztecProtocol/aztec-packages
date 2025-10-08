#pragma once

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include <cstdint>
#include <random>

uint16_t generate_random_uint16(std::mt19937_64& rng);
void mutate_uint16_t(uint16_t& value, std::mt19937_64& rng, const Uint16MutationConfig& config);

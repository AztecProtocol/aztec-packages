#pragma once

#include <cstdint>
#include <random>

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

uint16_t generate_random_uint16(std::mt19937_64& rng);
void mutate_uint16_t(uint16_t& value, std::mt19937_64& rng, const Uint16MutationConfig& config);

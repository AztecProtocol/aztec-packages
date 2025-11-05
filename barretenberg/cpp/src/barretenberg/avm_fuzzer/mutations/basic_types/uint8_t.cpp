/// This file contains mechanisms for deterministically mutating a given uint8_t and generating new random uint8_t
/// Types of mutations applied:
/// 1. Random (randomly select a new uint8_t)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"

#include <algorithm>
#include <array>
#include <functional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

uint8_t generate_random_uint8(std::mt19937_64& rng)
{
    return std::uniform_int_distribution<uint8_t>(0, 255)(rng);
}

/// @brief Randomly select a new uint8_t
struct RandomSelection {
    static void mutate(std::mt19937_64& rng, uint8_t& value) { value = generate_random_uint8(rng); }
};

/// @brief Increment by 1
struct IncrementBy1 {
    static void mutate(uint8_t& value) { value = (value + 1) & 0xff; }
};

/// @brief Decrement by 1
struct DecrementBy1 {
    static void mutate(uint8_t& value) { value = (value - 1) & 0xff; }
};

/// @brief Add a random value
struct AddRandomValue {
    static void mutate(uint8_t& value, std::mt19937_64& rng) { value = (value + (generate_random_uint8(rng))) & 0xff; }
};

void mutate_uint8_t(uint8_t& value, std::mt19937_64& rng, const Uint8MutationConfig& config)
{
    Uint8MutationOptions option = config.select(rng);

    switch (option) {
    case Uint8MutationOptions::RandomSelection:
        RandomSelection::mutate(rng, value);
        break;
    case Uint8MutationOptions::IncrementBy1:
        IncrementBy1::mutate(value);
        break;
    case Uint8MutationOptions::DecrementBy1:
        DecrementBy1::mutate(value);
        break;
    case Uint8MutationOptions::AddRandomValue:
        AddRandomValue::mutate(value, rng);
        break;
    }
}

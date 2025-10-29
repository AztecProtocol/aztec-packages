/// This file contains mechanisms for deterministically mutating a given uint16_t and generating new random uint16_t
/// Types of mutations applied:
/// 1. Random (randomly select a new uint16_t)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"

#include <algorithm>
#include <array>
#include <functional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

uint16_t generate_random_uint16(std::mt19937_64& rng)
{
    return std::uniform_int_distribution<uint16_t>(0, 0xffff)(rng);
}

/// @brief Randomly select a new uint16_t
struct RandomSelection {
    static void mutate(std::mt19937_64& rng, uint16_t& value) { value = generate_random_uint16(rng); }
};

/// @brief Increment by 1
struct IncrementBy1 {
    static void mutate(uint16_t& value) { value = (value + 1) & 0xffff; }
};

/// @brief Decrement by 1
struct DecrementBy1 {
    static void mutate(uint16_t& value) { value = (value - 1) & 0xffff; }
};

/// @brief Add a random value
struct AddRandomValue {
    static void mutate(uint16_t& value, std::mt19937_64& rng)
    {
        value = (value + (generate_random_uint16(rng))) & 0xffff;
    }
};

void mutate_uint16_t(uint16_t& value, std::mt19937_64& rng, const Uint16MutationConfig& config)
{
    Uint16MutationOptions option = config.select(rng);

    switch (option) {
    case Uint16MutationOptions::RandomSelection:
        RandomSelection::mutate(rng, value);
        break;
    case Uint16MutationOptions::IncrementBy1:
        IncrementBy1::mutate(value);
        break;
    case Uint16MutationOptions::DecrementBy1:
        DecrementBy1::mutate(value);
        break;
    case Uint16MutationOptions::AddRandomValue:
        AddRandomValue::mutate(value, rng);
        break;
    }
}

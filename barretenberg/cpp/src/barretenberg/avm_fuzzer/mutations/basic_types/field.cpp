/// This file contains mechanisms for deterministically mutating a given field (FF) and generating new random field
/// values Types of mutations applied:
/// 1. Random (randomly select a new field value)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"

#include <algorithm>
#include <array>
#include <functional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint128_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/vm2/common/field.hpp"

using FF = bb::field<bb::Bn254FrParams>;
FF generate_random_field(std::mt19937_64& rng)
{
    // Use the numeric RNG to generate a random field element
    // We'll use a simple approach: generate a random uint256 and reduce it modulo the field modulus
    constexpr FF two = FF::one() + FF::one();
    constexpr FF two_pow_128 = two.pow(128);
    auto lo = generate_random_uint128(rng);
    auto hi = generate_random_uint128(rng);
    return (FF(hi) * two_pow_128) + FF(lo);
}

/// @brief Randomly select a new field value
struct RandomSelection {
    static void mutate(std::mt19937_64& rng, FF& value) { value = generate_random_field(rng); }
};

/// @brief Increment by 1
struct IncrementBy1 {
    static void mutate(bb::avm2::FF& value) { value = value + FF::one(); }
};

/// @brief Decrement by 1
struct DecrementBy1 {
    static void mutate(bb::avm2::FF& value) { value = value - FF::one(); }
};

/// @brief Add a random value
struct AddRandomValue {
    static void mutate(bb::avm2::FF& value, std::mt19937_64& rng) { value = value + generate_random_field(rng); }
};

void mutate_field(bb::avm2::FF& value, std::mt19937_64& rng, const FieldMutationConfig& config)
{
    FieldMutationOptions option = config.select(rng);

    switch (option) {
    case FieldMutationOptions::RandomSelection:
        RandomSelection::mutate(rng, value);
        break;
    case FieldMutationOptions::IncrementBy1:
        IncrementBy1::mutate(value);
        break;
    case FieldMutationOptions::DecrementBy1:
        DecrementBy1::mutate(value);
        break;
    case FieldMutationOptions::AddRandomValue:
        AddRandomValue::mutate(value, rng);
        break;
    }
}

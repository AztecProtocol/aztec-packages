/// This file contains mechanisms for deterministically mutating a given field (FF) and generating new random field
/// values Types of mutations applied:
/// 1. Random (randomly select a new field value)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value
/// 5. Boundary selection (pick from curated edge-case values)

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
#include "barretenberg/numeric/uint256/uint256.hpp"
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

// BN254 scalar field (bn254::fr) boundary values
// Modulus p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
// 4-limb Montgomery representation (64 bits per limb)
// These values exercise:
// - Zero/small values
// - Values near modulus p (exercise modular reduction)
// - Limb boundaries (4 x 64-bit limbs)
// - Values that cause reduction when doubled
// clang-format off
static const std::vector<FF> FIELD_BOUNDARY_VALUES = {
    // === Zero/small values ===
    FF::zero(),                              // 0
    FF::one(),                               // 1
    FF(2),                                   // 2

    // === Values near modulus p (exercise modular reduction) ===
    FF::neg_one(),                           // p - 1 (max field element)
    FF::neg_one() - FF::one(),               // p - 2
    FF::neg_one() - FF(2),                   // p - 3
    FF::neg_one() / FF(2),                   // (p - 1) / 2 (midpoint)
    FF::neg_one() / FF(2) + FF::one(),       // (p + 1) / 2

    // === Limb boundaries (4 x 64-bit limbs) ===
    FF(uint256_t(1) << 64),                  // 2^64 (limb 0/1 boundary)
    FF(uint256_t(1) << 128),                 // 2^128 (limb 1/2 boundary)
    FF(uint256_t(1) << 192),                 // 2^192 (limb 2/3 boundary)
    FF((uint256_t(1) << 64) - 1),            // 2^64 - 1 (limb 0 full)
    FF((uint256_t(1) << 128) - 1),           // 2^128 - 1 (limbs 0-1 full)
    FF((uint256_t(1) << 192) - 1),           // 2^192 - 1 (limbs 0-2 full)

    // === Montgomery form edge cases ===
    FF(uint256_t(1) << 253),                 // 2^253 (near R boundary, < p)
};
// clang-format on

/// @brief Select from curated boundary values
struct BoundarySelection {
    static void mutate(std::mt19937_64& rng, FF& value)
    {
        value = FIELD_BOUNDARY_VALUES[std::uniform_int_distribution<size_t>(0, FIELD_BOUNDARY_VALUES.size() - 1)(rng)];
    }
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
    case FieldMutationOptions::BoundarySelection:
        BoundarySelection::mutate(rng, value);
        break;
    }
}

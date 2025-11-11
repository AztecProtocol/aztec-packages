/// Generic template-based mechanisms for deterministically mutating uint types and generating new random uints
/// Types of mutations applied:
/// 1. Random (randomly select a new value)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value

#pragma once

#include <algorithm>
#include <array>
#include <functional>
#include <random>
#include <type_traits>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

template <typename T> struct UintTraits {
    static constexpr bool has_mask = false;
    static constexpr T mask() { return T(0); }
};

template <> struct UintTraits<uint8_t> {
    static constexpr bool has_mask = true;
    static constexpr uint8_t mask() { return 0xff; }
};

template <> struct UintTraits<uint16_t> {
    static constexpr bool has_mask = true;
    static constexpr uint16_t mask() { return 0xffff; }
};

template <> struct UintTraits<uint32_t> {
    static constexpr bool has_mask = true;
    static constexpr uint32_t mask() { return 0xffffffffUL; }
};

template <> struct UintTraits<uint64_t> {
    static constexpr bool has_mask = true;
    static constexpr uint64_t mask() { return 0xffffffffffffffffULL; }
};

template <> struct UintTraits<uint128_t> {
    static constexpr bool has_mask = false;
};

template <typename T>
typename std::enable_if<std::is_integral<T>::value && std::is_unsigned<T>::value, T>::type generate_random_uint(
    std::mt19937_64& rng)
{
    return std::uniform_int_distribution<T>(0, UintTraits<T>::mask())(rng);
}

template <> inline uint128_t generate_random_uint<uint128_t>(std::mt19937_64& rng)
{
    // Generate two random uint64_t values and combine them
    uint128_t lo = std::uniform_int_distribution<uint64_t>(0, 0xffffffffffffffffULL)(rng);
    uint128_t hi = std::uniform_int_distribution<uint64_t>(0, 0xffffffffffffffffULL)(rng);
    return (hi << 64) + lo;
}

namespace uint_mutation {
template <typename T> struct RandomSelection {
    static void mutate(std::mt19937_64& rng, T& value) { value = generate_random_uint<T>(rng); }
};

template <typename T> struct IncrementBy1 {
    static void mutate(T& value)
    {
        if constexpr (UintTraits<T>::has_mask) {
            value = (value + 1) & UintTraits<T>::mask();
        } else {
            value = value + 1;
        }
    }
};

template <typename T> struct DecrementBy1 {
    static void mutate(T& value)
    {
        if constexpr (UintTraits<T>::has_mask) {
            value = (value - 1) & UintTraits<T>::mask();
        } else {
            value = value - 1;
        }
    }
};

template <typename T> struct AddRandomValue {
    static void mutate(T& value, std::mt19937_64& rng)
    {
        if constexpr (UintTraits<T>::has_mask) {
            value = (value + generate_random_uint<T>(rng)) & UintTraits<T>::mask();
        } else {
            value = value + generate_random_uint<T>(rng);
        }
    }
};
} // namespace uint_mutation

// Generic mutation function using WeightedSelectionConfig
template <typename T, typename ConfigType> void mutate_uint(T& value, std::mt19937_64& rng, const ConfigType& config)
{
    UintMutationOptions option = config.select(rng);

    switch (option) {
    case UintMutationOptions::RandomSelection:
        uint_mutation::RandomSelection<T>::mutate(rng, value);
        break;
    case UintMutationOptions::IncrementBy1:
        uint_mutation::IncrementBy1<T>::mutate(value);
        break;
    case UintMutationOptions::DecrementBy1:
        uint_mutation::DecrementBy1<T>::mutate(value);
        break;
    case UintMutationOptions::AddRandomValue:
        uint_mutation::AddRandomValue<T>::mutate(value, rng);
        break;
    }
}

inline uint8_t generate_random_uint8(std::mt19937_64& rng)
{
    return generate_random_uint<uint8_t>(rng);
}

inline uint16_t generate_random_uint16(std::mt19937_64& rng)
{
    return generate_random_uint<uint16_t>(rng);
}

inline uint32_t generate_random_uint32(std::mt19937_64& rng)
{
    return generate_random_uint<uint32_t>(rng);
}

inline uint64_t generate_random_uint64(std::mt19937_64& rng)
{
    return generate_random_uint<uint64_t>(rng);
}

inline uint128_t generate_random_uint128(std::mt19937_64& rng)
{
    return generate_random_uint<uint128_t>(rng);
}

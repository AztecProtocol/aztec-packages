/// Generic template-based mechanisms for deterministically mutating uint types and generating new random uints
/// Types of mutations applied:
/// 1. Random (randomly select a new value)
/// 2. Increment by 1
/// 3. Decrement by 1
/// 4. Add a random value
/// 5. Boundary selection (pick from curated edge-case values)

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

// BoundaryValues: curated sets of edge-case values for each uint type
// These values exercise:
// - Zero/one edge cases
// - Power-of-2 midpoints (which trigger different code paths in multi-limb arithmetic)
// - Maximum value overflow detection
// - Cross-type boundaries (e.g., U8 max within U16)
template <typename T> struct BoundaryValues;

template <> struct BoundaryValues<uint8_t> {
    static constexpr std::array<uint8_t, 8> values = {
        0,    // Zero
        1,    // One
        2,    // Small value
        127,  // 2^7 - 1 (max value with high bit clear)
        128,  // 2^7 (midpoint, high bit set)
        254,  // Max - 1
        255,  // Max (2^8 - 1)
        0x55, // Alternating bits (01010101)
    };
};

template <> struct BoundaryValues<uint16_t> {
    static constexpr std::array<uint16_t, 10> values = {
        0,      1, 2,
        255,    // U8 max (cross-type boundary)
        256,    // U8 max + 1
        32767,  // 2^15 - 1 (max with high bit clear)
        32768,  // 2^15 (midpoint, high bit set)
        65534,  // Max - 1
        65535,  // Max (2^16 - 1)
        0x5555, // Alternating bits
    };
};

template <> struct BoundaryValues<uint32_t> {
    static constexpr std::array<uint32_t, 12> values = {
        0,          1, 2, 255,
        256, // U8 boundaries
        65535,
        65536,      // U16 boundaries
        0x7FFFFFFF, // 2^31 - 1 (max with high bit clear)
        0x80000000, // 2^31 (midpoint, high bit set)
        0xFFFFFFFE, // Max - 1
        0xFFFFFFFF, // Max (2^32 - 1)
        0x55555555, // Alternating bits
    };
};

template <> struct BoundaryValues<uint64_t> {
    static constexpr std::array<uint64_t, 14> values = {
        0,
        1,
        2,
        0xFF,
        0x100, // U8 boundaries
        0xFFFF,
        0x10000,            // U16 boundaries
        0xFFFFFFFF,         // U32 max
        0x100000000,        // U32 max + 1 (exercises carry into high word)
        0x7FFFFFFFFFFFFFFF, // 2^63 - 1 (max with high bit clear)
        0x8000000000000000, // 2^63 (midpoint, high bit set)
        0xFFFFFFFFFFFFFFFE, // Max - 1
        0xFFFFFFFFFFFFFFFF, // Max (2^64 - 1)
        0x5555555555555555, // Alternating bits
    };
};

template <> struct BoundaryValues<uint128_t> {
    // Critical for multi-limb arithmetic: values at limb boundaries
    // U128 is stored as two 64-bit limbs, so 2^64 boundary is crucial
    static inline const std::array<uint128_t, 14> values = {
        uint128_t(0),
        uint128_t(1),
        uint128_t(2),
        uint128_t(0xFFFFFFFFFFFFFFFFULL),                                 // U64 max (low limb full)
        uint128_t(0xFFFFFFFFFFFFFFFFULL) + 1,                             // 2^64 (carry into high limb)
        uint128_t(1) << 64,                                               // 2^64 (high limb = 1)
        (uint128_t(0x7FFFFFFFFFFFFFFFULL) << 64) | 0xFFFFFFFFFFFFFFFFULL, // 2^127 - 1
        uint128_t(1) << 127,                                              // 2^127 (midpoint)
        (uint128_t(0xFFFFFFFFFFFFFFFFULL) << 64) | 0xFFFFFFFFFFFFFFFEULL, // Max - 1
        (uint128_t(0xFFFFFFFFFFFFFFFFULL) << 64) | 0xFFFFFFFFFFFFFFFFULL, // Max (2^128 - 1)
        uint128_t(1) << 96,                                               // 2^96 (3/4 point)
        (uint128_t(1) << 96) - 1,                                         // 2^96 - 1
        uint128_t(1) << 63,                                               // 2^63 (quarter point)
        (uint128_t(0x5555555555555555ULL) << 64) | 0x5555555555555555ULL, // Alternating bits
    };
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

template <typename T> struct BoundarySelection {
    static void mutate(std::mt19937_64& rng, T& value)
    {
        const auto& bounds = BoundaryValues<T>::values;
        value = bounds[std::uniform_int_distribution<size_t>(0, bounds.size() - 1)(rng)];
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
    case UintMutationOptions::BoundarySelection:
        uint_mutation::BoundarySelection<T>::mutate(rng, value);
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

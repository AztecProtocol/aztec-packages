#pragma once
#include "../uint128/uint128.hpp"
#include "../uint256/uint256.hpp"
#include <cstdint>

namespace numeric {

/**
 * Returns the number of leading 0 bits for a given integer type.
 * Implemented in terms of intrinsics which will use instructions such as `bsr` or `lzcnt` for best performance.
 * Undefined behaviour when input is 0.
 */
constexpr inline size_t count_leading_zeros(uint32_t const& u)
{
    return static_cast<size_t>(__builtin_clz(u));
}

constexpr inline size_t count_leading_zeros(uint64_t const& u)
{
    return static_cast<size_t>(__builtin_clzll(u));
}

constexpr inline size_t count_leading_zeros(uint128_t const& u)
{
    auto hi = static_cast<uint64_t>(u >> 64);
    if (hi != 0U) {
        return static_cast<size_t>(__builtin_clzll(hi));
    }
    auto lo = static_cast<uint64_t>(u);
    return static_cast<size_t>(__builtin_clzll(lo)) + 64;
}

constexpr inline size_t count_leading_zeros(uint256_t const& u)
{
    if (u.data[3] != 0U) {
        return count_leading_zeros(u.data[3]);
    }
    if (u.data[2] != 0U) {
        return count_leading_zeros(u.data[2]) + 64;
    }
    if (u.data[1] != 0U) {
        return count_leading_zeros(u.data[1]) + 128;
    }
    if (u.data[0] != 0U) {
        return count_leading_zeros(u.data[0]) + 192;
    }
    return 256;
}

} // namespace numeric

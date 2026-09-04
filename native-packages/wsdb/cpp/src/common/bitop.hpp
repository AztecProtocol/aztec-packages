#pragma once

#include <bit>
#include <cstdint>

// Minimal bit helpers replacing barretenberg/numeric/bitop/* (no bb dependency).
namespace azteclabs::wsdb::numeric {

// Index of the most-significant set bit (matches barretenberg's get_msb for n > 0).
inline uint64_t get_msb(uint64_t n)
{
    return n == 0 ? 0 : 63 - static_cast<uint64_t>(std::countl_zero(n));
}

// base^exp for small integer powers (matches barretenberg's pow64).
inline uint64_t pow64(uint64_t base, uint64_t exp)
{
    uint64_t result = 1;
    for (uint64_t i = 0; i < exp; ++i) {
        result *= base;
    }
    return result;
}

} // namespace azteclabs::wsdb::numeric

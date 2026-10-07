#pragma once

#include "field/field_element.hpp"
#include <cstdint>
#include <random>

// Minimal RNG shim replacing barretenberg/numeric/random/engine.hpp for tests/fixtures.
namespace azteclabs::wsdb::numeric {
struct RandomEngine {
    static std::mt19937_64& gen()
    {
        static thread_local std::mt19937_64 g{ std::random_device{}() };
        return g;
    }
    wsdb::FieldElement get_random_uint256() { return wsdb::FieldElement::random_element(); }
    uint64_t get_random_uint64() { return gen()(); }
    uint32_t get_random_uint32() { return static_cast<uint32_t>(gen()()); }
    uint8_t get_random_uint8() { return static_cast<uint8_t>(gen()()); }
};
inline RandomEngine& get_randomness()
{
    static RandomEngine e;
    return e;
}
inline RandomEngine& get_debug_randomness()
{
    static RandomEngine e;
    return e;
}
} // namespace azteclabs::wsdb::numeric

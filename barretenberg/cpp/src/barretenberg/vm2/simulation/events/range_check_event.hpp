#pragma once

#include <cstdint>

#include "barretenberg/numeric/uint128/uint128.hpp"

namespace bb::avm2::simulation {

struct RangeCheckEvent {
    uint128_t value;
    uint8_t num_bits;

    bool operator==(const RangeCheckEvent& other) const = default;

    // To be used with deduplicating event emitters.
    using Key = std::tuple<uint128_t, uint8_t>;
    Key get_key() const { return { value, num_bits }; }
};

} // namespace bb::avm2::simulation

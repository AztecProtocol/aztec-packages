#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"

namespace bb::avm2::simulation {

struct GreaterThanEvent {
    uint128_t a;
    uint128_t b;
    bool result;

    // To be used with deduplicating event emitters.
    using Key = std::tuple<uint128_t, uint128_t>;
    Key get_key() const { return { a, b }; }

    bool operator==(const GreaterThanEvent& other) const = default;
};

} // namespace bb::avm2::simulation

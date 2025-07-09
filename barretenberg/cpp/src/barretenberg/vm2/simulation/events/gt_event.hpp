#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"

namespace bb::avm2::simulation {

struct GreaterThanEvent {
    uint128_t a;
    uint128_t b;
    bool result;

    bool operator==(const GreaterThanEvent& other) const = default;
};

} // namespace bb::avm2::simulation

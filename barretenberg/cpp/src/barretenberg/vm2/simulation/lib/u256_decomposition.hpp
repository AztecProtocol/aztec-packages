#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::avm2::simulation {

struct U256Decomposition {
    uint128_t lo;
    uint128_t hi;

    bool operator==(const U256Decomposition& other) const = default;
};

U256Decomposition decompose(const uint256_t& x);

} // namespace bb::avm2::simulation

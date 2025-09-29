#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include <cstdint>

namespace bb::avm2::simulation {

class RangeCheckInterface {
  public:
    virtual ~RangeCheckInterface() = default;
    virtual void assert_range(uint128_t value, uint8_t num_bits) = 0;
};

} // namespace bb::avm2::simulation

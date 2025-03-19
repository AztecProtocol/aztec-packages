#pragma once

#include "barretenberg/vm2/simulation/range_check.hpp"
#include <gmock/gmock.h>

namespace bb::avm2::simulation {

class MockRangeCheck : public RangeCheckInterface {
  public:
    MockRangeCheck();
    ~MockRangeCheck() override;

    MOCK_METHOD(void, assert_range, (uint128_t value, uint8_t num_bits), (override));
};

} // namespace bb::avm2::simulation

#pragma once

#include "barretenberg/vm2/simulation/interfaces/range_check.hpp"

#include <cstddef>
#include <gmock/gmock.h>
#include <vector>

namespace bb::avm2::simulation {

class MockRangeCheck : public RangeCheckInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockRangeCheck();
    ~MockRangeCheck() override;

    MOCK_METHOD(void, assert_range, (uint128_t value, uint8_t num_bits), (override));
};

} // namespace bb::avm2::simulation

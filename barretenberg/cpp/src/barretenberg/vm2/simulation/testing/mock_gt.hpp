#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"

namespace bb::avm2::simulation {

class MockGreaterThan : public GreaterThanInterface {
  public:
    MockGreaterThan();
    ~MockGreaterThan() override;

    MOCK_METHOD(bool, gt, (const FF& a, const FF& b), (override));
    MOCK_METHOD(bool, gt, (const uint128_t& a, const uint128_t& b), (override));
};

} // namespace bb::avm2::simulation

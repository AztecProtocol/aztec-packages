#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/field_gt.hpp"

namespace bb::avm2::simulation {

class MockFieldGreaterThan : public FieldGreaterThanInterface {
  public:
    MockFieldGreaterThan();
    ~MockFieldGreaterThan() override;

    MOCK_METHOD(bool, ff_gt, (const FF& a, const FF& b), (override));
};

} // namespace bb::avm2::simulation

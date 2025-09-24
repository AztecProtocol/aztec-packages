#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/field_gt.hpp"

namespace bb::avm2::simulation {

class MockFieldGreaterThan : public FieldGreaterThanInterface {
  public:
    MockFieldGreaterThan();
    ~MockFieldGreaterThan() override;

    MOCK_METHOD(bool, ff_gt, (const FF& a, const FF& b), (override));
    MOCK_METHOD(U256Decomposition, canon_dec, (const FF& a), (override));
};

} // namespace bb::avm2::simulation

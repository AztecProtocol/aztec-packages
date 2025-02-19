#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/ecc.hpp"

namespace bb::avm2::simulation {

class MockEcc : public EccInterface {
  public:
    MockEcc();
    ~MockEcc() override;

    MOCK_METHOD(AffinePoint, add, (const AffinePoint& p, const AffinePoint& q), (override));
};

} // namespace bb::avm2::simulation

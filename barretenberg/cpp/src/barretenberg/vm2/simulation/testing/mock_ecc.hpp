#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/ecc.hpp"

namespace bb::avm2::simulation {

class MockEcc : public EccInterface {
  public:
    MockEcc();
    ~MockEcc() override;

    MOCK_METHOD(EmbeddedCurvePoint, add, (const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q), (override));
};

} // namespace bb::avm2::simulation

#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/gas_tracker.hpp"

namespace bb::avm2::simulation {

class MockGasTracker : public GasTrackerInterface {
  public:
    MockGasTracker();
    ~MockGasTracker() override;

    MOCK_METHOD(void, consume_gas, (const Gas& dynamic_gas_factor), (override));
    MOCK_METHOD(Gas, compute_gas_limit_for_call, (const Gas& allocated_gas), (override));
};

} // namespace bb::avm2::simulation

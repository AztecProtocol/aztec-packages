#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/gas_tracker.hpp"

namespace bb::avm2::simulation {

class MockGasTracker : public GasTrackerInterface {
  public:
    MockGasTracker();
    ~MockGasTracker() override;

    MOCK_METHOD(void, set_instruction, (const Instruction& instruction), (override));
    MOCK_METHOD(void, consume_base_gas, (), (override));
    MOCK_METHOD(void, consume_dynamic_gas, (Gas dynamic_gas_factor), (override));
    MOCK_METHOD(Gas, compute_gas_limit_for_call, (Gas allocated_gas), (override));
    MOCK_METHOD(GasEvent, finish, (), (override));
};

} // namespace bb::avm2::simulation

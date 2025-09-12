#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class MockExecutionIdManager : public ExecutionIdManagerInterface {
  public:
    MockExecutionIdManager();
    ~MockExecutionIdManager() override;

    MOCK_METHOD(uint32_t, get_execution_id, (), (const, override));
    MOCK_METHOD(void, increment_execution_id, (), (override));
};

} // namespace bb::avm2::simulation

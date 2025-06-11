// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"

namespace bb::avm2::simulation {

MockExecutionIdManager::MockExecutionIdManager() = default;
MockExecutionIdManager::~MockExecutionIdManager() = default;

} // namespace bb::avm2::simulation

// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_contract_instance_manager.hpp"

namespace bb::avm2::simulation {

MockContractInstanceManager::MockContractInstanceManager() = default;
MockContractInstanceManager::~MockContractInstanceManager() = default;

} // namespace bb::avm2::simulation

// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"

#include "barretenberg/vm2/simulation/interfaces/addressing.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/gas_tracker.hpp"

namespace bb::avm2::simulation {

MockExecutionComponentsProvider::MockExecutionComponentsProvider() = default;
MockExecutionComponentsProvider::~MockExecutionComponentsProvider() = default;

} // namespace bb::avm2::simulation

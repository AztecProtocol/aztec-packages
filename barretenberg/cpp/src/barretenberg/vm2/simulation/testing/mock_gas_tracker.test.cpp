// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_gas_tracker.hpp"

namespace bb::avm2::simulation {

MockGasTracker::MockGasTracker() = default;
MockGasTracker::~MockGasTracker() = default;

} // namespace bb::avm2::simulation

// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_debug_log.hpp"

namespace bb::avm2::simulation {

MockDebugLog::MockDebugLog() = default;
MockDebugLog::~MockDebugLog() = default;

} // namespace bb::avm2::simulation

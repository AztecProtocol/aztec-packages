// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_side_effect_tracker.hpp"

namespace bb::avm2::simulation {

MockSideEffectTracker::MockSideEffectTracker() = default;
MockSideEffectTracker::~MockSideEffectTracker() = default;

} // namespace bb::avm2::simulation

// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_ecc.hpp"

#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

MockEcc::MockEcc() = default;
MockEcc::~MockEcc() = default;

} // namespace bb::avm2::simulation

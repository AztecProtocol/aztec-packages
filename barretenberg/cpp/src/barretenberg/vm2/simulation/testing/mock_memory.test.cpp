// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {

MockMemory::MockMemory() = default;
MockMemory::~MockMemory() = default;

} // namespace bb::avm2::simulation
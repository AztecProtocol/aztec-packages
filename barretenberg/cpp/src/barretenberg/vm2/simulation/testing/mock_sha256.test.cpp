// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_sha256.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

MockSha256::MockSha256() = default;
MockSha256::~MockSha256() = default;

} // namespace bb::avm2::simulation

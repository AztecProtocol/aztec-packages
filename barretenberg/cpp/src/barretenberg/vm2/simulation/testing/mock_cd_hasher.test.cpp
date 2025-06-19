// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_cd_hasher.hpp"

namespace bb::avm2::simulation {

MockCalldataHasher::MockCalldataHasher() = default;
MockCalldataHasher::~MockCalldataHasher() = default;

} // namespace bb::avm2::simulation

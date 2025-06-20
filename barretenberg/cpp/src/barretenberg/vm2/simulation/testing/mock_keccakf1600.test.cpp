// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_keccakf1600.hpp"

namespace bb::avm2::simulation {

MockKeccakF1600::MockKeccakF1600() = default;
MockKeccakF1600::~MockKeccakF1600() = default;

} // namespace bb::avm2::simulation

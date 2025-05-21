// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_opcode_io.hpp"

namespace bb::avm2::simulation {

MockOpcodeIO::MockOpcodeIO() = default;
MockOpcodeIO::~MockOpcodeIO() = default;

} // namespace bb::avm2::simulation

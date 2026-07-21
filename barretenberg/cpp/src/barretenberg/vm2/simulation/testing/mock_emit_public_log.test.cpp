// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_emit_public_log.hpp"

namespace bb::avm2::simulation {

MockEmitPublicLog::MockEmitPublicLog() = default;
MockEmitPublicLog::~MockEmitPublicLog() = default;

} // namespace bb::avm2::simulation

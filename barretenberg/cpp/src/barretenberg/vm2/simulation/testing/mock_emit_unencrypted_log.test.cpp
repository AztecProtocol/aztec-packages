// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_emit_unencrypted_log.hpp"

namespace bb::avm2::simulation {

MockEmitUnencryptedLog::MockEmitUnencryptedLog() = default;
MockEmitUnencryptedLog::~MockEmitUnencryptedLog() = default;

} // namespace bb::avm2::simulation

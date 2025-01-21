// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_raw_data_db.hpp"

namespace bb::avm2::simulation {

MockRawDataDB::MockRawDataDB() = default;
MockRawDataDB::~MockRawDataDB() = default;

} // namespace bb::avm2::simulation
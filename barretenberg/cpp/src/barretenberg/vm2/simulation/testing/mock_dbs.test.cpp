// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"

namespace bb::avm2::simulation {

MockContractDB::MockContractDB() = default;
MockContractDB::~MockContractDB() = default;

MockMerkleDB::MockMerkleDB() = default;
MockMerkleDB::~MockMerkleDB() = default;

} // namespace bb::avm2::simulation

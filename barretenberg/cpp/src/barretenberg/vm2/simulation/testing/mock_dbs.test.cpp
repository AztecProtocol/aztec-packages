// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"

namespace bb::avm2::simulation {

MockContractDB::MockContractDB() = default;
MockContractDB::~MockContractDB() = default;

MockLowLevelMerkleDB::MockLowLevelMerkleDB() = default;
MockLowLevelMerkleDB::~MockLowLevelMerkleDB() = default;

MockHighLevelMerkleDB::MockHighLevelMerkleDB() = default;
MockHighLevelMerkleDB::~MockHighLevelMerkleDB() = default;

} // namespace bb::avm2::simulation

// This is not a test file but we need to use .test.cpp so that it is not included in non-test builds.
#include "barretenberg/vm2/simulation/testing/mock_get_contract_instance.hpp"

namespace bb::avm2::simulation {

MockGetContractInstance::MockGetContractInstance() = default;
MockGetContractInstance::~MockGetContractInstance() = default;

} // namespace bb::avm2::simulation

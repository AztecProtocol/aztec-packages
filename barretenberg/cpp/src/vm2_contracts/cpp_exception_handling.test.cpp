#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/contract_artifact.hpp"

// A revert during the setup phase is non-recoverable: the simulator must throw rather than return a
// non-OK revert code.
namespace bb::avm2 {
namespace {

using contracts::ContractArtifact;
using contracts::deploy_artifact;
using contracts::make_call;
using testing::DeployedContract;
using testing::PublicTxSimulationTester;

TEST(CppExceptionHandling, AssertionFailureDuringSetupThrows)
{
    PublicTxSimulationTester tester;
    const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    const DeployedContract contract = deploy_artifact(tester, artifact);

    EXPECT_ANY_THROW({
        tester.simulate_tx_with_setup(/*setup_calls=*/{ make_call(contract.address, artifact, "assertion_failure") },
                                      /*app_calls=*/{});
    });
}

} // namespace
} // namespace bb::avm2

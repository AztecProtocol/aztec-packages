#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/proving_test_support.hpp"

// A simple fee-paying tx (fee enforcement on) is check-circuited. The tester funds the fee payer by
// default.
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::check_circuit_scenario;
using contracts::ContractArtifact;
using contracts::deploy_artifact;
using contracts::make_call;
using testing::DeployedContract;
using testing::PublicTxSimulationTester;
using testing::TxScenario;

TEST(AvmPublicFeePayment, FeePayment)
{
    PublicTxSimulationTester tester;
    const ContractArtifact avm = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    const DeployedContract contract = deploy_artifact(tester, avm);

    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { make_call(
                        contract.address, avm, "add_args_return", { AbiValue::integer(1), AbiValue::integer(2) }) },
                    .sender = AztecAddress(42) },
        /*expect_revert=*/false);
}

} // namespace
} // namespace bb::avm2

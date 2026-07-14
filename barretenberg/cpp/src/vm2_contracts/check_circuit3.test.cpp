#include <cstdint>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/proving_test_support.hpp"

// AVM check-circuit, unhappy paths 3 (exceptional halts across app-logic / teardown phases, skip-to-
// teardown on revertible side-effect limits, nested halt propagation / recovery).
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::check_circuit_scenario;
using contracts::ContractArtifact;
using contracts::deploy_artifact;
using contracts::make_call;
using testing::DeployedContract;
using testing::PublicTxSimulationTester;
using testing::TestEnqueuedCall;
using testing::TxScenario;

const ContractArtifact& avm_test_artifact()
{
    static const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    return artifact;
}

const AztecAddress SENDER = 42;

class AvmCheckCircuit3 : public ::testing::Test {
  protected:
    PublicTxSimulationTester tester;
    DeployedContract contract;

    void SetUp() override { contract = deploy_artifact(tester, avm_test_artifact()); }

    TestEnqueuedCall call(const std::string& fn, const std::vector<AbiValue>& args = {})
    {
        return make_call(contract.address, avm_test_artifact(), fn, args);
    }
    TestEnqueuedCall add_args_return()
    {
        return call("add_args_return", { AbiValue::integer(1), AbiValue::integer(2) });
    }
    TestEnqueuedCall divide_by_zero() { return call("divide_by_zero", { AbiValue::integer(0) }); }
};

TEST_F(AvmCheckCircuit3, HaltsInAppLogicNoTeardown)
{
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { divide_by_zero() }, .sender = SENDER },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, HaltsInAppLogicTeardownSucceeds)
{
    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { divide_by_zero() }, .teardown_call = add_args_return(), .sender = SENDER },
        /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, HaltSkipsRemainingAppLogicNoTeardown)
{
    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { add_args_return(), divide_by_zero(), add_args_return() }, .sender = SENDER },
        /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, HaltSkipsRemainingAppLogicTeardownFine)
{
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { add_args_return(), divide_by_zero(), add_args_return() },
                                       .teardown_call = add_args_return(),
                                       .sender = SENDER },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, HaltDuringRevertibleNullifiersSkipsToTeardown)
{
    std::vector<FF> revertible_nullifiers;
    revertible_nullifiers.reserve(MAX_NULLIFIERS_PER_TX);
    for (uint32_t i = 0; i < MAX_NULLIFIERS_PER_TX; ++i) {
        revertible_nullifiers.push_back(FF(100000 + i));
    }
    // These revertible note hashes / L2->L1 messages are skipped after the nullifier-limit failure;
    // they are present only to mirror the revertible accumulator a real tx would carry.
    const std::vector<FF> revertible_note_hashes = { FF(11111), FF(22222), FF(33333), FF(44444), FF(55555) };
    const std::vector<ScopedL2ToL1Message> revertible_msgs = {
        ScopedL2ToL1Message{ .message = L2ToL1Message{ .recipient = EthAddress(0x1111), .content = FF(0xdddd) },
                             .contract_address = AztecAddress(0x1111) },
        ScopedL2ToL1Message{ .message = L2ToL1Message{ .recipient = EthAddress(0x2222), .content = FF(0xeeee) },
                             .contract_address = AztecAddress(0x2222) },
        ScopedL2ToL1Message{ .message = L2ToL1Message{ .recipient = EthAddress(0x3333), .content = FF(0xffff) },
                             .contract_address = AztecAddress(0x3333) },
    };
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { add_args_return() },
                                       .teardown_call = add_args_return(),
                                       .sender = SENDER,
                                       .non_revertible_nullifiers = { FF(66000) },
                                       .revertible_nullifiers = revertible_nullifiers,
                                       .revertible_note_hashes = revertible_note_hashes,
                                       .revertible_l2_to_l1_messages = revertible_msgs },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, HaltsInTeardownAppLogicSucceeds)
{
    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { add_args_return() }, .teardown_call = divide_by_zero(), .sender = SENDER },
        /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, NestedHaltPropagatesToTopLevel)
{
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { call("external_call_to_divide_by_zero") }, .sender = SENDER },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit3, NestedHaltRecoveredInCaller)
{
    // The contract allocates (da_gas_left - 200k) to the nested call, so it needs a high DA gas limit;
    // the tester's default app-logic gas limits (MAX_PROCESSABLE_*) already provide this.
    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { call("external_call_to_divide_by_zero_recovers") }, .sender = SENDER },
        /*expect_revert=*/false);
}

} // namespace
} // namespace bb::avm2

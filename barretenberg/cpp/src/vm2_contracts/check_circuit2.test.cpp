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

// AVM check-circuit, unhappy paths 2 (exceptional halts, skip-to-teardown, enqueued calls in every
// phase).
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

const ContractArtifact& avm_test_artifact()
{
    static const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    return artifact;
}

const AztecAddress SENDER = 42;

class AvmCheckCircuit2 : public ::testing::Test {
  protected:
    PublicTxSimulationTester tester;
    DeployedContract contract;

    void SetUp() override { contract = deploy_artifact(tester, avm_test_artifact()); }
};

TEST_F(AvmCheckCircuit2, NestedCallToNonExistentContractPropagatesToTopLevel)
{
    check_circuit_scenario(
        tester,
        TxScenario{ .app_calls = { make_call(contract.address, avm_test_artifact(), "nested_call_to_nothing") },
                    .sender = SENDER },
        /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit2, NestedCallToNonExistentContractRecoveredInCaller)
{
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { make_call(
                                           contract.address, avm_test_artifact(), "nested_call_to_nothing_recovers") },
                                       .sender = SENDER },
                           /*expect_revert=*/false);
}

TEST(AvmCheckCircuit2Standalone, TopLevelHaltsForNonExistentContractInAppLogicAndTeardown)
{
    // Intentionally do not deploy the contract, so retrieval fails and the top-level call halts.
    PublicTxSimulationTester tester;
    const AztecAddress missing = 0xdead;
    const auto call = [&] {
        return make_call(
            missing, avm_test_artifact(), "add_args_return", { AbiValue::integer(1), AbiValue::integer(2) });
    };
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { call() }, .teardown_call = call(), .sender = SENDER },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit2, ErrorDuringRevertibleInsertionsSkipsToTeardown)
{
    // 1 non-revertible + MAX_NULLIFIERS_PER_TX revertible nullifiers exceeds the limit, so the
    // revertible phase errors and the tx skips to teardown (overall revert).
    std::vector<FF> revertible_nullifiers;
    revertible_nullifiers.reserve(MAX_NULLIFIERS_PER_TX);
    for (uint32_t i = 0; i < MAX_NULLIFIERS_PER_TX; ++i) {
        revertible_nullifiers.push_back(FF(100000 + i));
    }
    const auto call = [&] {
        return make_call(
            contract.address, avm_test_artifact(), "add_args_return", { AbiValue::integer(1), AbiValue::integer(2) });
    };
    check_circuit_scenario(tester,
                           TxScenario{ .app_calls = { call() },
                                       .teardown_call = call(),
                                       .sender = SENDER,
                                       .non_revertible_nullifiers = { FF(66000) },
                                       .revertible_nullifiers = revertible_nullifiers },
                           /*expect_revert=*/true);
}

TEST_F(AvmCheckCircuit2, EnqueuedCallsInEveryPhaseDependingOnEachOther)
{
    const ContractArtifact& avm = avm_test_artifact();
    check_circuit_scenario(
        tester,
        TxScenario{
            .setup_calls = { make_call(contract.address, avm, "read_assert_storage_single", { AbiValue::integer(0) }),
                             make_call(contract.address, avm, "set_storage_single", { AbiValue::integer(5) }) },
            .app_calls = { make_call(contract.address, avm, "read_assert_storage_single", { AbiValue::integer(5) }),
                           make_call(contract.address, avm, "set_storage_single", { AbiValue::integer(10) }) },
            .teardown_call = make_call(contract.address, avm, "read_assert_storage_single", { AbiValue::integer(10) }),
            .sender = SENDER },
        /*expect_revert=*/false);
}

TEST_F(AvmCheckCircuit2, RevertsInTeardown)
{
    check_circuit_scenario(
        tester,
        TxScenario{ .teardown_call = make_call(
                        contract.address, avm_test_artifact(), "read_assert_storage_single", { AbiValue::integer(10) }),
                    .sender = SENDER },
        /*expect_revert=*/true);
}

} // namespace
} // namespace bb::avm2

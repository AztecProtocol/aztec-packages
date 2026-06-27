#include <cstdint>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/bulk_fixture.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"

// Drives the C++ AVM simulator with the real compiled AvmTest contract artifact.
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::deploy_artifact;
using contracts::make_call;
using testing::DeployedContract;
using testing::PublicTxSimulationTester;

constexpr uint32_t MAX_UNIQUE = MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; // 21
// The Noir function takes a fixed-size [AztecAddress; 23] array.
constexpr size_t ADDRS_LEN = MAX_UNIQUE + 2;

const ContractArtifact& avm_test_artifact()
{
    static const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    return artifact;
}

bool is_ok(const TxSimulationResult& result)
{
    return result.revert_code == RevertCode::OK;
}

// Encodes an [AztecAddress; ADDRS_LEN] argument from a list of address fields.
AbiValue address_array(const std::vector<FF>& addresses)
{
    return AbiValue::fields(addresses);
}

class AvmTestUniqueClassLimit : public ::testing::Test {
  protected:
    PublicTxSimulationTester tester;
    const ContractArtifact& artifact = avm_test_artifact();
    std::vector<DeployedContract> instances;

    void SetUp() override
    {
        // Create enough unique contract classes to reach (and exceed) the limit. Each seed yields a
        // distinct class id from the same bytecode (distinct artifact_hash).
        for (uint32_t i = 0; i <= MAX_UNIQUE; ++i) {
            instances.push_back(deploy_artifact(tester, artifact, /*seed=*/i));
        }
    }

    AztecAddress test_contract_address() const { return instances[0].address; }
};

TEST_F(AvmTestUniqueClassLimit, CallMaxUniqueContractClasses)
{
    // MAX_UNIQUE addresses with unique class ids.
    std::vector<FF> addresses;
    for (uint32_t i = 0; i < MAX_UNIQUE; ++i) {
        addresses.push_back(instances[i].address);
    }
    // Include the first contract again, to show it can still be called after the limit is reached.
    addresses.push_back(instances[0].address);
    // Include another contract that reuses the first contract's class id (new instance, same class).
    const std::vector<uint8_t> bytecode = artifact.public_dispatch_bytecode();
    const DeployedContract reused_class = tester.deploy_contract(bytecode,
                                                                 /*salt=*/FF(1000),
                                                                 /*artifact_hash=*/FF(1),
                                                                 /*private_functions_root=*/FF(3));
    addresses.push_back(reused_class.address);
    ASSERT_EQ(addresses.size(), ADDRS_LEN);

    const TxSimulationResult result = tester.simulate_tx({ make_call(test_contract_address(),
                                                                     artifact,
                                                                     "nested_call_to_add_n_times_different_addresses",
                                                                     { address_array(addresses) }) });
    EXPECT_TRUE(is_ok(result));
}

TEST_F(AvmTestUniqueClassLimit, CallTooManyUniqueContractClassesFails)
{
    // MAX_UNIQUE+1 addresses with unique class ids, plus zero padding to fill the array. Exceeding
    // the unique-class limit must cause an exceptional halt (revert).
    std::vector<FF> addresses;
    for (uint32_t i = 0; i <= MAX_UNIQUE; ++i) {
        addresses.push_back(instances[i].address);
    }
    addresses.push_back(FF(0));
    ASSERT_EQ(addresses.size(), ADDRS_LEN);

    const TxSimulationResult result = tester.simulate_tx({ make_call(test_contract_address(),
                                                                     artifact,
                                                                     "nested_call_to_add_n_times_different_addresses",
                                                                     { address_array(addresses) }) });
    EXPECT_FALSE(is_ok(result));
}

TEST(AvmTestExceptionalHalt, NestedCallToNonExistentContractIsRecoveredFromInCaller)
{
    PublicTxSimulationTester tester;
    const ContractArtifact& artifact = avm_test_artifact();
    const DeployedContract contract = deploy_artifact(tester, artifact);

    const TxSimulationResult result =
        tester.simulate_tx({ make_call(contract.address, artifact, "nested_call_to_nothing_recovers") });
    EXPECT_TRUE(is_ok(result));
}

// Port of bulkTest() from yarn-project/.../fixtures/bulk_test.ts via the shared `bulk_test` fixture:
// deploys AvmTest, registers the protocol/standard contracts it calls, and runs one tx exercising
// bulk_testing, calldata copy, and external calls to fee juice / auth registry / instance registry.
TEST(AvmTestBulk, BulkTesting)
{
    AppTester tester;
    contracts::bulk_test(tester, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2

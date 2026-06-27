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

// AVM check-circuit for the per-tx unique-contract-class-id limit (calling exactly the max number of
// unique classes succeeds; exceeding it reverts). Same scenarios as the AvmTestUniqueClassLimit
// simulation tests, additionally check-circuited.
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

constexpr uint32_t MAX_UNIQUE = MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; // 21
constexpr size_t ADDRS_LEN = MAX_UNIQUE + 2;                                   // [AztecAddress; 23]

const ContractArtifact& avm_test_artifact()
{
    static const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    return artifact;
}

class AvmContractClassLimits : public ::testing::Test {
  protected:
    PublicTxSimulationTester tester;
    std::vector<DeployedContract> instances;

    void SetUp() override
    {
        for (uint32_t i = 0; i <= MAX_UNIQUE; ++i) {
            instances.push_back(deploy_artifact(tester, avm_test_artifact(), /*seed=*/i));
        }
    }

    TxScenario call_with_addresses(const std::vector<FF>& addresses)
    {
        return TxScenario{ .app_calls = { make_call(instances[0].address,
                                                    avm_test_artifact(),
                                                    "nested_call_to_add_n_times_different_addresses",
                                                    { AbiValue::fields(addresses) }) } };
    }
};

TEST_F(AvmContractClassLimits, CallMaxNumberOfUniqueContractClasses)
{
    std::vector<FF> addresses;
    for (uint32_t i = 0; i < MAX_UNIQUE; ++i) {
        addresses.push_back(instances[i].address);
    }
    // Call the first contract again (callable after the limit is reached).
    addresses.push_back(instances[0].address);
    // And an instance that reuses the first contract's class id (same artifact_hash / functions root).
    const DeployedContract reused_class = tester.deploy_contract(avm_test_artifact().public_dispatch_bytecode(),
                                                                 /*salt=*/FF(235622342),
                                                                 /*artifact_hash=*/FF(1),
                                                                 /*private_functions_root=*/FF(3));
    addresses.push_back(reused_class.address);
    ASSERT_EQ(addresses.size(), ADDRS_LEN);

    check_circuit_scenario(tester, call_with_addresses(addresses), /*expect_revert=*/false);
}

TEST_F(AvmContractClassLimits, TooManyUniqueContractClassIdsReverts)
{
    std::vector<FF> addresses;
    for (uint32_t i = 0; i <= MAX_UNIQUE; ++i) {
        addresses.push_back(instances[i].address);
    }
    addresses.push_back(FF(0)); // zero padding to fill the [AztecAddress; 23] arg
    ASSERT_EQ(addresses.size(), ADDRS_LEN);

    check_circuit_scenario(tester, call_with_addresses(addresses), /*expect_revert=*/true);
}

} // namespace
} // namespace bb::avm2

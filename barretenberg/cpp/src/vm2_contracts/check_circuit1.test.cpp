#include <cstdint>

#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"

// AVM check-circuit, unhappy paths 1. Each test runs a single app call that exceeds a per-tx
// side-effect limit (so the tx reverts) and asserts that the resulting circuit still check-circuits
// successfully.
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::make_call;
using contracts::ProvingMode;
using testing::DeployedContract;

const ContractArtifact& avm_test_artifact()
{
    static const ContractArtifact artifact = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    return artifact;
}

class AvmCheckCircuit1 : public ::testing::Test {
  protected:
    AppTester tester;
    DeployedContract contract;

    void SetUp() override
    {
        tester.set_proving_mode(ProvingMode::CheckCircuit);
        contract = tester.deploy(avm_test_artifact());
    }

    // Runs a single app call and asserts it reverted (check-circuit is run inside execute_tx_with_label
    // and throws on failure).
    void expect_reverts(const std::string& fn_name, uint64_t arg)
    {
        const TxSimulationResult result = tester.execute_tx_with_label(
            std::string("AvmTest/") + fn_name,
            AztecAddress(42),
            { make_call(contract.address, avm_test_artifact(), fn_name, { AbiValue::integer(arg) }) },
            /*commit=*/false);
        EXPECT_NE(result.revert_code, RevertCode::OK);
    }
};

TEST_F(AvmCheckCircuit1, TooManyStorageWritesReverts)
{
    expect_reverts("n_storage_writes", MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1);
}

TEST_F(AvmCheckCircuit1, TooManyNoteHashesReverts)
{
    expect_reverts("n_new_note_hashes", MAX_NOTE_HASHES_PER_TX + 1);
}

TEST_F(AvmCheckCircuit1, TooManyNullifiersReverts)
{
    expect_reverts("n_new_nullifiers", MAX_NULLIFIERS_PER_TX + 1);
}

TEST_F(AvmCheckCircuit1, TooManyL2ToL1MsgsReverts)
{
    expect_reverts("n_new_l2_to_l1_msgs", MAX_L2_TO_L1_MSGS_PER_TX + 1);
}

TEST_F(AvmCheckCircuit1, TooManyPublicLogsReverts)
{
    expect_reverts("n_new_public_logs", FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / (1 + PUBLIC_LOG_HEADER_LENGTH) + 1);
}

} // namespace
} // namespace bb::avm2

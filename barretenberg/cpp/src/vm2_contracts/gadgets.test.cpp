#include <cstdint>
#include <string>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"

// Exercises the AVM hashing gadgets (sha256, keccak, poseidon2, pedersen) via the AvmGadgetsTest
// contract.
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::ContractArtifact;
using contracts::deploy_artifact;
using contracts::make_call;
using testing::DeployedContract;
using testing::PublicTxSimulationTester;

const ContractArtifact& gadgets_artifact()
{
    static const ContractArtifact artifact =
        ContractArtifact::load_noir_contract("avm_gadgets_test_contract-AvmGadgetsTest.json");
    return artifact;
}

// An array argument of `count` deterministic values (exact values are immaterial; the call just needs
// to succeed).
AbiValue counting_array(size_t count)
{
    std::vector<FF> values;
    values.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        values.push_back(FF(i));
    }
    return AbiValue::fields(values);
}

// An array argument from explicit byte values.
AbiValue byte_array(const std::vector<uint8_t>& bytes)
{
    std::vector<FF> values(bytes.begin(), bytes.end());
    return AbiValue::fields(values);
}

std::vector<uint8_t> iota_bytes(size_t count)
{
    std::vector<uint8_t> bytes(count);
    for (size_t i = 0; i < count; ++i) {
        bytes[i] = static_cast<uint8_t>(i % 256);
    }
    return bytes;
}

// Decodes a hex digest string into the per-byte field values the AVM returns for a [u8; N] result.
std::vector<FF> expected_digest(const std::string& hex)
{
    std::vector<FF> out;
    for (size_t i = 0; i + 1 < hex.size(); i += 2) {
        out.push_back(FF(std::stoul(hex.substr(i, 2), nullptr, 16)));
    }
    return out;
}

bool is_ok(const TxSimulationResult& result)
{
    return result.revert_code == RevertCode::OK;
}

// Runs a single app call and returns its result.
TxSimulationResult run_gadget(PublicTxSimulationTester& tester,
                              const DeployedContract& contract,
                              const std::string& fn_name,
                              const AbiValue& arg)
{
    return tester.simulate_tx({ make_call(contract.address, gadgets_artifact(), fn_name, { arg }) });
}

class AvmGadgetsShaSize : public ::testing::TestWithParam<uint32_t> {};

TEST_P(AvmGadgetsShaSize, Sha256HashSucceeds)
{
    const uint32_t length = GetParam();
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    const TxSimulationResult result =
        run_gadget(tester, contract, "sha256_hash_" + std::to_string(length), counting_array(length));
    EXPECT_TRUE(is_ok(result));
}

INSTANTIATE_TEST_SUITE_P(AvmGadgets,
                         AvmGadgetsShaSize,
                         ::testing::Values(10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 255, 256, 511, 512, 1024, 1536),
                         [](const ::testing::TestParamInfo<uint32_t>& info) {
                             return "sha256_hash_" + std::to_string(info.param);
                         });

TEST(AvmGadgets, Sha256TestVector)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    const TxSimulationResult result =
        run_gadget(tester, contract, "sha256_hash_10", byte_array({ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }));
    ASSERT_TRUE(is_ok(result));
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3"));
}

TEST(AvmGadgets, Sha256TestVector255Bytes)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    const TxSimulationResult result = run_gadget(tester, contract, "sha256_hash_255", byte_array(iota_bytes(255)));
    ASSERT_TRUE(is_ok(result));
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe"));
}

TEST(AvmGadgets, KeccakTestVector)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    const TxSimulationResult result =
        run_gadget(tester, contract, "keccak_hash", byte_array({ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }));
    ASSERT_TRUE(is_ok(result));
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0"));
}

TEST(AvmGadgets, KeccakTestVector300Bytes)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    const TxSimulationResult result = run_gadget(tester, contract, "keccak_hash_300", byte_array(iota_bytes(300)));
    ASSERT_TRUE(is_ok(result));
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("a679e749a6af300c36e7ff2255d220864eab27b382f9cfdc5aa4d13563ba36ff"));
}

TEST(AvmGadgets, KeccakHash)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "keccak_hash", counting_array(10))));
}

TEST(AvmGadgets, KeccakHash1400)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "keccak_hash_1400", counting_array(1400))));
}

TEST(AvmGadgets, KeccakF1600)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "keccak_f1600", counting_array(25))));
}

TEST(AvmGadgets, Poseidon2Hash)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "poseidon2_hash", counting_array(10))));
}

TEST(AvmGadgets, Poseidon2Hash1000Fields)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "poseidon2_hash_1000fields", counting_array(1000))));
}

TEST(AvmGadgets, PedersenHash)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "pedersen_hash", counting_array(10))));
}

TEST(AvmGadgets, PedersenHashWithIndex)
{
    PublicTxSimulationTester tester;
    const DeployedContract contract = deploy_artifact(tester, gadgets_artifact());
    EXPECT_TRUE(is_ok(run_gadget(tester, contract, "pedersen_hash_with_index", counting_array(10))));
}

} // namespace
} // namespace bb::avm2

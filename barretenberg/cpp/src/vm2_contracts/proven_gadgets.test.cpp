#include <cstdint>
#include <string>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"

// Fully proves + verifies AVM gadget calls. The "test vectors" group also asserts the returned digest.
// The large measurement-only cases (keccak_hash_1400, sha256_hash_1536, poseidon2_hash_1000fields) are
// disabled (they are for local measurement, not CI).
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::make_call;
using contracts::ProvingMode;

const ContractArtifact& gadgets_artifact()
{
    static const ContractArtifact artifact =
        ContractArtifact::load_noir_contract("avm_gadgets_test_contract-AvmGadgetsTest.json");
    return artifact;
}

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

std::vector<FF> expected_digest(const std::string& hex)
{
    std::vector<FF> out;
    for (size_t i = 0; i + 1 < hex.size(); i += 2) {
        out.push_back(FF(std::stoul(hex.substr(i, 2), nullptr, 16)));
    }
    return out;
}

// Proves+verifies a single gadget call and returns its result (so the digest can be asserted).
TxSimulationResult prove_gadget(AppTester& tester, const std::string& fn_name, const AbiValue& arg)
{
    const auto contract = tester.deploy(gadgets_artifact());
    return tester.execute_tx_with_label("AvmGadgetsTest/" + fn_name,
                                        testing::PublicTxSimulationTester::default_sender(),
                                        { make_call(contract.address, gadgets_artifact(), fn_name, { arg }) },
                                        /*commit=*/false);
}

TEST(AvmProvenGadgetsTestVectors, KeccakHash)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    const TxSimulationResult result = prove_gadget(tester, "keccak_hash", byte_array({ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }));
    ASSERT_EQ(result.revert_code, RevertCode::OK);
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0"));
}

TEST(AvmProvenGadgetsTestVectors, KeccakHash300Bytes)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    const TxSimulationResult result = prove_gadget(tester, "keccak_hash_300", byte_array(iota_bytes(300)));
    ASSERT_EQ(result.revert_code, RevertCode::OK);
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("a679e749a6af300c36e7ff2255d220864eab27b382f9cfdc5aa4d13563ba36ff"));
}

TEST(AvmProvenGadgetsTestVectors, Sha256Hash)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    const TxSimulationResult result =
        prove_gadget(tester, "sha256_hash_10", byte_array({ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }));
    ASSERT_EQ(result.revert_code, RevertCode::OK);
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3"));
}

TEST(AvmProvenGadgetsTestVectors, Sha256Hash255Bytes)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    const TxSimulationResult result = prove_gadget(tester, "sha256_hash_255", byte_array(iota_bytes(255)));
    ASSERT_EQ(result.revert_code, RevertCode::OK);
    EXPECT_EQ(result.call_stack_metadata.at(0).output,
              expected_digest("3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe"));
}

// Measurement-only (disabled in CI): full proving of large gadget inputs. Enable locally to measure
// proving cost.
TEST(AvmProvenGadgetsLarge, DISABLED_KeccakHash1400)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    EXPECT_EQ(prove_gadget(tester, "keccak_hash_1400", byte_array(iota_bytes(1400))).revert_code, RevertCode::OK);
}

TEST(AvmProvenGadgetsLarge, DISABLED_Sha256Hash1536)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    EXPECT_EQ(prove_gadget(tester, "sha256_hash_1536", byte_array(iota_bytes(1536))).revert_code, RevertCode::OK);
}

TEST(AvmProvenGadgetsLarge, DISABLED_Poseidon2Hash1000Fields)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    std::vector<FF> input;
    input.reserve(1000);
    for (uint32_t i = 0; i < 1000; ++i) {
        input.push_back(FF(i));
    }
    EXPECT_EQ(prove_gadget(tester, "poseidon2_hash_1000fields", AbiValue::fields(input)).revert_code, RevertCode::OK);
}

} // namespace
} // namespace bb::avm2

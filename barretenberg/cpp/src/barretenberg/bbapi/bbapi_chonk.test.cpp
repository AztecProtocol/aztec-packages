#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/chonk/acir_bincode_mocks.hpp"
#include "barretenberg/chonk/sumcheck_chonk.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include <gtest/gtest.h>

namespace bb::bbapi {

class BBApiChonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BBApiChonkTest, StandaloneVerificationKeySerialization)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true };

    // Compute standalone VK using ChonkComputeStandaloneVk
    auto vk_response =
        ChonkComputeStandaloneVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode } }.execute();

    // Create a VK from the field elements
    auto vk =
        std::make_shared<MegaFlavor::VerificationKey>(from_buffer<MegaFlavor::VerificationKey>(vk_response.bytes));
    EXPECT_EQ(vk->to_field_elements(), vk_response.fields)
        << "Serialized field elements should match original field elements";
}

TEST_F(BBApiChonkTest, ChonkVkSerialization)
{
    auto [bytecode, _witness] = acir_bincode_mocks::create_simple_circuit_bytecode();
    auto vk_response = ChonkComputeIvcVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode } }.execute();

    // Create a VK from the field elements
    SumcheckChonk::VerificationKey vk = from_buffer<SumcheckChonk::VerificationKey>(vk_response.bytes);
    EXPECT_EQ(to_buffer(vk.to_field_elements()), vk_response.bytes)
        << "Serialized field elements should match original field elements";
}

} // namespace bb::bbapi

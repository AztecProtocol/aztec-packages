#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <gtest/gtest.h>

namespace bb::bbapi {

class BBApiClientIvcTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BBApiClientIvcTest, StandaloneVerificationKeySerialization)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true };

    // Compute standalone VK using ClientIvcComputeStandaloneVk
    auto vk_response =
        ClientIvcComputeStandaloneVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode } }.execute();

    // The response contains field elements serialized as bytes
    // Verify we can deserialize them correctly
    auto field_elements = many_from_buffer<bb::fr>(vk_response.bytes);
    ASSERT_EQ(field_elements, vk_response.fields) << "Field elements from bytes and fields should match";

    // Create a VK from the field elements
    auto vk = std::make_shared<MegaFlavor::VerificationKey>();
    size_t read_count = vk->from_field_elements(field_elements);
    EXPECT_EQ(read_count, field_elements.size()) << "Should read all field elements";
    EXPECT_EQ(vk->to_field_elements(), field_elements)
        << "Serialized field elements should match original field elements";
}

TEST_F(BBApiClientIvcTest, ClientIvcVkSerialization)
{
    auto [bytecode, _witness] = acir_bincode_mocks::create_simple_circuit_bytecode();
    auto vk_response = ClientIvcComputeIvcVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode } }.execute();

    // The response contains field elements serialized as bytes
    // Verify we can deserialize them correctly
    auto field_elements = many_from_buffer<bb::fr>(vk_response.bytes);
    ASSERT_EQ(field_elements, vk_response.fields) << "Field elements from bytes and fields should match";

    // Create a VK from the field elements
    ClientIVC::VerificationKey vk;
    size_t read_count = vk.from_field_elements(field_elements);
    EXPECT_EQ(read_count, field_elements.size()) << "Should read all field elements";
    EXPECT_EQ(vk.to_field_elements(), field_elements)
        << "Serialized field elements should match original field elements";
}

} // namespace bb::bbapi

#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include <gtest/gtest.h>

namespace bb::bbapi {

class BBApiUltraHonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
TEST_F(BBApiUltraHonkTest, CircuitProve)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Test different combinations of settings
    const std::vector<bbapi::ProofSystemSettings> test_settings = {
        // ipa_accumulation = true (other values don't matter)
        { .ipa_accumulation = true, .oracle_hash_type = "poseidon2", .disable_zk = false },
        // ipa_accumulation = false cases (test both disable_zk values)
        { .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = false },
        { .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = true },
        { .ipa_accumulation = false, .oracle_hash_type = "keccak", .disable_zk = false },
        { .ipa_accumulation = false, .oracle_hash_type = "keccak", .disable_zk = true }
    };

    for (const bbapi::ProofSystemSettings& settings : test_settings) {
        // Compute VK
        auto vk_response =
            CircuitComputeVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }
                .execute();

        // First prove
        auto prove_response = CircuitProve{ .circuit = { .name = "test_circuit",
                                                         .bytecode = bytecode,
                                                         .verification_key = vk_response.bytes },
                                            .witness = witness,
                                            .settings = settings }
                                  .execute();

        // Verify the proof
        auto verify_response = CircuitVerify{ .verification_key = vk_response.bytes,
                                              .public_inputs = prove_response.public_inputs,
                                              .proof = prove_response.proof,
                                              .settings = settings }
                                   .execute();

        EXPECT_TRUE(verify_response.verified)
            << "Failed with ipa_accumulation=" << settings.ipa_accumulation
            << ", oracle_hash_type=" << settings.oracle_hash_type << ", disable_zk=" << settings.disable_zk;
    }
}

} // namespace bb::bbapi

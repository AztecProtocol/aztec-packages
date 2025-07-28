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

TEST_F(BBApiUltraHonkTest, CircuitProveAndVerify)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // First prove
    CircuitProve prove_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                                .witness = witness,
                                .settings = { .ipa_accumulation = false,
                                              .oracle_hash_type = "poseidon2",
                                              .disable_zk = false,
                                              .honk_recursion = 1,
                                              .recursive = false } };

    auto prove_response = std::move(prove_command).execute();

    // Compute VK
    CircuitComputeVk vk_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                 .settings = { .ipa_accumulation = false,
                                               .oracle_hash_type = "poseidon2",
                                               .disable_zk = false,
                                               .honk_recursion = 1,
                                               .recursive = false } };

    auto vk_response = std::move(vk_command).execute();

    // Verify the proof
    CircuitVerify verify_command{ .verification_key = vk_response.bytes,
                                  .public_inputs = prove_response.public_inputs,
                                  .proof = prove_response.proof,
                                  .settings = { .ipa_accumulation = false,
                                                .oracle_hash_type = "poseidon2",
                                                .disable_zk = false,
                                                .honk_recursion = 1,
                                                .recursive = false } };

    auto verify_response = std::move(verify_command).execute();

    EXPECT_TRUE(verify_response.verified);
}

TEST_F(BBApiUltraHonkTest, ProveWithPrecomputedVK)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // First compute the VK
    CircuitComputeVk vk_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                 .settings = { .ipa_accumulation = false,
                                               .oracle_hash_type = "poseidon2",
                                               .disable_zk = false,
                                               .honk_recursion = 1,
                                               .recursive = false } };

    auto vk_response = std::move(vk_command).execute();

    // Now prove with the precomputed VK
    CircuitProve prove_command{
        .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness,
        .settings = { .ipa_accumulation = false,
                      .oracle_hash_type = "poseidon2",
                      .disable_zk = false,
                      .honk_recursion = 1,
                      .recursive = false }
    };

    auto prove_response = std::move(prove_command).execute();

    // Verify response has valid proof
    EXPECT_FALSE(prove_response.proof.empty());
    EXPECT_EQ(prove_response.public_inputs.size(), 0);

    // Verify the proof with the same VK
    CircuitVerify verify_command{ .verification_key = vk_response.bytes,
                                  .public_inputs = prove_response.public_inputs,
                                  .proof = prove_response.proof,
                                  .settings = { .ipa_accumulation = false,
                                                .oracle_hash_type = "poseidon2",
                                                .disable_zk = false,
                                                .honk_recursion = 1,
                                                .recursive = false } };

    auto verify_response = std::move(verify_command).execute();
    EXPECT_TRUE(verify_response.verified);
}

} // namespace bb::bbapi

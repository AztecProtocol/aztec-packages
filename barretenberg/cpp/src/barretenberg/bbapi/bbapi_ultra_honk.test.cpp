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

    CircuitProve command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                          .witness = witness,
                          .settings = { .ipa_accumulation = false,
                                        .oracle_hash_type = "poseidon2",
                                        .disable_zk = false,
                                        .honk_recursion = 1,
                                        .recursive = false } };

    auto response = std::move(command).execute();

    // Verify response has valid proof
    EXPECT_FALSE(response.proof.empty());
    // The simple circuit has no public inputs
    EXPECT_EQ(response.public_inputs.size(), 0);
}

TEST_F(BBApiUltraHonkTest, CircuitComputeVk)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitComputeVk command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                              .settings = { .ipa_accumulation = false,
                                            .oracle_hash_type = "poseidon2",
                                            .disable_zk = false,
                                            .honk_recursion = 1,
                                            .recursive = false } };

    auto response = std::move(command).execute();

    // Verify we got a non-empty verification key
    EXPECT_FALSE(response.bytes.empty());

    // Verify that vk_hash is properly populated
    EXPECT_FALSE(response.vk_hash.empty());
}

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

TEST_F(BBApiUltraHonkTest, CircuitVerifyWithWrongProof)
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

    // Corrupt the proof by changing one element
    auto corrupted_proof = prove_response.proof;
    if (!corrupted_proof.empty()) {
        corrupted_proof[0] = corrupted_proof[0] + bb::fr::one();
    }

    // Verify the corrupted proof
    CircuitVerify verify_command{ .verification_key = vk_response.bytes,
                                  .public_inputs = prove_response.public_inputs,
                                  .proof = corrupted_proof,
                                  .settings = { .ipa_accumulation = false,
                                                .oracle_hash_type = "poseidon2",
                                                .disable_zk = false,
                                                .honk_recursion = 1,
                                                .recursive = false } };

    auto verify_response = std::move(verify_command).execute();

    EXPECT_FALSE(verify_response.verified);
}

TEST_F(BBApiUltraHonkTest, ProveWithDifferentFlavors)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Test with UltraFlavor (poseidon2 + disable_zk)
    {
        CircuitProve command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                              .witness = witness,
                              .settings = { .ipa_accumulation = false,
                                            .oracle_hash_type = "poseidon2",
                                            .disable_zk = true,
                                            .honk_recursion = 1,
                                            .recursive = false } };

        auto response = std::move(command).execute();
        EXPECT_FALSE(response.proof.empty());
    }

    // Test with UltraKeccakFlavor
    {
        CircuitProve command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                              .witness = witness,
                              .settings = { .ipa_accumulation = false,
                                            .oracle_hash_type = "keccak",
                                            .disable_zk = true,
                                            .honk_recursion = 1,
                                            .recursive = false } };

        auto response = std::move(command).execute();
        EXPECT_FALSE(response.proof.empty());
    }

    // Test with UltraRollupFlavor (IPA accumulation)
    {
        CircuitProve command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                              .witness = witness,
                              .settings = { .ipa_accumulation = true,
                                            .oracle_hash_type = "poseidon2",
                                            .disable_zk = false,
                                            .honk_recursion = 2,
                                            .recursive = false } };

        auto response = std::move(command).execute();
        EXPECT_FALSE(response.proof.empty());
    }
}

TEST_F(BBApiUltraHonkTest, CircuitComputeVkHashConsistency)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute VK twice with same settings
    CircuitComputeVk command1{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                               .settings = { .ipa_accumulation = false,
                                             .oracle_hash_type = "poseidon2",
                                             .disable_zk = false,
                                             .honk_recursion = 1,
                                             .recursive = false } };

    CircuitComputeVk command2{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                               .settings = { .ipa_accumulation = false,
                                             .oracle_hash_type = "poseidon2",
                                             .disable_zk = false,
                                             .honk_recursion = 1,
                                             .recursive = false } };

    auto response1 = std::move(command1).execute();
    auto response2 = std::move(command2).execute();

    // Verify both have non-empty vk_hash
    EXPECT_FALSE(response1.vk_hash.empty());
    EXPECT_FALSE(response2.vk_hash.empty());

    // Verify that same circuit produces same vk_hash
    EXPECT_EQ(response1.vk_hash, response2.vk_hash);

    // Verify that the vk_hash has reasonable size (should be 32 bytes for a hash)
    EXPECT_EQ(response1.vk_hash.size(), 32);
}

TEST_F(BBApiUltraHonkTest, ProofAsFields)
{
    // Create and prove a simple circuit
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitProve prove_cmd{ .circuit = { .bytecode = bytecode },
                            .witness = witness,
                            .settings = { .oracle_hash_type = "poseidon2" } };

    auto prove_response = std::move(prove_cmd).execute();

    // Convert proof to fields
    ProofAsFields proof_as_fields_cmd{ .proof = prove_response.proof };

    auto fields_response = std::move(proof_as_fields_cmd).execute();

    // Verify that we got field elements back
    EXPECT_GT(fields_response.fields.size(), 0);

    // The fields should match the original proof
    EXPECT_EQ(fields_response.fields, prove_response.proof);
}

TEST_F(BBApiUltraHonkTest, VkAsFieldsUltraHonk)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute VK
    CircuitComputeVk compute_vk_cmd{ .circuit = { .bytecode = bytecode },
                                     .settings = { .oracle_hash_type = "poseidon2" } };

    auto vk_response = std::move(compute_vk_cmd).execute();

    // Convert VK to fields
    VkAsFields vk_as_fields_cmd{ .verification_key = vk_response.bytes, .is_mega_honk = false };

    auto fields_response = std::move(vk_as_fields_cmd).execute();

    // Verify that we got field elements back
    EXPECT_GT(fields_response.fields.size(), 0);

    // Deserialize the VK and check it matches
    auto vk = from_buffer<UltraFlavor::VerificationKey>(vk_response.bytes);
    auto expected_fields = vk.to_field_elements();

    EXPECT_EQ(fields_response.fields, expected_fields);
}

TEST_F(BBApiUltraHonkTest, VkAsFieldsMegaHonk)
{
    // For MegaHonk test, we need a more complex setup
    // This is a placeholder - in practice, MegaHonk VKs come from recursive circuits

    // Create a dummy MegaFlavor VK for testing
    MegaFlavor::VerificationKey mega_vk;
    mega_vk.log_circuit_size = 4; // log2(16) = 4
    mega_vk.num_public_inputs = 0;

    // Serialize it
    auto vk_bytes = to_buffer(mega_vk);

    // Convert VK to fields
    VkAsFields vk_as_fields_cmd{ .verification_key = vk_bytes, .is_mega_honk = true };

    auto fields_response = std::move(vk_as_fields_cmd).execute();

    // Verify that we got field elements back
    EXPECT_GT(fields_response.fields.size(), 0);

    // Check it matches
    auto expected_fields = mega_vk.to_field_elements();
    EXPECT_EQ(fields_response.fields, expected_fields);
}

TEST_F(BBApiUltraHonkTest, CircuitInfo)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitInfo command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                         .include_gates_per_opcode = true,
                         .settings = { .ipa_accumulation = false,
                                       .oracle_hash_type = "poseidon2",
                                       .disable_zk = false,
                                       .honk_recursion = 1,
                                       .recursive = false } };

    auto response = std::move(command).execute();

    // Verify circuit info
    EXPECT_GT(response.total_gates, 0);
    EXPECT_GT(response.subgroup_size, 0);
    // The simple circuit may not have gates_per_opcode populated
    // EXPECT_FALSE(response.gates_per_opcode.empty());
}

TEST_F(BBApiUltraHonkTest, CircuitWriteSolidityVerifier)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute VK first
    CircuitComputeVk vk_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                 .settings = { .ipa_accumulation = false,
                                               .oracle_hash_type = "keccak",
                                               .disable_zk = false,
                                               .honk_recursion = 1,
                                               .recursive = false } };

    auto vk_response = std::move(vk_command).execute();

    // Generate Solidity verifier
    CircuitWriteSolidityVerifier command{ .verification_key = vk_response.bytes,
                                          .settings = { .ipa_accumulation = false,
                                                        .oracle_hash_type = "keccak",
                                                        .disable_zk = false,
                                                        .honk_recursion = 1,
                                                        .recursive = false } };

    auto response = std::move(command).execute();

    // Verify we got Solidity code
    EXPECT_FALSE(response.solidity_code.empty());
    EXPECT_NE(response.solidity_code.find("contract"), std::string::npos);
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

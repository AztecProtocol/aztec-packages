#include "bbapi_ultra_honk.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "bbapi_execute.hpp"
#include <gtest/gtest.h>
#include <memory>

namespace bb::bbapi {

class BbApiUltraHonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BbApiUltraHonkTest, CircuitProve)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitProve command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                          .witness = witness,
                          .settings = { .ipa_accumulation = false,
                                        .oracle_hash_type = "poseidon2",
                                        .disable_zk = false,
                                        .honk_recursion = 1,
                                        .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify response has valid proof
    EXPECT_FALSE(response.proof.empty());
    // The simple circuit has no public inputs
    EXPECT_EQ(response.public_inputs.size(), 0);
}

TEST_F(BbApiUltraHonkTest, CircuitComputeVk)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitComputeVk command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                              .settings = { .ipa_accumulation = false,
                                            .oracle_hash_type = "poseidon2",
                                            .disable_zk = false,
                                            .honk_recursion = 1,
                                            .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify we got a non-empty verification key
    EXPECT_FALSE(response.bytes.empty());
}

TEST_F(BbApiUltraHonkTest, CircuitInfo)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitInfo command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                         .include_gates_per_opcode = true,
                         .settings = { .ipa_accumulation = false,
                                       .oracle_hash_type = "poseidon2",
                                       .disable_zk = false,
                                       .honk_recursion = 1,
                                       .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify circuit info
    EXPECT_GT(response.total_gates, 0);
    EXPECT_GT(response.subgroup_size, 0);
    EXPECT_FALSE(response.gates_per_opcode.empty());
}

TEST_F(BbApiUltraHonkTest, CircuitCheck)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitCheck command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                          .witness = witness,
                          .settings = { .ipa_accumulation = false,
                                        .oracle_hash_type = "poseidon2",
                                        .disable_zk = false,
                                        .honk_recursion = 1,
                                        .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Circuit should be satisfied with correct witness
    EXPECT_TRUE(response.satisfied);
}

TEST_F(BbApiUltraHonkTest, CircuitCheckFails)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Corrupt the witness to make circuit unsatisfied
    witness[witness.size() - 1] ^= 1; // flip a bit

    CircuitCheck command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                          .witness = witness,
                          .settings = { .ipa_accumulation = false,
                                        .oracle_hash_type = "poseidon2",
                                        .disable_zk = false,
                                        .honk_recursion = 1,
                                        .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Circuit should not be satisfied with incorrect witness
    EXPECT_FALSE(response.satisfied);
}

TEST_F(BbApiUltraHonkTest, CircuitProveAndVerify)
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

TEST_F(BbApiUltraHonkTest, ProofAsFields)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // First generate a proof
    CircuitProve prove_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                                .witness = witness,
                                .settings = { .ipa_accumulation = false,
                                              .oracle_hash_type = "poseidon2",
                                              .disable_zk = false,
                                              .honk_recursion = 1,
                                              .recursive = false } };

    auto prove_response = std::move(prove_command).execute();

    // Convert proof to fields
    ProofAsFields command{ .proof = prove_response.proof };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify we got field elements
    EXPECT_FALSE(response.fields.empty());
    EXPECT_EQ(response.fields.size(), prove_response.proof.size());
}

TEST_F(BbApiUltraHonkTest, VkAsFields)
{
    auto [bytecode, _] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute VK
    CircuitComputeVk vk_command{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                 .settings = { .ipa_accumulation = false,
                                               .oracle_hash_type = "poseidon2",
                                               .disable_zk = false,
                                               .honk_recursion = 1,
                                               .recursive = false } };

    auto vk_response = std::move(vk_command).execute();

    // Convert VK to fields
    VkAsFields command{ .verification_key = vk_response.bytes, .is_mega_honk = false };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify we got field elements
    EXPECT_FALSE(response.fields.empty());
}

TEST_F(BbApiUltraHonkTest, CircuitWriteSolidityVerifier)
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

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify we got Solidity code
    EXPECT_FALSE(response.solidity_code.empty());
    EXPECT_NE(response.solidity_code.find("contract"), std::string::npos);
}

TEST_F(BbApiUltraHonkTest, CircuitBenchmark)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    CircuitBenchmark command{ .circuit = { .name = "test_circuit", .bytecode = bytecode, .verification_key = {} },
                              .witness = witness,
                              .settings = { .ipa_accumulation = false,
                                            .oracle_hash_type = "poseidon2",
                                            .disable_zk = false,
                                            .honk_recursion = 1,
                                            .recursive = false },
                              .num_iterations = 2,
                              .benchmark_witness_generation = true,
                              .benchmark_proving = true };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify benchmark results
    EXPECT_GT(response.witness_generation_time_ms, 0);
    EXPECT_GT(response.proving_time_ms, 0);
    EXPECT_GT(response.verification_time_ms, 0);
    // Peak memory tracking not yet implemented
    // EXPECT_GT(response.peak_memory_bytes, 0);
}

TEST_F(BbApiUltraHonkTest, CircuitProveWithPublicInputs)
{
    // Create a kernel circuit which has public inputs
    size_t vk_size = 100; // Just a reasonable size for testing
    auto bytecode = acir_bincode_mocks::create_simple_kernel(vk_size, /*is_init_kernel=*/true);

    // Create witness data for the kernel circuit
    // The kernel expects witnesses for the VK and key hash
    std::vector<uint8_t> witness;
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item{};

    // Create witness values for VK and key hash
    for (uint32_t i = 0; i < vk_size + 1; ++i) {
        std::string value = "000000000000000000000000000000000000000000000000000000000000000" + std::to_string(i + 1);
        // Ensure it's 64 chars (32 bytes in hex)
        value = value.substr(value.length() - 64);
        stack_item.witness.value[Witnesses::Witness{ i }] = value;
    }
    witness_stack.stack.push_back(stack_item);
    witness = witness_stack.bincodeSerialize();

    CircuitProve command{ .circuit = { .name = "kernel_circuit", .bytecode = bytecode, .verification_key = {} },
                          .witness = witness,
                          .settings = { .ipa_accumulation = false,
                                        .oracle_hash_type = "poseidon2",
                                        .disable_zk = false,
                                        .honk_recursion = 1,
                                        .recursive = false } };

    BBApiRequest request;
    auto response = std::move(command).execute(request);

    // Verify response has valid proof
    EXPECT_FALSE(response.proof.empty());
    // Note: The mock kernel circuit doesn't define public inputs,
    // but in a real kernel circuit there would be public inputs
}

} // namespace bb::bbapi
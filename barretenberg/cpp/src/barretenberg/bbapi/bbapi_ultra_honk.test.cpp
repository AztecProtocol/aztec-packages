#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include <gtest/gtest.h>
#include <vector>

namespace bb::bbapi {

class BBApiUltraHonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    void SetUp() override
    {
        // Store original concurrency for restoration
        original_concurrency = get_num_cpus();
    }

    void TearDown() override
    {
        // Restore original concurrency
        set_parallel_for_concurrency(original_concurrency);
    }

    size_t original_concurrency;
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

TEST_F(BBApiUltraHonkTest, ParallelComputeVk)
{
    // Set hardware concurrency to 8 to ensure we can run 8 VK computations in parallel
    set_parallel_for_concurrency(8);

    constexpr size_t num_vks = 8;

    // Create different circuits by varying the number of constraints
    std::vector<std::vector<uint8_t>> bytecodes(num_vks);
    std::vector<std::vector<uint8_t>> witnesses(num_vks);
    for (size_t i = 0; i < num_vks; ++i) {
        // Create circuit with i+1 constraints (so each circuit is different)
        auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode(i + 1);
        bytecodes[i] = bytecode;
        witnesses[i] = witness;
    }

    std::vector<CircuitComputeVk::Response> parallel_vks(num_vks);
    std::vector<CircuitComputeVk::Response> sequential_vks(num_vks);

    // Use default settings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = false };

    // Compute VKs in parallel
    parallel_for(num_vks, [&](size_t i) {
        parallel_vks[i] =
            CircuitComputeVk{ .circuit = { .name = "test_circuit_" + std::to_string(i), .bytecode = bytecodes[i] },
                              .settings = settings }
                .execute();
    });

    // Compute VKs sequentially
    for (size_t i = 0; i < num_vks; ++i) {
        sequential_vks[i] =
            CircuitComputeVk{ .circuit = { .name = "test_circuit_" + std::to_string(i), .bytecode = bytecodes[i] },
                              .settings = settings }
                .execute();
    }

    // Verify all VKs were computed successfully and match between parallel and sequential
    for (size_t i = 0; i < num_vks; ++i) {
        EXPECT_FALSE(parallel_vks[i].bytes.empty()) << "Parallel VK " << i << " is empty";
        EXPECT_FALSE(sequential_vks[i].bytes.empty()) << "Sequential VK " << i << " is empty";

        // Parallel and sequential should produce identical VKs for the same circuit
        EXPECT_EQ(parallel_vks[i].bytes, sequential_vks[i].bytes)
            << "Parallel VK " << i << " differs from sequential VK " << i;

        // Each circuit should have a different VK (different number of constraints)
        if (i > 0) {
            EXPECT_NE(parallel_vks[i].bytes, parallel_vks[0].bytes)
                << "VK " << i << " should differ from VK 0 (different circuits)";
        }
    }
}

} // namespace bb::bbapi

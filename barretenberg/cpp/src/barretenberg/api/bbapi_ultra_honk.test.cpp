#include "api_ultra_honk.hpp"
#include "barretenberg/api/bbapi.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <filesystem>
#include <gtest/gtest.h>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using namespace bb;
using namespace bb::bbapi;

class ApiUltraHonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_grumpkin_net_crs_factory("../srs_db/grumpkin"); }
};

/**
 * @brief Test basic proof generation and verification for UltraHonk
 */
TEST_F(ApiUltraHonkTest, BasicProveAndVerify)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute verification key
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Generate proof
    auto prove_response = bbapi::CircuitProve{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness_data,
        .settings = {}
    }.execute();

    // Verify proof
    auto verify_response = bbapi::CircuitVerify{
        .verification_key = vk_response.bytes,
        .public_inputs = prove_response.public_inputs,
        .proof = prove_response.proof,
        .settings = {}
    }.execute();

    EXPECT_TRUE(verify_response.verified);
}

/**
 * @brief Test the combined prove and verify functionality
 */
TEST_F(ApiUltraHonkTest, ProveAndVerifyInOneStep)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute verification key
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Prove and verify in one step
    auto response = bbapi::CircuitProveAndVerify{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness_data,
        .settings = {}
    }.execute();

    EXPECT_TRUE(response.verified);
    EXPECT_FALSE(response.proof.empty());
    EXPECT_FALSE(response.public_inputs.empty());
}

/**
 * @brief Test circuit info retrieval
 */
TEST_F(ApiUltraHonkTest, GetCircuitInfo)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Get verification key first
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Get circuit info
    auto info_response = bbapi::CircuitInfo{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .include_gates_per_opcode = true,
        .settings = {}
    }.execute();

    EXPECT_GT(info_response.total_gates, 0);
    EXPECT_GT(info_response.subgroup_size, 0);
    // The simple circuit should have some gates
    EXPECT_FALSE(info_response.gates_per_opcode.empty());
}

/**
 * @brief Test witness satisfaction check
 */
TEST_F(ApiUltraHonkTest, CheckWitnessSatisfaction)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Get verification key first
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Check witness satisfaction
    auto check_response = bbapi::CircuitCheck{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness_data,
        .settings = {}
    }.execute();

    EXPECT_TRUE(check_response.satisfied);
}

/**
 * @brief Test proof and VK field conversion
 */
TEST_F(ApiUltraHonkTest, ConvertProofAndVkToFields)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute verification key
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Generate proof
    auto prove_response = bbapi::CircuitProve{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness_data,
        .settings = {}
    }.execute();

    // Convert proof to fields
    auto proof_fields_response = bbapi::ProofAsFields{ .proof = prove_response.proof }.execute();

    EXPECT_FALSE(proof_fields_response.fields.empty());

    // Convert VK to fields
    auto vk_fields_response =
        bbapi::VkAsFields{ .verification_key = vk_response.bytes, .is_mega_honk = false }.execute();

    EXPECT_FALSE(vk_fields_response.fields.empty());
}

/**
 * @brief Test with different proof system settings
 */
TEST_F(ApiUltraHonkTest, ProveWithDifferentSettings)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Test with Poseidon2 hash (default)
    {
        ProofSystemSettings settings{ .ipa_accumulation = false,
                                      .oracle_hash_type = "poseidon2",
                                      .disable_zk = false,
                                      .honk_recursion = 0,
                                      .recursive = false };

        auto vk_response = bbapi::CircuitComputeVk{ .circuit = { .name = "simple_circuit", .bytecode = bytecode },
                                                    .settings = settings }
                               .execute();

        auto prove_response = bbapi::CircuitProve{ .circuit = { .name = "simple_circuit",
                                                                .bytecode = bytecode,
                                                                .verification_key = vk_response.bytes },
                                                   .witness = witness_data,
                                                   .settings = settings }
                                  .execute();

        auto verify_response = bbapi::CircuitVerify{ .verification_key = vk_response.bytes,
                                                     .public_inputs = prove_response.public_inputs,
                                                     .proof = prove_response.proof,
                                                     .settings = settings }
                                   .execute();

        EXPECT_TRUE(verify_response.verified);
    }

    // Test with ZK disabled
    {
        ProofSystemSettings settings{ .ipa_accumulation = false,
                                      .oracle_hash_type = "poseidon2",
                                      .disable_zk = true,
                                      .honk_recursion = 0,
                                      .recursive = false };

        auto vk_response = bbapi::CircuitComputeVk{ .circuit = { .name = "simple_circuit", .bytecode = bytecode },
                                                    .settings = settings }
                               .execute();

        auto prove_response = bbapi::CircuitProve{ .circuit = { .name = "simple_circuit",
                                                                .bytecode = bytecode,
                                                                .verification_key = vk_response.bytes },
                                                   .witness = witness_data,
                                                   .settings = settings }
                                  .execute();

        auto verify_response = bbapi::CircuitVerify{ .verification_key = vk_response.bytes,
                                                     .public_inputs = prove_response.public_inputs,
                                                     .proof = prove_response.proof,
                                                     .settings = settings }
                                   .execute();

        EXPECT_TRUE(verify_response.verified);
    }
}

/**
 * @brief Test that verification fails with wrong public inputs
 */
TEST_F(ApiUltraHonkTest, VerificationFailsWithWrongPublicInputs)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute verification key
    auto vk_response = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // Generate proof
    auto prove_response = bbapi::CircuitProve{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode, .verification_key = vk_response.bytes },
        .witness = witness_data,
        .settings = {}
    }.execute();

    // Modify public inputs
    auto wrong_public_inputs = prove_response.public_inputs;
    if (!wrong_public_inputs.empty()) {
        wrong_public_inputs[0] = bb::fr::random_element();
    }

    // Verify proof with wrong public inputs
    auto verify_response = bbapi::CircuitVerify{
        .verification_key = vk_response.bytes,
        .public_inputs = wrong_public_inputs,
        .proof = prove_response.proof,
        .settings = {}
    }.execute();

    EXPECT_FALSE(verify_response.verified);
}

/**
 * @brief Test VK comparison
 */
TEST_F(ApiUltraHonkTest, VerificationKeyConsistency)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compute VK twice
    auto vk_response1 = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    auto vk_response2 = bbapi::CircuitComputeVk{
        .circuit = { .name = "simple_circuit", .bytecode = bytecode }, .settings = {}
    }.execute();

    // VKs should be identical
    EXPECT_EQ(vk_response1.bytes, vk_response2.bytes);
}

} // namespace
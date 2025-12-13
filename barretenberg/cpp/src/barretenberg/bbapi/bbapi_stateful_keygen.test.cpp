#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/chonk/acir_bincode_mocks.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <cstring>
#include <gtest/gtest.h>

namespace bb::bbapi {

class StatefulKeygenTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test AcirGetProvingKey command
 * @details Verifies that we can generate a proving key from circuit bytecode
 */
TEST_F(StatefulKeygenTest, AcirGetProvingKey)
{
    auto [bytecode, _witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true }; // UltraFlavor

    // Generate proving key
    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Verify proving key was generated
    EXPECT_FALSE(pk_response.proving_key.empty()) << "Proving key should not be empty";
    EXPECT_GT(pk_response.proving_key.size(), 100) << "Proving key should be reasonably sized";
}

// Helper to unpack combined result from vector<uint8_t>
std::pair<std::vector<uint256_t>, std::vector<uint256_t>> unpack_combined(const std::vector<uint8_t>& combined)
{
    if (combined.size() < 4) {
        throw std::runtime_error("Combined result too small");
    }

    // Read num_public_inputs (first 4 bytes, big endian)
    uint32_t num_pub_inputs_be;
    std::memcpy(&num_pub_inputs_be, combined.data(), 4);
    uint32_t num_pub_inputs = ntohl(num_pub_inputs_be);

    size_t offset = 4;
    size_t element_size = 32;
    size_t pub_inputs_bytes = num_pub_inputs * element_size;

    if (combined.size() < offset + pub_inputs_bytes) {
        throw std::runtime_error("Combined result too small for public inputs");
    }

    std::vector<uint256_t> public_inputs;
    for (size_t i = 0; i < num_pub_inputs; ++i) {
        uint64_t bin_data[4];
        std::memcpy(bin_data, &combined[offset + i * element_size], element_size);
        public_inputs.emplace_back(ntohll(bin_data[3]), ntohll(bin_data[2]), ntohll(bin_data[1]), ntohll(bin_data[0]));
    }

    offset += pub_inputs_bytes;
    size_t remaining_bytes = combined.size() - offset;
    if (remaining_bytes % element_size != 0) {
        throw std::runtime_error("Invalid proof size in combined result");
    }
    size_t num_proof_elements = remaining_bytes / element_size;

    std::vector<uint256_t> proof;
    for (size_t i = 0; i < num_proof_elements; ++i) {
        uint64_t bin_data[4];
        std::memcpy(bin_data, &combined[offset + i * element_size], element_size);
        proof.emplace_back(ntohll(bin_data[3]), ntohll(bin_data[2]), ntohll(bin_data[1]), ntohll(bin_data[0]));
    }

    return std::make_pair(public_inputs, proof);
}

/**
 * @brief Test AcirProveWithPk command
 * @details Verifies that we can prove using a pre-computed proving key
 */
TEST_F(StatefulKeygenTest, AcirProveWithPk)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true }; // UltraFlavor

    // Step 1: Generate proving key
    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Step 2: Prove with pre-computed key
    auto prove_response = AcirProveWithPk{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                           .witness = witness,
                                           .proving_key = pk_response.proving_key,
                                           .settings = settings }
                              .execute();

    // Verify proof was generated
    auto [public_inputs, proof] = unpack_combined(prove_response.combined_result);
    EXPECT_FALSE(proof.empty()) << "Proof should not be empty";
    // Note: public_inputs may be empty for simple circuits with no declared public inputs
    // The 16-element pairing point accumulator is internal and not included in inner public inputs
}

/**
 * @brief Test stateful workflow: Generate key once, prove multiple times
 * @details This is the key use case for stateful keygen - reusing the proving key
 */
TEST_F(StatefulKeygenTest, MultipleProofsWithSameKey)
{
    // Create ONE circuit bytecode
    auto [bytecode, witness1] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Create a SECOND witness for the SAME circuit (different a,b values: 4*5=20 instead of 2*3=6)
    auto witness2 = acir_bincode_mocks::create_witness_for_simple_circuit(bb::fr(4), bb::fr(5));

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true };

    // Generate proving key ONCE
    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Prove MULTIPLE times with different witnesses (same circuit structure)
    auto proof1 = AcirProveWithPk{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                   .witness = witness1,
                                   .proving_key = pk_response.proving_key,
                                   .settings = settings }
                      .execute();

    auto proof2 = AcirProveWithPk{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                   .witness = witness2,
                                   .proving_key = pk_response.proving_key,
                                   .settings = settings }
                      .execute();

    // Both proofs should be valid but different (different witnesses)
    auto [public_inputs1, proof1_vec] = unpack_combined(proof1.combined_result);
    auto [public_inputs2, proof2_vec] = unpack_combined(proof2.combined_result);

    EXPECT_FALSE(proof1_vec.empty());
    EXPECT_FALSE(proof2_vec.empty());
    // Proofs should differ because witnesses differ
    EXPECT_NE(proof1_vec, proof2_vec) << "Different witnesses should produce different proofs";
}

/**
 * @brief Test that stateful keygen produces same proof as one-shot proving
 * @details Verifies correctness by comparing against CircuitProve
 */
TEST_F(StatefulKeygenTest, EquivalenceWithCircuitProve)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true };

    // Method 1: Stateful (get key + prove with key)
    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    auto stateful_proof = AcirProveWithPk{ .circuit = { .name = "test_circuit", .bytecode = bytecode },
                                           .witness = witness,
                                           .proving_key = pk_response.proving_key,
                                           .settings = settings }
                              .execute();

    // Method 2: One-shot (CircuitProve)
    auto vk_response =
        CircuitComputeVk{ .circuit = { .name = "test_circuit", .bytecode = bytecode }, .settings = settings }.execute();

    auto oneshot_proof = CircuitProve{ .circuit = { .name = "test_circuit",
                                                    .bytecode = bytecode,
                                                    .verification_key = vk_response.bytes },
                                       .witness = witness,
                                       .settings = settings }
                             .execute();

    auto [stateful_public_inputs, stateful_proof_data] = unpack_combined(stateful_proof.combined_result);

    // Both methods should produce valid proofs with same public inputs
    auto [oneshot_public_inputs, oneshot_proof_data] = unpack_combined(oneshot_proof.combined_result);
    EXPECT_EQ(stateful_public_inputs, oneshot_public_inputs) << "Public inputs mismatch";
    EXPECT_FALSE(stateful_proof_data.empty()) << "Proof should not be empty";

    auto verify_stateful =
        CircuitVerify{
            .verification_key = vk_response.bytes, // Assuming vk_response.bytes is the intended verification key
            .public_inputs = stateful_public_inputs,
            .proof = stateful_proof_data,
            .settings = settings,
        }
            .execute();

    auto verify_oneshot = CircuitVerify{ .verification_key = vk_response.bytes,
                                         .public_inputs = oneshot_public_inputs,
                                         .proof = oneshot_proof_data,
                                         .settings = settings }
                              .execute();

    EXPECT_TRUE(verify_stateful.verified) << "Stateful proof should verify";
    EXPECT_TRUE(verify_oneshot.verified) << "One-shot proof should verify";
}

/**
 * @brief Test that bytecode hash mismatch is detected
 * @details Verifies that using a proving key generated for one circuit
 * with a different circuit's bytecode throws an appropriate error
 */
TEST_F(StatefulKeygenTest, BytecodeHashMismatch)
{
    // Create two different circuits
    auto [bytecode1, witness1] = acir_bincode_mocks::create_simple_circuit_bytecode(1);
    auto [bytecode2, witness2] = acir_bincode_mocks::create_simple_circuit_bytecode(2);

    bbapi::ProofSystemSettings settings{ .ipa_accumulation = false,
                                         .oracle_hash_type = "poseidon2",
                                         .disable_zk = true };

    // Generate proving key for circuit 1
    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test_circuit", .bytecode = bytecode1 }, .settings = settings }
            .execute();

    // Try to use it with circuit 2's bytecode - should fail
    // Note: EXPECT_THROW doesn't work with brace-enclosed initializer lists,
    // so we use a lambda and manual exception checking
    bool threw_expected_exception = false;
    try {
        AcirProveWithPk prove_cmd;
        prove_cmd.circuit = { .name = "test_circuit", .bytecode = bytecode2 };
        prove_cmd.witness = witness2;
        prove_cmd.proving_key = pk_response.proving_key;
        prove_cmd.settings = settings;
        std::move(prove_cmd).execute();
    } catch (const std::runtime_error& e) {
        threw_expected_exception = true;
        // Verify the error message mentions bytecode hash mismatch
        std::string error_msg = e.what();
        EXPECT_TRUE(error_msg.find("Bytecode hash mismatch") != std::string::npos ||
                    error_msg.find("bytecode") != std::string::npos)
            << "Error message should mention bytecode hash mismatch, got: " << error_msg;
    } catch (...) {
        FAIL() << "Expected std::runtime_error but got different exception type";
    }
    EXPECT_TRUE(threw_expected_exception) << "Using proving key with mismatched bytecode should throw";
}

} // namespace bb::bbapi

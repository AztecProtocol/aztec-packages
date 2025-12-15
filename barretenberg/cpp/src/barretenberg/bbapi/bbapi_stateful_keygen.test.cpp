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

    // All flavor settings to test
    static std::vector<ProofSystemSettings> all_settings()
    {
        return {
            { .ipa_accumulation = true, .oracle_hash_type = "poseidon2", .disable_zk = false },  // UltraRollup
            { .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = false }, // UltraZK
            { .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = true },  // Ultra
            { .ipa_accumulation = false, .oracle_hash_type = "keccak", .disable_zk = false },    // UltraKeccakZK
            { .ipa_accumulation = false, .oracle_hash_type = "keccak", .disable_zk = true }      // UltraKeccak
        };
    }

    static std::string settings_to_string(const ProofSystemSettings& s)
    {
        return "ipa=" + std::to_string(s.ipa_accumulation) + ",hash=" + s.oracle_hash_type +
               ",zk=" + std::to_string(!s.disable_zk);
    }
};

// Helper to unpack combined result
std::pair<std::vector<uint256_t>, std::vector<uint256_t>> unpack_combined(const std::vector<uint8_t>& combined)
{
    if (combined.size() < 4) {
        throw std::runtime_error("Combined result too small");
    }

    uint32_t num_pub_inputs_be;
    std::memcpy(&num_pub_inputs_be, combined.data(), 4);
    uint32_t num_pub_inputs = ntohl(num_pub_inputs_be);

    size_t offset = 4;
    constexpr size_t element_size = 32;
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

    std::vector<uint256_t> proof;
    for (size_t i = 0; i < remaining_bytes / element_size; ++i) {
        uint64_t bin_data[4];
        std::memcpy(bin_data, &combined[offset + i * element_size], element_size);
        proof.emplace_back(ntohll(bin_data[3]), ntohll(bin_data[2]), ntohll(bin_data[1]), ntohll(bin_data[0]));
    }

    return { public_inputs, proof };
}

/**
 * @brief Core test: stateful workflow produces verifiable proofs across all flavors
 */
TEST_F(StatefulKeygenTest, StatefulProveAndVerify)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    for (const auto& settings : all_settings()) {
        SCOPED_TRACE(settings_to_string(settings));

        // Get proving key
        auto pk_response =
            AcirGetProvingKey{ .circuit = { .name = "test", .bytecode = bytecode }, .settings = settings }.execute();
        ASSERT_FALSE(pk_response.proving_key.empty());

        // Prove with cached key
        auto prove_response = AcirProveWithPk{ .circuit = { .name = "test", .bytecode = bytecode },
                                               .witness = witness,
                                               .proving_key = pk_response.proving_key,
                                               .settings = settings }
                                  .execute();

        auto [public_inputs, proof] = unpack_combined(prove_response.combined_result);
        ASSERT_FALSE(proof.empty());

        // Verify proof
        auto vk_response =
            CircuitComputeVk{ .circuit = { .name = "test", .bytecode = bytecode }, .settings = settings }.execute();

        auto verify_response = CircuitVerify{ .verification_key = vk_response.bytes,
                                              .public_inputs = public_inputs,
                                              .proof = proof,
                                              .settings = settings }
                                   .execute();

        EXPECT_TRUE(verify_response.verified);
    }
}

/**
 * @brief Equivalence: stateful and one-shot produce matching public inputs
 */
TEST_F(StatefulKeygenTest, EquivalenceWithCircuitProve)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    for (const auto& settings : all_settings()) {
        SCOPED_TRACE(settings_to_string(settings));

        // Stateful path
        auto pk_response =
            AcirGetProvingKey{ .circuit = { .name = "test", .bytecode = bytecode }, .settings = settings }.execute();

        auto stateful_proof = AcirProveWithPk{ .circuit = { .name = "test", .bytecode = bytecode },
                                               .witness = witness,
                                               .proving_key = pk_response.proving_key,
                                               .settings = settings }
                                  .execute();

        // One-shot path
        auto vk_response =
            CircuitComputeVk{ .circuit = { .name = "test", .bytecode = bytecode }, .settings = settings }.execute();

        auto oneshot_proof =
            CircuitProve{ .circuit = { .name = "test", .bytecode = bytecode, .verification_key = vk_response.bytes },
                          .witness = witness,
                          .settings = settings }
                .execute();

        auto [stateful_pub, _] = unpack_combined(stateful_proof.combined_result);
        auto [oneshot_pub, __] = unpack_combined(oneshot_proof.combined_result);

        EXPECT_EQ(stateful_pub, oneshot_pub) << "Public inputs must match between stateful and one-shot";
    }
}

/**
 * @brief Security: bytecode hash mismatch is caught
 */
TEST_F(StatefulKeygenTest, BytecodeHashMismatch)
{
    auto [bytecode1, witness1] = acir_bincode_mocks::create_simple_circuit_bytecode(1);
    auto [bytecode2, witness2] = acir_bincode_mocks::create_simple_circuit_bytecode(2);

    // Test with one representative flavor (the validation logic is flavor-agnostic)
    ProofSystemSettings settings{ .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = true };

    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test", .bytecode = bytecode1 }, .settings = settings }.execute();

    bool threw = false;
    try {
        AcirProveWithPk cmd;
        cmd.circuit = { .name = "test", .bytecode = bytecode2 };
        cmd.witness = witness2;
        cmd.proving_key = pk_response.proving_key;
        cmd.settings = settings;
        std::move(cmd).execute();
    } catch (const std::runtime_error& e) {
        threw = true;
        EXPECT_TRUE(std::string(e.what()).find("Bytecode hash") != std::string::npos);
    }
    EXPECT_TRUE(threw) << "Mismatched bytecode should throw";
}

/**
 * @brief Key reuse: same key, multiple witnesses
 */
TEST_F(StatefulKeygenTest, MultipleProofsWithSameKey)
{
    auto [bytecode, witness1] = acir_bincode_mocks::create_simple_circuit_bytecode();
    auto witness2 = acir_bincode_mocks::create_witness_for_simple_circuit(bb::fr(4), bb::fr(5));

    // Test with one representative flavor
    ProofSystemSettings settings{ .ipa_accumulation = false, .oracle_hash_type = "poseidon2", .disable_zk = false };

    auto pk_response =
        AcirGetProvingKey{ .circuit = { .name = "test", .bytecode = bytecode }, .settings = settings }.execute();

    auto proof1 = AcirProveWithPk{ .circuit = { .name = "test", .bytecode = bytecode },
                                   .witness = witness1,
                                   .proving_key = pk_response.proving_key,
                                   .settings = settings }
                      .execute();

    auto proof2 = AcirProveWithPk{ .circuit = { .name = "test", .bytecode = bytecode },
                                   .witness = witness2,
                                   .proving_key = pk_response.proving_key,
                                   .settings = settings }
                      .execute();

    auto [_, proof1_vec] = unpack_combined(proof1.combined_result);
    auto [__, proof2_vec] = unpack_combined(proof2.combined_result);

    EXPECT_NE(proof1_vec, proof2_vec) << "Different witnesses should produce different proofs";
}

} // namespace bb::bbapi

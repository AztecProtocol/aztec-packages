#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/program_witness.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include <gtest/gtest.h>

namespace bb::bbapi {

class BBApiUltraHonkTest : public ::testing::Test {
  protected:
    static constexpr size_t NUM_CONSTRAINTS = 10;

    std::vector<uint8_t> create_simple_circuit()
    {
        // Create a simple circuit with some constraints
        acir_format::AcirFormat constraint_system;

        // Add a simple constraint: x + y = z
        constraint_system.poly_triple_constraints.push_back({
            .a = 1,
            .b = 2,
            .c = 3,
            .q_m = 0,
            .q_l = bb::fr::one(),
            .q_r = bb::fr::one(),
            .q_o = -bb::fr::one(),
            .q_c = 0,
        });

        constraint_system.varnum = 4;
        constraint_system.recursive = false;
        constraint_system.num_acir_opcodes = 1;

        // Convert to buffer
        return acir_format::constraint_system_to_acir_buf(constraint_system);
    }

    std::vector<uint8_t> create_witness()
    {
        // Create witness for x=2, y=3, z=5
        acir_format::WitnessVector witness;
        witness.push_back(0); // index 0 is unused
        witness.push_back(2); // x
        witness.push_back(3); // y
        witness.push_back(5); // z

        return acir_format::witness_buf_to_witness_data(witness);
    }
};

TEST_F(BBApiUltraHonkTest, ProofAsFields)
{
    // Create and prove a simple circuit
    auto bytecode = create_simple_circuit();
    auto witness = create_witness();

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
    auto bytecode = create_simple_circuit();

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
    mega_vk.circuit_size = 16; // Minimal circuit size
    mega_vk.log_circuit_size = 4;
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

} // namespace bb::bbapi
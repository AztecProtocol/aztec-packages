#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/plonk_honk_shared/instance_inspector.hpp"
#include "barretenberg/stdlib_circuit_builders/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

class DataBusTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;

    // Construct and verify a GUH proof for a given circuit
    static bool construct_and_verify_proof(GoblinUltraCircuitBuilder& builder)
    {
        GoblinUltraProver prover{ builder };
        auto verification_key = std::make_shared<GoblinUltraFlavor::VerificationKey>(prover.instance->proving_key);
        GoblinUltraVerifier verifier{ verification_key };
        auto proof = prover.construct_proof();
        return verifier.verify_proof(proof);
    }

    // Construct a Goblin Ultra circuit with some arbitrary sample gates
    static GoblinUltraCircuitBuilder construct_test_builder()
    {
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        auto builder = GoblinUltraCircuitBuilder{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(builder);
        return builder;
    }
};

/**
 * @brief Test proof construction/verification for a circuit with calldata lookup gates
 * gates
 *
 */
TEST_F(DataBusTests, CallDataRead)
{
    // Construct a circuit and add some ecc op gates and arithmetic gates
    auto builder = construct_test_builder();

    // Add some values to calldata
    std::vector<FF> calldata_values = { 7, 10, 3, 12, 1 };
    for (auto& val : calldata_values) {
        builder.add_public_calldata(val);
    }

    // Define some raw indices at which to read calldata
    std::vector<uint32_t> read_indices = { 1, 4 };

    // Create some calldata read gates and store the variable indices of the result for later
    std::vector<uint32_t> result_witness_indices;
    for (uint32_t& read_idx : read_indices) {
        // Create a variable corresponding to the index at which we want to read into calldata
        uint32_t read_idx_witness_idx = builder.add_variable(read_idx);

        auto value_witness_idx = builder.read_calldata(read_idx_witness_idx);
        result_witness_indices.emplace_back(value_witness_idx);
    }

    // Generally, we'll want to use the result of a read in some other operation. As an example, we construct a gate
    // that shows the sum of the two values just read is equal to the expected sum.
    FF expected_sum = 0;
    for (uint32_t& read_idx : read_indices) {
        expected_sum += calldata_values[read_idx];
    }
    builder.create_add_gate(
        { result_witness_indices[0], result_witness_indices[1], builder.zero_idx, 1, 1, 0, -expected_sum });

    // Construct and verify Honk proof
    bool result = construct_and_verify_proof(builder);
    EXPECT_TRUE(result);
}

/**
 * @brief Test proof construction/verification for a circuit with return data lookup gates
 * gates
 *
 */
TEST_F(DataBusTests, ReturnDataRead)
{
    // Construct a circuit and add some ecc op gates and arithmetic gates
    auto builder = construct_test_builder();

    // Add some values to return_data
    std::vector<FF> return_data_values = { 7, 10, 3, 12, 1 };
    for (auto& val : return_data_values) {
        builder.add_public_return_data(val);
    }

    // Define some raw indices at which to read return_data
    std::vector<uint32_t> read_indices = { 1, 4 };

    // Create some return_data read gates and store the variable indices of the result for later
    std::vector<uint32_t> result_witness_indices;
    for (uint32_t& read_idx : read_indices) {
        // Create a variable corresponding to the index at which we want to read into return_data
        uint32_t read_idx_witness_idx = builder.add_variable(read_idx);

        auto value_witness_idx = builder.read_return_data(read_idx_witness_idx);
        result_witness_indices.emplace_back(value_witness_idx);
    }

    // Generally, we'll want to use the result of a read in some other operation. As an example, we construct a gate
    // that shows the sum of the two values just read is equal to the expected sum.
    FF expected_sum = 0;
    for (uint32_t& read_idx : read_indices) {
        expected_sum += return_data_values[read_idx];
    }
    builder.create_add_gate(
        { result_witness_indices[0], result_witness_indices[1], builder.zero_idx, 1, 1, 0, -expected_sum });

    // Construct and verify Honk proof
    bool result = construct_and_verify_proof(builder);
    EXPECT_TRUE(result);
}

/**
 * @brief Test reads from calldata and return data in the same circuit
 *
 */
TEST_F(DataBusTests, CallDataAndReturnData)
{
    // Construct a circuit and add some ecc op gates and arithmetic gates
    auto builder = construct_test_builder();

    // Add some values to calldata
    std::vector<FF> calldata_values = { 5, 27, 11 };
    for (auto& val : calldata_values) {
        builder.add_public_calldata(val);
    }

    // Add some values to return_data
    std::vector<FF> return_data_values = { 7, 10 };
    for (auto& val : return_data_values) {
        builder.add_public_return_data(val);
    }

    // Make some aribitrary reads from calldata and return data
    uint32_t read_idx = 2;
    uint32_t read_idx_witness_idx = builder.add_variable(read_idx);
    builder.read_calldata(read_idx_witness_idx);

    read_idx = 0;
    read_idx_witness_idx = builder.add_variable(read_idx);
    builder.read_return_data(read_idx_witness_idx);

    // Construct and verify Honk proof
    bool result = construct_and_verify_proof(builder);
    EXPECT_TRUE(result);
}

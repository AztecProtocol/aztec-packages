#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/instance_inspector.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

using namespace proof_system::honk;

namespace test_ultra_honk_composer {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

class DataBusComposerTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;
    using CommitmentKey = pcs::CommitmentKey<Curve>;

    /**
     * @brief Generate a simple test circuit that includes calldata lookup gates
     *
     * @param builder
     */
    void generate_test_circuit(auto& builder)
    {
        // Add some ecc op gates and arithmetic gates
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(builder);
        GoblinMockCircuits::construct_arithmetic_circuit(builder);
    }
};

/**
 * @brief Test proof construction/verification for a circuit with calldata lookup gates
 * gates
 * @note We simulate op queue interactions with a previous circuit so the actual circuit under test utilizes an op queue
 * with non-empty 'previous' data. This avoid complications with zero-commitments etc.
 *
 */
TEST_F(DataBusComposerTests, CallDataRead)
{
    auto op_queue = std::make_shared<proof_system::ECCOpQueue>();

    // Add mock data to op queue to simulate interaction with a previous circuit
    op_queue->populate_with_mock_initital_data();

    auto builder = proof_system::GoblinUltraCircuitBuilder{ op_queue };

    // Create a general test circuit
    generate_test_circuit(builder);

    // Add some values to calldata and store the corresponding witness index
    std::array<FF, 5> calldata_values = { 7, 10, 3, 12, 1 };
    std::vector<uint32_t> calldata_value_indices;
    for (auto& val : calldata_values) {
        calldata_value_indices.emplace_back(builder.add_public_calldata(val));
    }

    // Add some read index values and store the corresponding witness index
    std::array<uint32_t, 2> read_index_values = { 1, 4 };
    std::vector<uint32_t> read_indices;
    for (auto& val : read_index_values) {
        read_indices.emplace_back(builder.add_variable(val));
    }

    // Create some calldata lookup gates
    for (size_t i = 0; i < read_indices.size(); ++i) {
        uint32_t read_idx = read_indices[i];
        uint32_t value_idx = calldata_value_indices[read_index_values[i]];
        builder.create_calldata_lookup_gate({ read_idx, value_idx });
    }

    auto composer = GoblinUltraComposer();

    // Construct and verify Honk proof
    auto instance = composer.create_instance(builder);
    // For debugging, use "instance_inspector::print_databus_info(instance)"
    auto prover = composer.create_prover(instance);
    auto verifier = composer.create_verifier(instance);
    auto proof = prover.construct_proof();
    bool verified = verifier.verify_proof(proof);
    EXPECT_TRUE(verified);
}

} // namespace test_ultra_honk_composer

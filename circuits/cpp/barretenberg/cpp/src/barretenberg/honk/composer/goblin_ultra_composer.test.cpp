#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "barretenberg/honk/proof_system/ultra_prover.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

using namespace proof_system::honk;

namespace test_ultra_honk_composer {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

class GoblinUltraHonkComposerTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using CommitmentKey = pcs::CommitmentKey<Curve>;

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    void generate_test_circuit(auto& builder)
    {
        // Add some ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = g1::affine_one * FF::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_mul_accum(point, scalar);
        }
        builder.queue_ecc_eq();

        // Add some conventional gates that utilize public inputs
        for (size_t i = 0; i < 10; ++i) {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = FF::random_element();
            FF d = a + b + c;
            uint32_t a_idx = builder.add_public_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }
    }

    /**
     * @brief Populate ECC op queue with mock data as stand in for "previous circuit" in tests
     * @details We currently cannot support Goblin proofs (specifically, transcript aggregation) if there is not
     * existing data in the ECC op queue (since this leads to zero-commitment issues). This method populates the op
     * queue with mock data so that the prover of an arbitrary 'first' circuit can behave as if it were not the prover
     * over the first circuit in the stack.
     *
     * @param op_queue
     */
    static void populate_ecc_op_queue_with_mock_data(std::shared_ptr<ECCOpQueue>& op_queue)
    {
        // Add a single row of data to the op queue and commit to each column as [1] * FF(data)
        std::array<Commitment, 4> mock_op_queue_commitments;
        size_t idx = 0;
        for (auto& entry : op_queue->ultra_ops) {
            auto mock_data = FF::random_element();
            entry.emplace_back(mock_data);
            mock_op_queue_commitments[idx++] = Commitment::one() * mock_data;
        }
        // Set some internal data based on the size of the op queue data
        op_queue->set_size_data();
        // Add the commitments to the op queue data for use by the next circuit
        op_queue->set_commitment_data(mock_op_queue_commitments);
    }
};

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 * @note We simulate op queue interactions with a previous circuit so the actual circuit under test utilizes an op queue
 * with non-empty 'previous' data. This avoid complications with zero-commitments etc.
 *
 */
TEST_F(GoblinUltraHonkComposerTests, SingleCircuit)
{
    auto op_queue = std::make_shared<ECCOpQueue>();

    // Add mock data to op queue to simulate interaction with a previous circuit
    populate_ecc_op_queue_with_mock_data(op_queue);

    auto builder = GoblinUltraCircuitBuilder(op_queue);

    generate_test_circuit(builder);

    auto composer = GoblinUltraComposer();
    auto prover = composer.create_prover(builder);
    auto verifier = composer.create_verifier(builder);
    auto proof = prover.construct_proof();
    bool verified = verifier.verify_proof(proof);
    EXPECT_EQ(verified, true);
}

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 *
 */
TEST_F(GoblinUltraHonkComposerTests, MultipleCircuits)
{
    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<ECCOpQueue>();

    // Add mock data to op queue to simulate interaction with a previous circuit
    populate_ecc_op_queue_with_mock_data(op_queue);

    // Track the expected size of the op queue transcript
    size_t expected_op_queue_size = 1; // +1 from mock data

    // Construct first circuit and its proof
    {
        auto builder = GoblinUltraCircuitBuilder(op_queue);

        generate_test_circuit(builder);
        expected_op_queue_size += builder.num_ecc_op_gates;

        auto composer = GoblinUltraComposer();
        auto prover = composer.create_prover(builder);
        auto verifier = composer.create_verifier(builder);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);
        EXPECT_EQ(verified, true);
    }

    // Construct second circuit
    {
        auto builder = GoblinUltraCircuitBuilder(op_queue);

        generate_test_circuit(builder);
        expected_op_queue_size += builder.num_ecc_op_gates;

        auto composer = GoblinUltraComposer();
        auto prover = composer.create_prover(builder);
        auto verifier = composer.create_verifier(builder);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);
        EXPECT_EQ(verified, true);
    }

    // Check that the op queue contains the expected number of entries
    size_t aggregate_op_queue_size = op_queue->current_ultra_ops_size;
    EXPECT_EQ(expected_op_queue_size, aggregate_op_queue_size);

    // Compute the commitments to the aggregate op queue directly and check that they match those that were computed
    // iteratively during transcript aggregation by the provers and stored in the op queue.
    auto crs_factory = std::make_shared<barretenberg::srs::factories::FileCrsFactory<Curve>>("../srs_db/ignition");
    auto commitment_key = std::make_shared<CommitmentKey>(aggregate_op_queue_size, crs_factory);
    size_t idx = 0;
    for (auto& result : op_queue->ultra_ops_commitments) {
        auto expected = commitment_key->commit(op_queue->ultra_ops[idx++]);
        EXPECT_EQ(result, expected);
    }
}

} // namespace test_ultra_honk_composer

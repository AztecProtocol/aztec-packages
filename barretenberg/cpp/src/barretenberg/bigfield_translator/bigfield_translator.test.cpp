// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>

using namespace bb;

class BigfieldTranslatorTest : public ::testing::Test {
  protected:
    using Builder = MegaCircuitBuilder;
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper to create a populated op queue for testing (padded to OP_QUEUE_SIZE)
    static std::shared_ptr<ECCOpQueue> create_test_op_queue(size_t num_ops)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        // Create a simple circuit builder to populate the op queue
        Builder builder;
        builder.op_queue = op_queue;

        // Add some random ECC operations
        for (size_t i = 0; i < num_ops; i++) {
            auto point = curve::BN254::Group::affine_one * Fr::random_element();
            auto scalar = Fr::random_element();
            builder.queue_ecc_mul_accum(point, scalar);
        }

        // Pad to OP_QUEUE_SIZE (power of 2) as the translator expects
        op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

        return op_queue;
    }
};

/**
 * @brief Test native accumulator computation
 */
TEST_F(BigfieldTranslatorTest, NativeAccumulatorComputation)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x = Fq::random_element();
    Fq v = Fq::random_element();

    Fq result = BigfieldTranslator::compute_accumulator_native(x, v, op_queue);

    // Just verify it runs without error and produces non-zero result
    EXPECT_NE(result, Fq(0));
}

/**
 * @brief Test circuit accumulator matches native
 *
 * Uses populate_ecc_op_block to fill the ecc_op block from the op_queue,
 * which is the expected flow in Goblin integration.
 */
TEST_F(BigfieldTranslatorTest, CircuitMatchesNative)
{
    constexpr size_t NUM_OPS = 10;

    // Create and populate the op_queue (this mimics the real flow where op_queue
    // is populated by previous circuits and then passed to the translator)
    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Compute native result
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    // Create a fresh builder for the BigfieldTranslator circuit
    Builder builder;

    // Populate ecc_op block from the op_queue - this creates witnesses and fills blocks.ecc_op
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    EXPECT_EQ(builder.blocks.ecc_op.size(), op_queue->get_ultra_ops().size() * 2);

    // Create circuit witnesses for challenges
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Compute the accumulator in-circuit using ecc_op block witnesses
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

    // Get the native value from the circuit element
    Fq result_native = Fq(result.get_value().lo);

    EXPECT_EQ(result_native, expected);

    // Verify circuit is valid
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Test that witnesses are properly linked to ecc_op block
 *
 * This test verifies that the bigfield translator uses the same witness indices
 * as the ecc_op block, which is required for proper integration with the merge protocol.
 */
TEST_F(BigfieldTranslatorTest, WitnessesLinkedToEccOpBlock)
{
    constexpr size_t NUM_OPS = 10;

    // Create and populate the op_queue
    auto op_queue = create_test_op_queue(NUM_OPS);

    // Create builder and populate ecc_op block from op_queue
    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    // Verify the ecc_op block has the expected size (2 rows per UltraOp)
    EXPECT_EQ(builder.blocks.ecc_op.size(), op_queue->get_ultra_ops().size() * 2);

    // Verify that the witness values in ecc_op block match the op_queue data
    auto& ultra_ops = op_queue->get_ultra_ops();
    auto& ecc_op_wires = builder.blocks.ecc_op.wires;

    for (size_t i = 0; i < ultra_ops.size(); i++) {
        size_t row_idx = 2 * i;
        const auto& ultra_op = ultra_ops[i];

        // Check x_lo witness value matches
        uint32_t x_lo_idx = ecc_op_wires[1][row_idx];
        Fr x_lo_value = builder.get_variable(x_lo_idx);
        EXPECT_EQ(x_lo_value, ultra_op.x_lo) << "x_lo mismatch at row " << i;

        // Check z_1 witness value matches
        uint32_t z1_idx = ecc_op_wires[2][row_idx + 1];
        Fr z1_value = builder.get_variable(z1_idx);
        EXPECT_EQ(z1_value, ultra_op.z_1) << "z_1 mismatch at row " << i;
    }

    // Create the evaluation and batching challenges
    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Compute native result for comparison
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    // Create circuit witnesses for challenges
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Compute the accumulator in-circuit using ecc_op block witnesses
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

    // Verify the result matches
    Fq result_native = Fq(result.get_value().lo);
    EXPECT_EQ(result_native, expected) << "Circuit result doesn't match native";

    // Check circuit validity
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Test that the BigfieldTranslator circuit can be proven and verified using MegaHonk
 *
 * This is the key test - since BigfieldTranslator produces a MegaCircuitBuilder circuit,
 * we can use the standard MegaHonk prover/verifier to create and verify proofs.
 */
TEST_F(BigfieldTranslatorTest, MegaHonkProveAndVerify)
{
    constexpr size_t NUM_OPS = 10;

    // Create and populate the op_queue
    auto op_queue = create_test_op_queue(NUM_OPS);

    // Create builder and populate ecc_op block from op_queue
    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    // Create the evaluation and batching challenges (in real flow, these come from ECCVM)
    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create circuit witnesses for challenges
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Compute the accumulator in-circuit
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

    // Verify circuit correctness matches native
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);
    Fq result_native = Fq(result.get_value().lo);
    EXPECT_EQ(result_native, expected);

    // Add default public inputs required by DefaultIO
    stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

    // Prove and verify using MegaFlavor
    using Flavor = MegaFlavor;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    Verifier verifier(verification_key);
    bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

    EXPECT_TRUE(verified) << "MegaFlavor proof verification failed";
}

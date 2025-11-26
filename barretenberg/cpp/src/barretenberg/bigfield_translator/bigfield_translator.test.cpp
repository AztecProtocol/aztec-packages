// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/srs/global_crs.hpp"
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
    auto& ultra_ops = op_queue->get_ultra_ops();

    info("Op queue has ", ultra_ops.size(), " rows");

    Fq x = Fq::random_element();
    Fq v = Fq::random_element();

    Fq result = BigfieldTranslator::compute_accumulator_native(x, v, op_queue);

    info("Native accumulator result computed");
    info("Result (first 64 bits): ", static_cast<uint64_t>(uint256_t(result)));

    // Just verify it runs without error and produces non-zero result
    EXPECT_NE(result, Fq(0));
}

/**
 * @brief Test circuit accumulator matches native
 */
TEST_F(BigfieldTranslatorTest, CircuitMatchesNative)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Compute native result
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    // Compute circuit result
    Builder builder;
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, op_queue);

    // Get the native value from the circuit element
    Fq result_native = Fq(result.get_value().lo);

    info("Expected: ", expected);
    info("Got:      ", result_native);

    EXPECT_EQ(result_native, expected);

    // Verify circuit is valid
    info("Circuit has ", builder.num_gates(), " gates");
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Measure gate count for realistic op queue size
 */
TEST_F(BigfieldTranslatorTest, GateCountMeasurement)
{
    // Create op queue with 4096 rows (standard size)
    constexpr size_t NUM_OPS = 100;

    auto op_queue = create_test_op_queue(NUM_OPS);
    auto& ultra_ops = op_queue->get_ultra_ops();

    info("Op queue has ", ultra_ops.size(), " rows");

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    Builder builder;
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    size_t gates_before = builder.num_gates();

    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, op_queue);
    (void)result;

    size_t gates_after = builder.num_gates();
    size_t total_gates = gates_after - gates_before;

    info("=== BigfieldTranslator Gate Count ===");
    info("Number of rows:       ", ultra_ops.size());
    info("Total gates:          ", total_gates, " (2^", std::log2(total_gates), ")");
    info("Current Translator:   131,072 (2^17)");
    info("");

    // Gate count breakdown:
    // - Limb decomposition: ~82K gates (splitting 136-bit limbs into 68-bit bigfield limbs)
    // - Computation: ~55K gates (powers of x, batch multipliers, column sums)
    // Total: ~137K gates, similar to current Translator
    // Main benefit is simpler code and LightZK flavor (fewer polynomials)
}

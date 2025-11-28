// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/light_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>
#ifdef __linux__
#include <fstream>
#include <malloc.h>
#include <string>

// Get current RSS (not peak) from /proc/self/statm
inline size_t get_current_rss_mib()
{
    std::ifstream statm("/proc/self/statm");
    size_t size, resident;
    statm >> size >> resident;
    // resident is in pages, typically 4KB each
    return (resident * 4096) / (1024 * 1024);
}
#define LOG_CURRENT_MEM(msg) info(msg, " [current RSS: ", get_current_rss_mib(), " MiB]")
#else
#define LOG_CURRENT_MEM(msg) info(msg)
#endif

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

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Compute native result
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    // Create a fresh builder for the BigfieldTranslator circuit
    // (like TranslatorCircuitBuilder, this is a standalone circuit)
    Builder builder;

    // Populate ecc_op block from the op_queue - this creates witnesses and fills blocks.ecc_op
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    info("ecc_op block has ", builder.blocks.ecc_op.size(), " rows");
    EXPECT_EQ(builder.blocks.ecc_op.size(), op_queue->get_ultra_ops().size() * 2);

    // Create circuit witnesses for challenges
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Compute the accumulator in-circuit using ecc_op block witnesses
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

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

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

    // Create builder and populate ecc_op block
    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    size_t gates_before = builder.num_gates();

    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);
    (void)result;

    size_t gates_after = builder.num_gates();
    size_t total_gates = gates_after - gates_before;

    info("=== BigfieldTranslator Gate Count ===");
    info("Number of rows:       ", op_queue->get_ultra_ops().size());
    info("Total gates:          ", total_gates, " (2^", std::log2(total_gates), ")");
    info("Current Translator:   131,072 (2^17)");

    // Debug: check what happens at finalization
    info("");
    info("Before finalization:  ", builder.num_gates());
    info("Cached NNF mults:     ", builder.cached_partial_non_native_field_multiplications.size());

    // Count block sizes before finalization
    info("Block sizes before finalization:");
    info("  arithmetic:   ", builder.blocks.arithmetic.size());
    info("  delta_range:  ", builder.blocks.delta_range.size());
    info("  elliptic:     ", builder.blocks.elliptic.size());
    info("  nnf:          ", builder.blocks.nnf.size());
    info("  ecc_op:       ", builder.blocks.ecc_op.size());

    // We need to manually trigger finalization to see block sizes after
    // But get_num_finalized_gates_inefficient calls finalize internally
    // Let's just compute the expected additions
    size_t expected_nnf_from_cached = builder.cached_partial_non_native_field_multiplications.size() * 4;
    info("Expected NNF gates from cached mults: ", expected_nnf_from_cached);

    size_t finalized = builder.get_num_finalized_gates_inefficient();
    info("After finalization:   ", finalized);
    info("Finalization added:   ", finalized - builder.num_gates());
    info("Range lists count:    ", builder.range_lists.size());
    size_t total_range_vars = 0;
    for (const auto& [range, list] : builder.range_lists) {
        info("  Range ", range, ": ", list.variable_indices.size(), " variables");
        total_range_vars += list.variable_indices.size();
    }
    info("Total range vars:     ", total_range_vars);
    info("Expected delta_range gates from sorted lists: ", total_range_vars / 4);
    info("");

    // Gate count breakdown:
    // - Limb decomposition: ~82K gates (splitting 136-bit limbs into 68-bit bigfield limbs)
    // - Computation: ~55K gates (powers of x, batch multipliers, column sums)
    // Total: ~137K gates, similar to current Translator
    // Main benefit is simpler code and LightZK flavor (fewer polynomials)
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

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");
    info("ecc_op block has ", builder.blocks.ecc_op.size(), " rows");

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

    info("Circuit has ", builder.num_gates(), " gates");

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

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

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
    {
        info("Circuit has ", builder.get_num_finalized_gates_inefficient(), " gates");
    }

    // Now prove and verify using Mega (non-ZK for simplicity)
    using Flavor = MegaFlavor;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    // Create prover instance and verification key
    info("Memory before MegaFlavor prover instance creation");
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    info("Memory after MegaFlavor prover instance creation");
    info("Dyadic size: ", prover_instance->dyadic_size(), " (log2 = ", prover_instance->log_dyadic_size(), ")");
    info("Trace active range size: ", prover_instance->trace_active_range_size());
    info("HasZK: ", Flavor::HasZK);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    info("Creating proof...");
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    info("Proof size: ", proof.size(), " elements");

    // Verify the proof
    info("Verifying proof...");
    Verifier verifier(verification_key);
    bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

    EXPECT_TRUE(verified) << "MegaFlavor proof verification failed";
    info("Proof verified successfully!");
}

/**
 * @brief Test MegaZKFlavor for fair comparison with LightZKFlavor (both have HasZK=true)
 */
TEST_F(BigfieldTranslatorTest, MegaZKProveAndVerify)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);
    Fq result_native = Fq(result.get_value().lo);
    EXPECT_EQ(result_native, expected);

    stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

    info("Circuit has ", builder.get_num_finalized_gates_inefficient(), " gates");

    using Flavor = MegaZKFlavor;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    info("Memory before MegaZKFlavor prover instance creation");
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    info("Memory after MegaZKFlavor prover instance creation");
    info("Dyadic size: ", prover_instance->dyadic_size(), " (log2 = ", prover_instance->log_dyadic_size(), ")");
    info("Trace active range size: ", prover_instance->trace_active_range_size());
    info("HasZK: ", Flavor::HasZK);
    info("NUM_WITNESS_ENTITIES: ", Flavor::NUM_WITNESS_ENTITIES);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    info("Creating MegaZK proof...");
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    info("MegaZK Proof size: ", proof.size(), " elements");

    info("Verifying MegaZK proof...");
    Verifier verifier(verification_key);
    bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

    EXPECT_TRUE(verified) << "MegaZKFlavor proof verification failed";
    info("MegaZK Proof verified successfully!");
}

/**
 * @brief Test that the BigfieldTranslator circuit can be proven and verified using LightZKFlavor
 *
 * This is the key test for the new minimal flavor - LightZKFlavor uses MegaCircuitBuilder
 * but with significantly fewer polynomials (no lookups, databus, poseidon2, memory relations).
 */
TEST_F(BigfieldTranslatorTest, LightZKProveAndVerify)
{
    constexpr size_t NUM_OPS = 10;

    // Create and populate the op_queue
    auto op_queue = create_test_op_queue(NUM_OPS);

    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

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

    info("Circuit has ", builder.get_num_finalized_gates_inefficient(), " finalized gates");

    // Now prove and verify using LightZKFlavor (minimal ZK flavor for BigfieldTranslator)
    using Flavor = LightZKFlavor;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    // Create prover instance and verification key
    info("Memory before LightZK prover instance creation");
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    info("Memory after LightZK prover instance creation");
    info("Dyadic size: ", prover_instance->dyadic_size(), " (log2 = ", prover_instance->log_dyadic_size(), ")");
    info("Trace active range size: ", prover_instance->trace_active_range_size());
    info("VIRTUAL_LOG_N: ", Flavor::VIRTUAL_LOG_N);
    info("USE_PADDING: ", Flavor::USE_PADDING);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    // First check that relations are satisfied
    info("Checking relation correctness...");
    EXPECT_TRUE(CircuitChecker::check(builder)) << "Circuit check failed before proving";

    // Debug: check entity counts
    info("NUM_PRECOMPUTED_ENTITIES: ", Flavor::NUM_PRECOMPUTED_ENTITIES);
    info("NUM_WITNESS_ENTITIES: ", Flavor::NUM_WITNESS_ENTITIES);
    info("NUM_MASKING_ENTITIES: ", Flavor::NUM_MASKING_ENTITIES);
    info("NUM_SHIFTED_ENTITIES: ", Flavor::NUM_SHIFTED_ENTITIES);
    info("NUM_UNSHIFTED_ENTITIES: ", Flavor::NUM_UNSHIFTED_ENTITIES);
    info("NUM_ALL_ENTITIES: ", Flavor::NUM_ALL_ENTITIES);
    info("get_to_be_shifted size: ", prover_instance->polynomials.get_to_be_shifted().size());
    info("get_shifted size: ", prover_instance->polynomials.get_shifted().size());
    info("get_unshifted size: ", prover_instance->polynomials.get_unshifted().size());
    info("get_all size: ", prover_instance->polynomials.get_all().size());

    info("Creating LightZK proof...");
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    info("LightZK Proof size: ", proof.size(), " elements");

    // Verify the proof
    info("Verifying LightZK proof...");
    Verifier verifier(verification_key);
    bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

    EXPECT_TRUE(verified) << "LightZK proof verification failed";
    info("LightZK proof verified successfully!");
}

/**
 * @brief Parameterized test to analyze gate count with different batch sizes
 *
 * This test helps determine the optimal batch size by measuring:
 * 1. Sequential powers computation (BATCH_SIZE multiplications)
 * 2. Batch multipliers computation (log2(num_rows/BATCH_SIZE) squarings + binary exp)
 * 3. Column sum computation (mult_madd calls)
 */
TEST_F(BigfieldTranslatorTest, BatchSizeAnalysis)
{
    // Test with 4096 rows (standard OP_QUEUE_SIZE)
    constexpr size_t NUM_OPS = 100;

    auto op_queue = create_test_op_queue(NUM_OPS);
    const size_t num_rows = op_queue->get_ultra_ops().size();
    info("Op queue has ", num_rows, " rows");

    // Test different batch sizes (must be powers of 2 and divide num_rows)
    std::vector<size_t> batch_sizes = { 32, 64, 128, 256, 512, 1024 };

    info("\n=== Batch Size Analysis ===");
    info("num_rows = ", num_rows, "\n");

    for (size_t batch_size : batch_sizes) {
        if (batch_size > num_rows) {
            continue;
        }

        // Create fresh builder
        Builder builder;
        BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

        Fq x_native = Fq::random_element();
        Fq v_native = Fq::random_element();

        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

        size_t gates_before = builder.num_gates();

        // ===== Step 1: Sequential powers (x^0 to x^{batch_size-1}) =====
        std::vector<fq_ct> x_powers_base(batch_size);
        x_powers_base[0] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(1));
        x_powers_base[1] = x;
        for (size_t i = 2; i < batch_size; i++) {
            x_powers_base[i] = x_powers_base[i - 1] * x;
        }
        size_t gates_after_sequential = builder.num_gates();
        size_t sequential_gates = gates_after_sequential - gates_before;

        // ===== Step 2: Batch multipliers via binary exponentiation =====
        const size_t num_batches = num_rows / batch_size;
        const size_t log_num_batches = numeric::get_msb(num_batches);

        std::vector<fq_ct> batch_multipliers(num_batches);
        batch_multipliers[num_batches - 1] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(1));

        if (num_batches > 1) {
            fq_ct x_batch = x_powers_base[batch_size - 1] * x; // x^batch_size

            std::vector<fq_ct> powers_of_two(log_num_batches);
            powers_of_two[0] = x_batch;
            for (size_t i = 1; i < log_num_batches; i++) {
                powers_of_two[i] = powers_of_two[i - 1].sqr();
            }

            for (size_t i = 0; i < num_batches - 1; i++) {
                size_t exponent = num_batches - 1 - i;
                fq_ct mult = fq_ct::create_from_u512_as_witness(&builder, uint512_t(1));
                for (size_t bit = 0; bit < log_num_batches; bit++) {
                    if ((exponent >> bit) & 1) {
                        mult = mult * powers_of_two[bit];
                    }
                }
                batch_multipliers[i] = mult;
            }
        }
        size_t gates_after_batch_mult = builder.num_gates();
        size_t batch_mult_gates = gates_after_batch_mult - gates_after_sequential;

        // ===== Step 3: Create column data from ecc_op block =====
        using field_ct = stdlib::field_t<Builder>;
        auto& ecc_op_wires = builder.blocks.ecc_op.wires;

        std::vector<fq_ct> ops(num_rows);
        std::vector<fq_ct> pxs(num_rows);
        std::vector<fq_ct> pys(num_rows);
        std::vector<fq_ct> z1s(num_rows);
        std::vector<fq_ct> z2s(num_rows);

        for (size_t i = 0; i < num_rows; i++) {
            size_t row_idx = 2 * i;
            uint32_t op_idx = ecc_op_wires[0][row_idx];
            uint32_t x_lo_idx = ecc_op_wires[1][row_idx];
            uint32_t x_hi_idx = ecc_op_wires[2][row_idx];
            uint32_t y_lo_idx = ecc_op_wires[3][row_idx];
            uint32_t y_hi_idx = ecc_op_wires[1][row_idx + 1];
            uint32_t z1_idx = ecc_op_wires[2][row_idx + 1];
            uint32_t z2_idx = ecc_op_wires[3][row_idx + 1];

            field_ct op_field = field_ct::from_witness_index(&builder, op_idx);
            field_ct x_lo = field_ct::from_witness_index(&builder, x_lo_idx);
            field_ct x_hi = field_ct::from_witness_index(&builder, x_hi_idx);
            field_ct y_lo = field_ct::from_witness_index(&builder, y_lo_idx);
            field_ct y_hi = field_ct::from_witness_index(&builder, y_hi_idx);
            field_ct z1_field = field_ct::from_witness_index(&builder, z1_idx);
            field_ct z2_field = field_ct::from_witness_index(&builder, z2_idx);

            ops[i] = fq_ct::create_from_single_limb(op_field, 4);
            pxs[i] = fq_ct(x_lo, x_hi);
            pys[i] = fq_ct(y_lo, y_hi);
            z1s[i] = fq_ct::create_from_single_limb(z1_field, 128);
            z2s[i] = fq_ct::create_from_single_limb(z2_field, 128);
        }
        size_t gates_after_columns = builder.num_gates();
        size_t column_prep_gates = gates_after_columns - gates_after_batch_mult;

        // ===== Step 4: Compute column sums using batched mult_madd =====
        auto compute_column_sum_with_batch = [&](const std::vector<fq_ct>& column) {
            fq_ct total_sum = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));
            const size_t num_batches_local = (num_rows + batch_size - 1) / batch_size;

            for (size_t batch = 0; batch < num_batches_local; batch++) {
                const size_t batch_start = batch * batch_size;
                const size_t batch_end = std::min(batch_start + batch_size, num_rows);
                const size_t actual_batch_size = batch_end - batch_start;

                std::vector<fq_ct> left(actual_batch_size);
                std::vector<fq_ct> right(actual_batch_size);

                for (size_t j = 0; j < actual_batch_size; j++) {
                    left[j] = column[batch_start + j];
                    right[j] = x_powers_base[batch_size - 1 - j];
                }

                fq_ct batch_sum = fq_ct::mult_madd(left, right, {});
                total_sum = total_sum + batch_sum * batch_multipliers[batch];
            }
            return total_sum;
        };

        // Powers of v
        fq_ct v_ct = v;
        fq_ct v2 = v_ct.sqr();
        fq_ct v3 = v2 * v_ct;
        fq_ct v4 = v3 * v_ct;

        size_t gates_before_sums = builder.num_gates();

        fq_ct op_sum = compute_column_sum_with_batch(ops);
        fq_ct px_sum = compute_column_sum_with_batch(pxs);
        fq_ct py_sum = compute_column_sum_with_batch(pys);
        fq_ct z1_sum = compute_column_sum_with_batch(z1s);
        fq_ct z2_sum = compute_column_sum_with_batch(z2s);

        size_t gates_after_sums = builder.num_gates();
        size_t column_sum_gates = gates_after_sums - gates_before_sums;

        // Final combination
        fq_ct result = fq_ct::mult_madd({ px_sum, py_sum, z1_sum, z2_sum }, { v_ct, v2, v3, v4 }, { op_sum });
        (void)result;

        size_t gates_final = builder.num_gates();
        size_t final_combine_gates = gates_final - gates_after_sums;

        size_t total_gates = gates_final - gates_before;

        // Output results
        info("BATCH_SIZE = ", batch_size, ":");
        info("  Sequential powers (x^0..x^", batch_size - 1, "): ", sequential_gates);
        info("  Batch multipliers (", num_batches, " batches, log=", log_num_batches, "): ", batch_mult_gates);
        info("  Column preparation: ", column_prep_gates);
        info("  Column sums (5 cols x ", num_batches, " mult_madds): ", column_sum_gates);
        info("  Final combination: ", final_combine_gates);
        info("  TOTAL before finalization: ", total_gates);

        size_t finalized = builder.get_num_finalized_gates_inefficient();
        info("  TOTAL after finalization: ", finalized);
        info("  Dyadic size: 2^", std::ceil(std::log2(finalized)));
        info("");
    }
}

/**
 * @brief Analyze the polynomial structure for LightZK flavor across different op counts
 *
 * This test helps understand how non-zero value positions depend on the number of ops.
 * The structure is expected to be [ops, many 0 for padding, hiding ops].
 */
TEST_F(BigfieldTranslatorTest, PolynomialStructureAnalysis)
{
    // Test with different numbers of ops to find the relationship
    std::vector<size_t> op_counts = { 10, 50, 100, 500, 1000 };

    using Flavor = LightZKFlavor;
    using ProverInstance = ProverInstance_<Flavor>;

    info("=== Polynomial Structure Analysis (varying op counts) ===\n");
    info("op_count | ecc_op_rows | dyadic_size | trace_size | w_l_last_nonzero | q_m_last_nonzero | "
         "qArith_last_nonzero");
    info("---------|-------------|-------------|------------|------------------|------------------|-------------------"
         "-");

    for (size_t num_ops : op_counts) {
        auto op_queue = create_test_op_queue(num_ops);
        const size_t ecc_op_rows = op_queue->get_ultra_ops().size();

        Builder builder;
        BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

        Fq x_native = Fq::random_element();
        Fq v_native = Fq::random_element();

        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

        fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);
        (void)result;

        stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

        auto prover_instance = std::make_shared<ProverInstance>(builder);

        const size_t dyadic_size = prover_instance->dyadic_size();
        const size_t trace_size = prover_instance->trace_active_range_size();

        // Find last non-zero in w_l
        const auto& w_l = prover_instance->polynomials.w_l;
        size_t w_l_last_nonzero = 0;
        for (size_t i = 0; i < w_l.end_index(); i++) {
            if (!w_l[i].is_zero()) {
                w_l_last_nonzero = i;
            }
        }

        // Find last non-zero in q_m
        const auto& q_m = prover_instance->polynomials.q_m;
        size_t q_m_last_nonzero = 0;
        for (size_t i = 0; i < q_m.end_index(); i++) {
            if (!q_m[i].is_zero()) {
                q_m_last_nonzero = i;
            }
        }

        // Find last non-zero in q_arith
        const auto& q_arith = prover_instance->polynomials.q_arith;
        size_t q_arith_last_nonzero = 0;
        for (size_t i = 0; i < q_arith.end_index(); i++) {
            if (!q_arith[i].is_zero()) {
                q_arith_last_nonzero = i;
            }
        }

        info(num_ops,
             "     | ",
             ecc_op_rows,
             "       | ",
             dyadic_size,
             "      | ",
             trace_size,
             "     | ",
             w_l_last_nonzero,
             "            | ",
             q_m_last_nonzero,
             "            | ",
             q_arith_last_nonzero);
    }

    // Now do detailed analysis for one case to understand the structure
    info("\n=== Detailed Analysis for 100 ops ===\n");

    auto op_queue = create_test_op_queue(100);
    const size_t ecc_op_rows = op_queue->get_ultra_ops().size();

    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    // Before compute_accumulator - capture block sizes (trace_offset not available before finalization)
    info("Block sizes BEFORE compute_accumulator:");
    info("  ecc_op:       ", builder.blocks.ecc_op.size());
    info("  arithmetic:   ", builder.blocks.arithmetic.size());
    info("  delta_range:  ", builder.blocks.delta_range.size());
    info("  elliptic:     ", builder.blocks.elliptic.size());
    info("  nnf:          ", builder.blocks.nnf.size());

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);
    (void)result;

    stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

    info("\nBlock sizes AFTER compute_accumulator and add_default:");
    info("  ecc_op:       ", builder.blocks.ecc_op.size());
    info("  arithmetic:   ", builder.blocks.arithmetic.size());
    info("  delta_range:  ", builder.blocks.delta_range.size());
    info("  elliptic:     ", builder.blocks.elliptic.size());
    info("  nnf:          ", builder.blocks.nnf.size());
    info("  cached_partial_non_native_field_multiplications: ",
         builder.cached_partial_non_native_field_multiplications.size());

    auto prover_instance = std::make_shared<ProverInstance>(builder);

    const size_t dyadic_size = prover_instance->dyadic_size();
    const size_t trace_size = prover_instance->trace_active_range_size();

    info("\nProver instance:");
    info("  Dyadic size: ", dyadic_size, " (log2: ", prover_instance->log_dyadic_size(), ")");
    info("  Trace active range: ", trace_size);
    info("  ecc_op rows in op_queue: ", ecc_op_rows);

    // Analyze each gate selector to find their ranges
    info("\nGate selector ranges (only non-zero regions):");

    auto analyze_selector = [&](const auto& selector, const char* name) {
        size_t first_nonzero = dyadic_size;
        size_t last_nonzero = 0;
        size_t nonzero_count = 0;
        for (size_t i = 0; i < selector.end_index(); i++) {
            if (!selector[i].is_zero()) {
                if (first_nonzero == dyadic_size)
                    first_nonzero = i;
                last_nonzero = i;
                nonzero_count++;
            }
        }
        if (nonzero_count > 0) {
            info("  ",
                 name,
                 ": [",
                 first_nonzero,
                 ", ",
                 last_nonzero,
                 "], count: ",
                 nonzero_count,
                 ", end_index: ",
                 selector.end_index());
        } else {
            info("  ", name, ": (all zero), end_index: ", selector.end_index());
        }
    };

    analyze_selector(prover_instance->polynomials.q_arith, "q_arith");
    analyze_selector(prover_instance->polynomials.q_delta_range, "q_delta_range");
    // q_elliptic removed from LightZKFlavor - EllipticRelation not used
    analyze_selector(prover_instance->polynomials.q_nnf, "q_nnf");

    info("\nNon-gate selector ranges:");
    analyze_selector(prover_instance->polynomials.q_m, "q_m");
    analyze_selector(prover_instance->polynomials.q_l, "q_l");
    analyze_selector(prover_instance->polynomials.q_r, "q_r");
    analyze_selector(prover_instance->polynomials.q_o, "q_o");
    analyze_selector(prover_instance->polynomials.q_4, "q_4");
    analyze_selector(prover_instance->polynomials.q_c, "q_c");

    info("\nWire polynomial ranges:");
    analyze_selector(prover_instance->polynomials.w_l, "w_l");
    analyze_selector(prover_instance->polynomials.w_r, "w_r");
    analyze_selector(prover_instance->polynomials.w_o, "w_o");
    analyze_selector(prover_instance->polynomials.w_4, "w_4");
}

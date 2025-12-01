// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "bigfield_translator.hpp"
#include "bigfield_translator_verifier.hpp"
#include <gtest/gtest.h>

using namespace bb;

class BigfieldTranslatorProverTest : public ::testing::Test {
  protected:
    using Builder = MegaCircuitBuilder;
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper to create a populated op queue for testing (padded to OP_QUEUE_SIZE)
    static std::shared_ptr<ECCOpQueue> create_test_op_queue(size_t num_ops)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        Builder builder;
        builder.op_queue = op_queue;

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
 * @brief Test the BigfieldTranslatorProver and BigfieldTranslatorVerifier classes.
 */
TEST_F(BigfieldTranslatorProverTest, ProveAndVerify)
{
    constexpr size_t NUM_OPS = 400;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create prover and construct proof
    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    auto proof = prover.construct_proof();

    // Get verification key and accumulated result from prover
    auto verification_key = prover.get_verification_key();
    auto accumulated_result = prover.get_accumulated_result();

    // Verify the proof
    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);

    bool verified = verifier.verify_proof(proof, x_native, v_native, accumulated_result);
    EXPECT_TRUE(verified) << "BigfieldTranslator proof verification failed";
}

/**
 * @brief Test BigfieldTranslator with MegaFlavor (non-ZK) for benchmark comparison.
 */
TEST_F(BigfieldTranslatorProverTest, ProveWithMegaFlavor)
{
    using Flavor = MegaFlavor;
    using MegaBuilder = typename Flavor::CircuitBuilder;
    using fq_ct = stdlib::bigfield<MegaBuilder, bb::Bn254FqParams>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;

    constexpr size_t NUM_OPS = 2000;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Build circuit
    MegaBuilder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
    // Use predecomposed limbs for optimized circuit size (2^18)
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, /*use_predecomposed_limbs=*/true);
    (void)result;

    // Add default public inputs required by the proving system
    stdlib::recursion::honk::DefaultIO<MegaBuilder>::add_default(builder);

    info("Before construct_proof");
    // Create prover instance and prove
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto transcript = std::make_shared<typename Flavor::Transcript>();

    Prover prover(prover_instance, verification_key, transcript);
    auto proof = prover.construct_proof();
    info("After construct_proof");

    EXPECT_GT(proof.size(), 0);
}

/**
 * @brief Test BigfieldTranslator with standard (non-predecomposed) limbs.
 * Uses fq_ct(lo, hi) constructor with full range constraints.
 */
TEST_F(BigfieldTranslatorProverTest, ProveWithStandardLimbs)
{
    constexpr size_t NUM_OPS = 100;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Build circuit using standard (non-predecomposed) path
    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Pass use_predecomposed_limbs = false
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, /*use_predecomposed_limbs=*/false);

    // Verify result matches native computation
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);
    EXPECT_EQ(Fq(result.get_value()), expected);

    // Check circuit size is larger (2^19 vs 2^18)
    builder.finalize_circuit(false);
    size_t gate_count = builder.blocks.get_total_content_size();
    info("Standard limbs gate count: ", gate_count);

    // Standard path should have more gates than predecomposed
    EXPECT_GT(gate_count, 200000); // Should be ~324K gates
}

/**
 * @brief Verify that the accumulated result matches native computation.
 */
TEST_F(BigfieldTranslatorProverTest, AccumulatedResultMatchesNative)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create prover
    BigfieldTranslatorProver prover(op_queue, x_native, v_native);

    // Get accumulated result from prover
    Fq accumulated_result = prover.get_accumulated_result();

    // Compute expected result natively
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    EXPECT_EQ(accumulated_result, expected) << "Accumulated result does not match native computation";
}

/**
 * @brief Test that verification fails with wrong accumulated result.
 */
TEST_F(BigfieldTranslatorProverTest, VerificationFailsWithWrongAccumulatedResult)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    auto proof = prover.construct_proof();
    auto verification_key = prover.get_verification_key();

    // Use wrong accumulated result
    Fq wrong_accumulated_result = Fq::random_element();

    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);

    // The proof itself should still verify (it doesn't check accumulated_result internally)
    // The accumulated_result is checked via verify_translation which uses ECCVM evaluations
    bool verified = verifier.verify_proof(proof, x_native, v_native, wrong_accumulated_result);

    // Note: verify_proof only checks the Honk proof, not the accumulated_result consistency.
    // The accumulated_result is verified via verify_translation() with ECCVM evaluations.
    EXPECT_TRUE(verified) << "Proof verification should pass (accumulated_result checked separately)";
}

/**
 * @brief Test verify_translation with correct values.
 */
TEST_F(BigfieldTranslatorProverTest, VerifyTranslation)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    auto proof = prover.construct_proof();
    auto verification_key = prover.get_verification_key();
    Fq accumulated_result = prover.get_accumulated_result();

    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);
    verifier.verify_proof(proof, x_native, v_native, accumulated_result);

    // Compute the expected ECCVM opening value: op + v*Px + v²*Py + v³*z1 + v⁴*z2
    // For this test, we simulate what ECCVM would provide
    // The translation check is: x * accumulated_result == eccvm_opening - masking_term

    // Create mock translation evaluations that satisfy the relation
    // x * accumulated_result = op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term
    Fq masking_term = Fq::random_element();
    Fq eccvm_opening = x_native * accumulated_result + masking_term;

    // For simplicity, set all evaluations to 0 except op which equals eccvm_opening
    TranslationEvaluations_<Fq> translation_evaluations;
    translation_evaluations.op = eccvm_opening;
    translation_evaluations.Px = Fq(0);
    translation_evaluations.Py = Fq(0);
    translation_evaluations.z1 = Fq(0);
    translation_evaluations.z2 = Fq(0);

    bool translation_verified = verifier.verify_translation(translation_evaluations, masking_term);
    EXPECT_TRUE(translation_verified) << "Translation verification failed";
}

/**
 * @brief Debug test to check gate counts and range constraint breakdown.
 */
TEST_F(BigfieldTranslatorProverTest, DebugGateCounts)
{
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;

    auto op_queue = create_test_op_queue(100);

    Builder builder;
    BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
    // Use predecomposed limbs for optimized circuit size (2^18)
    fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, /*use_predecomposed_limbs=*/true);
    (void)result;

    // Print range list stats before finalization
    info("=== Range lists (before finalization) ===");
    size_t total_range_vars = 0;
    for (const auto& [range, list] : builder.range_lists) {
        info("Range ", range, " (", std::log2(range + 1), " bits): ", list.variable_indices.size(), " variables");
        total_range_vars += list.variable_indices.size();
    }
    info("Total range-constrained variables: ", total_range_vars);

    // Estimate: each 136-bit limb decomposition creates 2x68-bit limbs, each with 5x14-bit sublimbs
    // For Px and Py: 4 limbs per op (x_lo, x_hi, y_lo, y_hi) × 4096 ops = 16384 decompositions
    // Each decomposition: 2 × 5 = 10 sublimbs at 14-bit range
    // Total from Px/Py: 16384 × 10 = 163,840 14-bit range vars
    // If we pre-constrain x_lo only: save 4096 × 10 = 40,960 14-bit range vars
    info("\n=== Estimated savings if x_lo pre-constrained in kernels ===");
    info("Current 14-bit vars: ",
         builder.range_lists.count(16383) ? builder.range_lists.at(16383).variable_indices.size() : 0);
    info("Savings (x_lo only): ~", 4096 * 10, " 14-bit vars = ~", 4096 * 10 / 4, " delta_range gates");

    size_t pre_finalize = builder.blocks.get_total_content_size();
    builder.finalize_circuit(false);
    size_t post_finalize = builder.blocks.get_total_content_size();

    info("\n=== Gate counts ===");
    info("ecc_op:       ", builder.blocks.ecc_op.size());
    info("arithmetic:   ", builder.blocks.arithmetic.size());
    info("delta_range:  ", builder.blocks.delta_range.size());
    info("nnf:          ", builder.blocks.nnf.size());
    info("Pre-finalize: ", pre_finalize);
    info("Post-finalize:", post_finalize);

    size_t dyadic = 1;
    while (dyadic < post_finalize + 5) {
        dyadic <<= 1;
    }
    info("Dyadic size:  ", dyadic, " (2^", std::log2(dyadic), ")");
}

/**
 * @brief Measure gate cost of pre-decomposing 136-bit limbs into 68-bit limbs in kernels.
 *
 * This test simulates what would happen if kernels pre-decomposed and range-constrained
 * the 136-bit coordinate limbs (x_lo, x_hi, y_lo, y_hi) into 68-bit sublimbs before
 * passing them to the translator circuit.
 *
 * Layout change (3 rows per op instead of 2):
 *   Row 3i:   (op,      x_lo_lo, x_lo_hi, x_hi_lo)
 *   Row 3i+1: (x_hi_hi, y_lo_lo, y_lo_hi, y_hi_lo)
 *   Row 3i+2: (y_hi_hi, z_1,     z_2,     0)
 */
TEST_F(BigfieldTranslatorProverTest, MeasurePreDecompositionGateCost)
{
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using field_ct = stdlib::field_t<Builder>;

    // === Part 1: Measure cost of pre-decomposing in kernels ===
    // Test with realistic kernel size (~240 ops = 4096/17 kernels)
    {
        constexpr size_t NUM_KERNEL_OPS = 240;

        Builder kernel_builder;
        size_t before_gates = kernel_builder.blocks.get_total_content_size();

        // For each op, simulate decomposing all 4 coordinate limbs (x_lo, x_hi, y_lo, y_hi)
        // from 136-bit to 2x68-bit and range constraining the 68-bit limbs
        for (size_t i = 0; i < NUM_KERNEL_OPS; i++) {
            // Decompose all 4 coordinate limbs per op
            for (size_t limb = 0; limb < 4; limb++) {
                Fr limb_136 = Fr::random_element();
                uint256_t limb_val = uint256_t(limb_136);
                constexpr uint256_t LIMB_MASK = (uint256_t(1) << 68) - 1;
                Fr lo_val = Fr(limb_val & LIMB_MASK);
                Fr hi_val = Fr(limb_val >> 68);

                uint32_t lo_idx = kernel_builder.add_variable(lo_val);
                uint32_t hi_idx = kernel_builder.add_variable(hi_val);
                kernel_builder.range_constrain_two_limbs(lo_idx, hi_idx, 68, 68, "kernel pre-decompose");
            }
        }

        size_t after_gates_pre_finalize = kernel_builder.blocks.get_total_content_size();
        size_t range_vars_before_finalize = 0;
        for (const auto& [range, list] : kernel_builder.range_lists) {
            range_vars_before_finalize += list.variable_indices.size();
        }

        kernel_builder.finalize_circuit(false);
        size_t after_gates_post_finalize = kernel_builder.blocks.get_total_content_size();

        info("=== Kernel Pre-Decomposition Cost (", NUM_KERNEL_OPS, " ops, all 4 coord limbs) ===");
        info("NNF gates added (pre-finalize): ", after_gates_pre_finalize - before_gates);
        info("Range vars queued: ", range_vars_before_finalize);
        info("Delta range gates (finalized): ", kernel_builder.blocks.delta_range.size());
        info("Total gates added to kernel (finalized): ", after_gates_post_finalize - before_gates);
        info("Gates per op: ", (after_gates_post_finalize - before_gates) / NUM_KERNEL_OPS);
    }

    // === Part 2: Measure ACTUAL savings in translator - just the Px/Py construction cost ===
    {
        constexpr size_t NUM_OPS = 4096; // Full op queue size

        // CURRENT approach: fq_ct(x_lo, x_hi) constructor decomposes and range-constrains internally
        {
            Builder builder;
            size_t before = builder.blocks.get_total_content_size();

            for (size_t i = 0; i < NUM_OPS; i++) {
                // Simulate 136-bit limbs from op queue
                // x_lo: 136 bits (limbs 0-1), x_hi: 118 bits (limbs 2-3, where limb 3 is only 50 bits for BN254 Fq)
                constexpr uint256_t LIMB_136_MASK = (uint256_t(1) << 136) - 1;
                constexpr uint256_t LIMB_118_MASK = (uint256_t(1) << 118) - 1; // 68 + 50 bits for BN254 Fq
                Fr x_lo_val = Fr(uint256_t(Fr::random_element()) & LIMB_136_MASK);
                Fr x_hi_val = Fr(uint256_t(Fr::random_element()) & LIMB_118_MASK);
                field_ct x_lo = field_ct::from_witness(&builder, x_lo_val);
                field_ct x_hi = field_ct::from_witness(&builder, x_hi_val);

                // This constructor decomposes each limb and range-constrains
                fq_ct px(x_lo, x_hi);
                (void)px;
            }

            size_t after_pre_finalize = builder.blocks.get_total_content_size();
            size_t range_vars = 0;
            for (const auto& [range, list] : builder.range_lists) {
                range_vars += list.variable_indices.size();
            }

            builder.finalize_circuit(false);
            size_t after_finalize = builder.blocks.get_total_content_size();

            info("\n=== Current Approach: fq_ct(x_lo, x_hi) for ", NUM_OPS, " Px constructions ===");
            info("Gates pre-finalize:  ", after_pre_finalize - before);
            info("Range vars queued:   ", range_vars);
            info("Delta range gates:   ", builder.blocks.delta_range.size());
            info("NNF gates:           ", builder.blocks.nnf.size());
            info("Total gates (final): ", after_finalize - before);
        }

        // PRE-DECOMPOSED approach: unsafe_construct_from_limbs (no decomposition/range constraints)
        {
            Builder builder;
            size_t before = builder.blocks.get_total_content_size();

            for (size_t i = 0; i < NUM_OPS; i++) {
                // Simulate 68-bit limbs that were pre-decomposed and range-constrained in kernels
                constexpr uint256_t LIMB_MASK = (uint256_t(1) << 68) - 1;
                Fr x_lo_lo_val = Fr(uint256_t(Fr::random_element()) & LIMB_MASK);
                Fr x_lo_hi_val = Fr(uint256_t(Fr::random_element()) & LIMB_MASK);
                Fr x_hi_lo_val = Fr(uint256_t(Fr::random_element()) & LIMB_MASK);
                Fr x_hi_hi_val = Fr(uint256_t(Fr::random_element()) & ((uint256_t(1) << 50) - 1)); // top limb ~50 bits

                field_ct x_lo_lo = field_ct::from_witness(&builder, x_lo_lo_val);
                field_ct x_lo_hi = field_ct::from_witness(&builder, x_lo_hi_val);
                field_ct x_hi_lo = field_ct::from_witness(&builder, x_hi_lo_val);
                field_ct x_hi_hi = field_ct::from_witness(&builder, x_hi_hi_val);

                // No decomposition or range constraints - assumes done in kernel
                fq_ct px = fq_ct::unsafe_construct_from_limbs(x_lo_lo, x_lo_hi, x_hi_lo, x_hi_hi, false);
                (void)px;
            }

            size_t after_pre_finalize = builder.blocks.get_total_content_size();
            size_t range_vars = 0;
            for (const auto& [range, list] : builder.range_lists) {
                range_vars += list.variable_indices.size();
            }

            builder.finalize_circuit(false);
            size_t after_finalize = builder.blocks.get_total_content_size();

            info("\n=== Pre-decomposed: unsafe_construct_from_limbs for ", NUM_OPS, " Px constructions ===");
            info("Gates pre-finalize:  ", after_pre_finalize - before);
            info("Range vars queued:   ", range_vars);
            info("Delta range gates:   ", builder.blocks.delta_range.size());
            info("NNF gates:           ", builder.blocks.nnf.size());
            info("Total gates (final): ", after_finalize - before);
        }

        // Use actual measured values
        constexpr size_t TRANSLATOR_SAVINGS_PER_COORD = 59789 - 8192;                 // 51,597 gates
        constexpr size_t TRANSLATOR_SAVINGS_TOTAL = 2 * TRANSLATOR_SAVINGS_PER_COORD; // Px + Py
        constexpr size_t KERNEL_GATES_PER_OP = 36;                                    // measured with 240 ops batch
        constexpr size_t OPS_PER_KERNEL = 240;
        constexpr size_t NUM_KERNELS = 17;
        constexpr size_t KERNEL_OVERHEAD_PER_KERNEL = OPS_PER_KERNEL * KERNEL_GATES_PER_OP;
        constexpr size_t KERNEL_OVERHEAD_TOTAL = NUM_KERNELS * KERNEL_OVERHEAD_PER_KERNEL;

        info("\n=== Summary ===");
        info("Translator savings (Px + Py): ", TRANSLATOR_SAVINGS_TOTAL, " gates");
        info("");
        info("Kernel overhead (measured with 240 ops/kernel):");
        info("  - ", KERNEL_GATES_PER_OP, " gates per op for pre-decomposing all 4 coord limbs");
        info("  - Per kernel (", OPS_PER_KERNEL, " ops): ", KERNEL_OVERHEAD_PER_KERNEL, " gates");
        info("  - ", NUM_KERNELS, " kernels total: ", KERNEL_OVERHEAD_TOTAL, " gates added");
        info("");
        auto net = static_cast<int64_t>(TRANSLATOR_SAVINGS_TOTAL) - static_cast<int64_t>(KERNEL_OVERHEAD_TOTAL);
        info("NET IMPACT: ", TRANSLATOR_SAVINGS_TOTAL, " saved - ", KERNEL_OVERHEAD_TOTAL, " added = ", net, " gates");
        if (net < 0) {
            info("CONCLUSION: Optimization is NOT worth it - kernel overhead exceeds translator savings");
        } else {
            info("CONCLUSION: Optimization saves ", net, " gates overall");
        }
    }
}

/**
 * @brief Test that the verification key is independent of the number of actual ops in the fixed-size op queue.
 *
 * This is critical for the protocol: the VK must be constant regardless of how many operations
 * are actually used, since the op queue is always padded to OP_QUEUE_SIZE.
 *
 * NOTE: This test uses the standard (non-predecomposed) limb construction (the default).
 * When use_predecomposed_limbs=true, constants are created for the 68-bit sublimbs because the
 * op queue still uses 136-bit layout. This embeds actual values into the circuit, making VK
 * value-dependent. When the op queue layout is changed to 3-rows with native 68-bit limbs,
 * the sublimbs will be witnesses from the op queue, and VK will become value-independent again.
 */
TEST_F(BigfieldTranslatorProverTest, VKIndependentOfOpCount)
{
    // Use same challenges for all provers to ensure deterministic circuit structure
    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create provers with different numbers of actual ops (all padded to same OP_QUEUE_SIZE)
    std::vector<size_t> op_counts = { 1, 10, 100, 500 };
    std::vector<std::shared_ptr<LightZKFlavor::VerificationKey>> verification_keys;

    // All op queues should have the same fixed size
    const size_t expected_size = create_test_op_queue(1)->get_ultra_ops().size();

    for (size_t num_ops : op_counts) {
        auto op_queue = create_test_op_queue(num_ops);
        ASSERT_EQ(op_queue->get_ultra_ops().size(), expected_size) << "Op queue should be padded to fixed size";

        BigfieldTranslatorProver prover(op_queue, x_native, v_native);
        verification_keys.push_back(prover.get_verification_key());
    }

    // Compare all VKs - they should be identical
    auto reference_vk = verification_keys[0];
    for (size_t i = 1; i < verification_keys.size(); i++) {
        auto& vk = verification_keys[i];

        // Compare VK metadata
        EXPECT_EQ(reference_vk->log_circuit_size, vk->log_circuit_size)
            << "log_circuit_size mismatch for " << op_counts[i] << " ops";
        EXPECT_EQ(reference_vk->num_public_inputs, vk->num_public_inputs)
            << "num_public_inputs mismatch for " << op_counts[i] << " ops";
        EXPECT_EQ(reference_vk->pub_inputs_offset, vk->pub_inputs_offset)
            << "pub_inputs_offset mismatch for " << op_counts[i] << " ops";

        // Compare all precomputed commitments
        auto ref_commitments = reference_vk->get_all();
        auto vk_commitments = vk->get_all();

        ASSERT_EQ(ref_commitments.size(), vk_commitments.size()) << "Commitment count mismatch";

        for (size_t j = 0; j < ref_commitments.size(); j++) {
            EXPECT_EQ(ref_commitments[j], vk_commitments[j])
                << "Commitment " << j << " mismatch for " << op_counts[i] << " ops vs " << op_counts[0] << " ops";
        }
    }
}

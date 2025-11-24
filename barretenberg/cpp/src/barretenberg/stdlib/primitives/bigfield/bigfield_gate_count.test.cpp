/**
 * @file bigfield_gate_count.test.cpp
 * @brief Tests to measure gate counts for bigfield-based translator computation
 *
 * This test validates the gate count estimates for replacing the Translator
 * with a simpler bigfield-based approach.
 */

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>

using namespace bb;

using Builder = UltraCircuitBuilder;
using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;
using fq = bb::fq;

// Mega types for proving
using MegaBuilder = MegaCircuitBuilder;
using MegaFqCt = stdlib::bigfield<MegaBuilder, bb::Bn254FqParams>;

class BigfieldGateCountTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
    static constexpr size_t NUM_LIMB_BITS = fq_ct::NUM_LIMB_BITS;
};

/**
 * @brief Measure gate cost of creating range-constrained bigfield inputs
 *
 * This measures the cost of creating P.x, P.y (254-bit), z1, z2 (128-bit), and op
 */
TEST_F(BigfieldGateCountTest, InputCreationCost)
{
    Builder builder;

    size_t gates_before = builder.num_gates();

    // Create P.x (254-bit field element)
    fq px_native = fq::random_element();
    fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(px_native));

    size_t gates_after_px = builder.num_gates();
    size_t px_cost = gates_after_px - gates_before;

    // Create P.y (254-bit field element)
    fq py_native = fq::random_element();
    fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(py_native));

    size_t gates_after_py = builder.num_gates();
    size_t py_cost = gates_after_py - gates_after_px;

    // Create z1 (128-bit scalar) - using smaller value
    uint256_t z1_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);
    fq_ct z1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z1_native));

    size_t gates_after_z1 = builder.num_gates();
    size_t z1_cost = gates_after_z1 - gates_after_py;

    // Create z2 (128-bit scalar)
    uint256_t z2_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);
    fq_ct z2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z2_native));

    size_t gates_after_z2 = builder.num_gates();
    size_t z2_cost = gates_after_z2 - gates_after_z1;

    // Create op (small value in {0, 3, 4, 8})
    fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

    size_t gates_after_op = builder.num_gates();
    size_t op_cost = gates_after_op - gates_after_z2;

    size_t total_input_cost = gates_after_op - gates_before;

    // Suppress unused variable warnings
    (void)px;
    (void)py;
    (void)z1;
    (void)z2;
    (void)op;

    info("=== Input Creation Gate Costs ===");
    info("P.x (254-bit): ", px_cost, " gates");
    info("P.y (254-bit): ", py_cost, " gates");
    info("z1 (128-bit):  ", z1_cost, " gates");
    info("z2 (128-bit):  ", z2_cost, " gates");
    info("op (small):    ", op_cost, " gates");
    info("Total inputs:  ", total_input_cost, " gates");
    info("");

    // Note: First bigfield creation includes one-time lookup table setup (~1700 gates)
    // Subsequent creations cost only ~8 gates each
    // Total for 5 inputs: ~1738 + 4*8 = ~1770 gates (but amortized over many rows)
    EXPECT_GT(total_input_cost, 0) << "Should have some input cost";
}

/**
 * @brief Measure gate cost of the core translator computation using mult_madd
 *
 * Computes: acc = prev_acc * x + op + P.x * v + P.y * v^2 + z1 * v^3 + z2 * v^4
 */
TEST_F(BigfieldGateCountTest, TranslatorComputationCost)
{
    Builder builder;

    // Create all inputs as witnesses (simulating pre-constrained inputs)
    fq prev_acc_native = fq::random_element();
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();
    fq px_native = fq::random_element();
    fq py_native = fq::random_element();
    uint256_t z1_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);
    uint256_t z2_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);

    // Create bigfield elements
    fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(prev_acc_native));
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
    fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(px_native));
    fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(py_native));
    fq_ct z1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z1_native));
    fq_ct z2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z2_native));
    fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

    // Compute powers of v
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    size_t gates_before_computation = builder.num_gates();

    // Core computation: acc = prev_acc * x + op + P.x * v + P.y * v^2 + z1 * v^3 + z2 * v^4
    // Using dual_madd and additions to combine products

    // First compute prev_acc * x + px * v
    fq_ct term1 = fq_ct::dual_madd(prev_acc, x, px, v, { op });

    size_t gates_after_term1 = builder.num_gates();

    // Then compute py * v2 + z1 * v3
    fq_ct term2 = fq_ct::dual_madd(py, v2, z1, v3, {});

    size_t gates_after_term2 = builder.num_gates();

    // Compute z2 * v4
    fq_ct term3 = z2 * v4;

    size_t gates_after_term3 = builder.num_gates();

    // Final sum
    fq_ct result = term1 + term2 + term3;
    (void)result;

    size_t gates_after_computation = builder.num_gates();

    size_t term1_cost = gates_after_term1 - gates_before_computation;
    size_t term2_cost = gates_after_term2 - gates_after_term1;
    size_t term3_cost = gates_after_term3 - gates_after_term2;
    size_t final_sum_cost = gates_after_computation - gates_after_term3;
    size_t total_computation_cost = gates_after_computation - gates_before_computation;

    info("=== Translator Computation Gate Costs ===");
    info("dual_madd (prev_acc*x + px*v + op): ", term1_cost, " gates");
    info("dual_madd (py*v2 + z1*v3):          ", term2_cost, " gates");
    info("mult (z2*v4):                       ", term3_cost, " gates");
    info("final additions:                    ", final_sum_cost, " gates");
    info("Total computation:                  ", total_computation_cost, " gates");
    info("");

    // Actual measurement: ~108 gates for 2 dual_madd + 1 mult + additions
    // This is higher than the theoretical minimum due to:
    // - Each mult_madd still has internal overhead
    // - Decomposition/range constraint gates
    EXPECT_LT(total_computation_cost, 150) << "Computation cost unexpectedly high";
}

/**
 * @brief Measure gate cost using mult_madd with all 5 products combined
 *
 * This tests using msub_div or a combined approach for all products
 */
TEST_F(BigfieldGateCountTest, CombinedMultMaddCost)
{
    Builder builder;

    // Create all inputs
    fq prev_acc_native = fq::random_element();
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();
    fq px_native = fq::random_element();
    fq py_native = fq::random_element();
    uint256_t z1_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);
    uint256_t z2_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);

    fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(prev_acc_native));
    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
    fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(px_native));
    fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(py_native));
    fq_ct z1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z1_native));
    fq_ct z2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z2_native));
    fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

    // Compute powers of v (these would be done once, not per row)
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    size_t gates_before = builder.num_gates();

    // Try to combine as many products as possible
    // acc = prev_acc * x + px * v + py * v2 + z1 * v3 + z2 * v4 + op

    // Using chain of operations
    fq_ct acc = prev_acc * x;
    acc = acc + px * v;
    acc = acc + py * v2;
    acc = acc + z1 * v3;
    acc = acc + z2 * v4;
    acc = acc + op;

    size_t gates_after = builder.num_gates();
    size_t naive_cost = gates_after - gates_before;

    info("=== Naive Chain Computation ===");
    info("5 mults + 5 adds: ", naive_cost, " gates");
    info("");

    // Now test with sqradd pattern for better efficiency
    Builder builder2;

    prev_acc = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(prev_acc_native));
    x = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(x_native));
    v = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(v_native));
    px = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(px_native));
    py = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(py_native));
    z1 = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(z1_native));
    z2 = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(z2_native));
    op = fq_ct::create_from_u512_as_witness(&builder2, uint512_t(3));

    v2 = v.sqr();
    v3 = v2 * v;
    v4 = v3 * v;

    gates_before = builder2.num_gates();

    // Use madd where possible
    fq_ct result = prev_acc.madd(x, { px * v, py * v2, z1 * v3, z2 * v4, op });
    (void)result;

    gates_after = builder2.num_gates();
    size_t madd_cost = gates_after - gates_before;

    info("=== Using madd ===");
    info("madd with 5 additions: ", madd_cost, " gates");
    info("");
}

/**
 * @brief Compare different computation strategies for efficiency
 */
TEST_F(BigfieldGateCountTest, ComputationStrategies)
{
    // Strategy 1: Current approach (2x dual_madd + 1 mult + adds)
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));
        fq_ct v2 = v.sqr();
        fq_ct v3 = v2 * v;
        fq_ct v4 = v3 * v;

        size_t before = builder.num_gates();
        fq_ct term1 = fq_ct::dual_madd(prev_acc, x, px, v, { op });
        fq_ct term2 = fq_ct::dual_madd(py, v2, z1, v3, {});
        fq_ct term3 = z2 * v4;
        fq_ct result = term1 + term2 + term3;
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 1 (2x dual_madd + mult + adds): ", after - before, " gates");
    }

    // Strategy 2: Single madd with all additions
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));
        fq_ct v2 = v.sqr();
        fq_ct v3 = v2 * v;
        fq_ct v4 = v3 * v;

        size_t before = builder.num_gates();
        // Compute all products first, then combine
        fq_ct p1 = prev_acc * x;
        fq_ct p2 = px * v;
        fq_ct p3 = py * v2;
        fq_ct p4 = z1 * v3;
        fq_ct p5 = z2 * v4;
        fq_ct result = p1 + p2 + p3 + p4 + p5 + op;
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 2 (5 separate mults + adds): ", after - before, " gates");
    }

    // Strategy 3: Chain of madd operations
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));
        fq_ct v2 = v.sqr();
        fq_ct v3 = v2 * v;
        fq_ct v4 = v3 * v;

        size_t before = builder.num_gates();
        // Use madd to chain: a.madd(b, to_add) = a*b + sum(to_add)
        fq_ct result = prev_acc.madd(x, { op, px * v, py * v2, z1 * v3, z2 * v4 });
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 3 (madd with nested mults): ", after - before, " gates");
    }

    // Strategy 4: Horner-like evaluation
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

        size_t before = builder.num_gates();
        // Horner: op + v*(px + v*(py + v*(z1 + v*z2)))
        fq_ct inner = z1 + z2 * v;
        inner = py + inner * v;
        inner = px + inner * v;
        fq_ct result = prev_acc * x + op + inner * v;
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 4 (Horner-like): ", after - before, " gates");
    }

    // Strategy 5: dual_madd chain
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));
        fq_ct v2 = v.sqr();
        fq_ct v3 = v2 * v;
        fq_ct v4 = v3 * v;

        size_t before = builder.num_gates();
        // Use dual_madd more aggressively
        fq_ct term1 = fq_ct::dual_madd(prev_acc, x, px, v, {});
        fq_ct term2 = fq_ct::dual_madd(py, v2, z1, v3, { op, term1 });
        fq_ct result = term2 + z2 * v4;
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 5 (dual_madd chain): ", after - before, " gates");
    }

    // Strategy 6: mult_madd with all 5 products at once
    {
        Builder builder;
        fq_ct prev_acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));
        fq_ct v2 = v.sqr();
        fq_ct v3 = v2 * v;
        fq_ct v4 = v3 * v;

        size_t before = builder.num_gates();
        // Single mult_madd with all 5 products: one quotient/remainder check
        std::vector<fq_ct> left = { prev_acc, px, py, z1, z2 };
        std::vector<fq_ct> right = { x, v, v2, v3, v4 };
        std::vector<fq_ct> to_add = { op };
        fq_ct result = fq_ct::mult_madd(left, right, to_add);
        (void)result;
        size_t after = builder.num_gates();
        info("Strategy 6 (mult_madd all 5 products): ", after - before, " gates");
    }

    info("");
}

/**
 * @brief Test 3-row batching strategy with 16 products per batch
 */
TEST_F(BigfieldGateCountTest, ThreeRowBatching)
{
    constexpr size_t NUM_ROWS = 99; // Divisible by 3 for clean batching

    Builder builder;

    // Create challenge values (computed once)
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Precompute powers of v (one-time)
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    size_t gates_before_precompute = builder.num_gates();

    // Precompute x powers and cross terms (one-time)
    fq_ct x2 = x.sqr();
    fq_ct x3 = x2 * x;

    // Cross terms for batching
    fq_ct vx = v * x;
    fq_ct v2x = v2 * x;
    fq_ct v3x = v3 * x;
    fq_ct v4x = v4 * x;

    fq_ct vx2 = v * x2;
    fq_ct v2x2 = v2 * x2;
    fq_ct v3x2 = v3 * x2;
    fq_ct v4x2 = v4 * x2;

    size_t gates_after_precompute = builder.num_gates();
    size_t precompute_cost = gates_after_precompute - gates_before_precompute;

    // Initialize accumulator
    fq_ct acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));

    size_t num_batches = NUM_ROWS / 3;

    size_t total_input_gates = 0;
    size_t total_computation_gates = 0;

    // Process in batches of 3 rows
    for (size_t batch = 0; batch < num_batches; batch++) {
        size_t gates_before_inputs = builder.num_gates();

        // Create inputs for 3 rows
        fq_ct px0 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py0 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1_0 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2_0 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op0 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

        fq_ct px1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1_1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2_1 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

        fq_ct px2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct py2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        fq_ct z1_2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct z2_2 = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        fq_ct op2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(3));

        size_t gates_after_inputs = builder.num_gates();
        total_input_gates += (gates_after_inputs - gates_before_inputs);

        // Compute acc_{i+3} = acc_i * x³ + (row_i)*x² + (row_{i+1})*x + (row_{i+2})
        // Using mult_madd with 16 products
        std::vector<fq_ct> left = {
            acc,                       // * x³
            op0, px0, py0, z1_0, z2_0, // row 0 * x²
            op1, px1, py1, z1_1, z2_1, // row 1 * x
            op2, px2, py2, z1_2, z2_2  // row 2 * 1
        };
        std::vector<fq_ct> right = {
            x3,                              // acc * x³
            x2,       vx2, v2x2, v3x2, v4x2, // row 0 coeffs
            x,        vx,  v2x,  v3x,  v4x,  // row 1 coeffs
            fq_ct(1), v,   v2,   v3,   v4    // row 2 coeffs
        };
        std::vector<fq_ct> to_add = {};

        acc = fq_ct::mult_madd(left, right, to_add);

        size_t gates_after_computation = builder.num_gates();
        total_computation_gates += (gates_after_computation - gates_after_inputs);
    }

    size_t input_gates_per_batch = total_input_gates / num_batches;
    size_t computation_gates_per_batch = total_computation_gates / num_batches;
    size_t computation_gates_per_row = total_computation_gates / NUM_ROWS;

    info("=== 3-Row Batching (", NUM_ROWS, " rows, ", num_batches, " batches) ===");
    info("Precomputation (one-time):      ", precompute_cost, " gates");
    info("Input gates per batch:          ", input_gates_per_batch);
    info("Computation gates per batch:    ", computation_gates_per_batch);
    info("Computation gates per row:      ", computation_gates_per_row);
    info("");

    // Extrapolate to 2^13 rows (computation only, pre-constrained inputs)
    size_t full_batches = (1 << 13) / 3;
    size_t estimated_computation_only = precompute_cost + (computation_gates_per_batch * full_batches);
    info("Estimated for 2^13 rows (computation only): ", estimated_computation_only, " gates");
    info("Log2 circuit size:                          ~", std::log2(estimated_computation_only));
    info("");

    // Verify circuit
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Full simulation of N rows to get total circuit size
 */
TEST_F(BigfieldGateCountTest, FullCircuitSimulation)
{
    constexpr size_t NUM_ROWS = 100; // Use smaller number for test speed

    Builder builder;

    // Create challenge values (computed once)
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    // Initialize accumulator
    fq_ct acc = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));

    size_t gates_before_loop = builder.num_gates();

    size_t total_input_gates = 0;
    size_t total_computation_gates = 0;

    // Simulate rows
    for (size_t i = 0; i < NUM_ROWS; i++) {
        size_t gates_before_inputs = builder.num_gates();

        // Create row inputs (simulating pre-constrained from transcript)
        fq px_native = fq::random_element();
        fq py_native = fq::random_element();
        uint256_t z1_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);
        uint256_t z2_native = uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1);

        fq_ct px = fq_ct::create_from_u512_as_witness(&builder, uint512_t(px_native));
        fq_ct py = fq_ct::create_from_u512_as_witness(&builder, uint512_t(py_native));
        fq_ct z1 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z1_native));
        fq_ct z2 = fq_ct::create_from_u512_as_witness(&builder, uint512_t(z2_native));
        fq_ct op = fq_ct::create_from_u512_as_witness(&builder, uint512_t(i % 4 == 0 ? 0 : 3));

        size_t gates_after_inputs = builder.num_gates();
        total_input_gates += (gates_after_inputs - gates_before_inputs);

        // Compute: acc = acc * x + op + px * v + py * v2 + z1 * v3 + z2 * v4
        // Using optimal Strategy 6: mult_madd with all 5 products
        std::vector<fq_ct> left = { acc, px, py, z1, z2 };
        std::vector<fq_ct> right = { x, v, v2, v3, v4 };
        std::vector<fq_ct> to_add = { op };
        acc = fq_ct::mult_madd(left, right, to_add);

        size_t gates_after_computation = builder.num_gates();
        total_computation_gates += (gates_after_computation - gates_after_inputs);
    }

    size_t gates_after_loop = builder.num_gates();
    size_t total_loop_gates = gates_after_loop - gates_before_loop;
    size_t input_gates_per_row = total_input_gates / NUM_ROWS;
    size_t computation_gates_per_row = total_computation_gates / NUM_ROWS;
    size_t gates_per_row = total_loop_gates / NUM_ROWS;

    info("=== Full Circuit Simulation (", NUM_ROWS, " rows) ===");
    info("Input gates per row:       ", input_gates_per_row);
    info("Computation gates per row: ", computation_gates_per_row);
    info("Total gates per row:       ", gates_per_row);
    info("");

    // Extrapolate to 2^13 rows
    size_t estimated_full_circuit = gates_per_row * (1 << 13);
    info("Estimated for 2^13 rows: ", estimated_full_circuit, " gates");
    info("Log2 circuit size:       ~", std::log2(estimated_full_circuit));
    info("");

    // Check circuit validity
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Vertical batching: precompute x powers, then batch 16 elements per column
 *
 * This computes: result = Σ(op_i·x^{N-1-i}) + v·Σ(px_i·x^{N-1-i}) + v²·Σ(py_i·x^{N-1-i}) + ...
 * Each column is processed independently with 16 elements per mult_madd call.
 */
TEST_F(BigfieldGateCountTest, VerticalBatching)
{
    // Use 2^12 = 4096 rows (actual number of ops, since translator uses 2 rows per op)
    constexpr size_t NUM_ROWS = 4096;
    constexpr size_t BATCH_SIZE = 16;
    constexpr size_t NUM_BATCHES = NUM_ROWS / BATCH_SIZE;

    Builder builder;

    // Create challenge values
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    size_t gates_before_powers = builder.num_gates();

    // Precompute all powers of x: x^0, x^1, ..., x^{N-1}
    std::vector<fq_ct> x_powers(NUM_ROWS);
    x_powers[0] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(1));
    x_powers[1] = x;
    for (size_t i = 2; i < NUM_ROWS; i++) {
        x_powers[i] = x_powers[i - 1] * x;
    }

    size_t gates_after_powers = builder.num_gates();
    size_t power_precompute_cost = gates_after_powers - gates_before_powers;

    // Compute powers of v (one-time)
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    size_t gates_before_inputs = builder.num_gates();

    // Create all row inputs (simulating pre-constrained from ECCVM)
    std::vector<fq_ct> ops(NUM_ROWS);
    std::vector<fq_ct> pxs(NUM_ROWS);
    std::vector<fq_ct> pys(NUM_ROWS);
    std::vector<fq_ct> z1s(NUM_ROWS);
    std::vector<fq_ct> z2s(NUM_ROWS);

    for (size_t i = 0; i < NUM_ROWS; i++) {
        ops[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(i % 4 == 0 ? 0 : 3));
        pxs[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        pys[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        z1s[i] = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        z2s[i] = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
    }

    size_t gates_after_inputs = builder.num_gates();
    size_t input_creation_cost = gates_after_inputs - gates_before_inputs;

    size_t gates_before_computation = builder.num_gates();

    // Vertical batching: process each column independently
    // Column sums: Σ(col_i · x^{N-1-i})

    // Helper lambda to compute column sum with batching
    auto compute_column_sum = [&](const std::vector<fq_ct>& col) -> fq_ct {
        fq_ct sum = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));

        for (size_t batch = 0; batch < NUM_BATCHES; batch++) {
            std::vector<fq_ct> left(BATCH_SIZE);
            std::vector<fq_ct> right(BATCH_SIZE);

            for (size_t j = 0; j < BATCH_SIZE; j++) {
                size_t row_idx = batch * BATCH_SIZE + j;
                left[j] = col[row_idx];
                // x^{N-1-row_idx} for descending powers
                right[j] = x_powers[NUM_ROWS - 1 - row_idx];
            }

            fq_ct batch_sum = fq_ct::mult_madd(left, right, {});
            sum = sum + batch_sum;
        }

        return sum;
    };

    // Compute each column sum
    fq_ct op_sum = compute_column_sum(ops);
    fq_ct px_sum = compute_column_sum(pxs);
    fq_ct py_sum = compute_column_sum(pys);
    fq_ct z1_sum = compute_column_sum(z1s);
    fq_ct z2_sum = compute_column_sum(z2s);

    // Final result: op_sum + v*px_sum + v²*py_sum + v³*z1_sum + v⁴*z2_sum
    fq_ct result = fq_ct::mult_madd({ px_sum, py_sum, z1_sum, z2_sum }, { v, v2, v3, v4 }, { op_sum });
    (void)result;

    size_t gates_after_computation = builder.num_gates();
    size_t computation_cost = gates_after_computation - gates_before_computation;

    size_t total_gates = builder.num_gates();

    info("=== Vertical Batching (", NUM_ROWS, " rows = 2^12 ops) ===");
    info("Power precomputation (x^0 to x^{N-1}): ", power_precompute_cost, " gates");
    info("Input creation (would be in ECCVM):   ", input_creation_cost, " gates");
    info("Computation (column sums + combine):  ", computation_cost, " gates");
    info("Total gates:                          ", total_gates);
    info("Log2 total:                           ~", std::log2(total_gates));
    info("");

    // Computation-only estimate (inputs pre-constrained)
    size_t computation_only = power_precompute_cost + computation_cost;
    info("Computation only (pre-constrained inputs): ", computation_only, " gates");
    info("Log2 computation only:                     ~", std::log2(computation_only));
    info("");

    // Per-row metrics
    info("Computation gates per row: ", computation_cost / NUM_ROWS);
    info("mult_madd calls: ", NUM_BATCHES * 5, " (", NUM_BATCHES, " batches × 5 columns)");
    info("");

    // Verify circuit
    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

/**
 * @brief Optimized vertical batching with batch-verified power computation
 *
 * Instead of computing x^i = x^{i-1} * x sequentially (one reduction each),
 * we create all powers as witnesses and batch-verify using mult_madd.
 */
TEST_F(BigfieldGateCountTest, VerticalBatchingOptimized)
{
    constexpr size_t NUM_ROWS = 4096;
    constexpr size_t BATCH_SIZE = 16;
    constexpr size_t NUM_BATCHES = NUM_ROWS / BATCH_SIZE;

    Builder builder;

    // Create challenge values
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();

    fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_native));
    fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(v_native));

    size_t gates_before_powers = builder.num_gates();

    // Compute all native powers first
    std::vector<fq> x_powers_native(NUM_ROWS);
    x_powers_native[0] = fq(1);
    for (size_t i = 1; i < NUM_ROWS; i++) {
        x_powers_native[i] = x_powers_native[i - 1] * x_native;
    }

    // Create all powers as witnesses (cheap - just witness creation)
    std::vector<fq_ct> x_powers(NUM_ROWS);
    for (size_t i = 0; i < NUM_ROWS; i++) {
        x_powers[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(x_powers_native[i]));
    }

    size_t gates_after_witness_creation = builder.num_gates();
    size_t witness_creation_cost = gates_after_witness_creation - gates_before_powers;

    // Batch-verify the power chain using random linear combination
    // We want to verify: x^{i+1} = x^i * x for all i
    // Using challenge r, verify: sum_i r^i * (x^i * x - x^{i+1}) = 0
    // This is: sum_i (r^i * x^i * x) - sum_i (r^i * x^{i+1}) = 0
    // Which is: sum_i (r^i * x^i) * x - sum_i (r^i * x^{i+1}) = 0
    // Let A = sum_i (r^i * x^i), B = sum_i (r^i * x^{i+1})
    // Then: A * x = B

    fq r_native = fq::random_element(); // In practice, derive from transcript

    // Compute r powers
    std::vector<fq> r_powers_native(NUM_ROWS);
    r_powers_native[0] = fq(1);
    for (size_t i = 1; i < NUM_ROWS; i++) {
        r_powers_native[i] = r_powers_native[i - 1] * r_native;
    }

    // Create r power witnesses
    std::vector<fq_ct> r_powers(NUM_ROWS);
    for (size_t i = 0; i < NUM_ROWS; i++) {
        r_powers[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(r_powers_native[i]));
    }

    // Compute A = sum_i (r^i * x^i) for i = 0 to N-2
    // Compute B = sum_i (r^i * x^{i+1}) for i = 0 to N-2
    // Using batched mult_madd

    constexpr size_t VERIFY_BATCH = 16;
    size_t num_verify_batches = (NUM_ROWS - 1) / VERIFY_BATCH;

    fq_ct A = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));
    fq_ct B = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));

    for (size_t batch = 0; batch < num_verify_batches; batch++) {
        std::vector<fq_ct> r_batch(VERIFY_BATCH);
        std::vector<fq_ct> x_batch(VERIFY_BATCH);
        std::vector<fq_ct> x_next_batch(VERIFY_BATCH);

        for (size_t j = 0; j < VERIFY_BATCH; j++) {
            size_t idx = batch * VERIFY_BATCH + j;
            r_batch[j] = r_powers[idx];
            x_batch[j] = x_powers[idx];
            x_next_batch[j] = x_powers[idx + 1];
        }

        // A += sum(r^i * x^i)
        fq_ct a_batch = fq_ct::mult_madd(r_batch, x_batch, {});
        A = A + a_batch;

        // B += sum(r^i * x^{i+1})
        fq_ct b_batch = fq_ct::mult_madd(r_batch, x_next_batch, {});
        B = B + b_batch;
    }

    // Verify A * x = B
    fq_ct lhs = A * x;
    lhs.assert_equal(B);

    size_t gates_after_verification = builder.num_gates();
    size_t verification_cost = gates_after_verification - gates_after_witness_creation;

    // Compute powers of v
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    size_t gates_before_inputs = builder.num_gates();

    // Create all row inputs
    std::vector<fq_ct> ops(NUM_ROWS);
    std::vector<fq_ct> pxs(NUM_ROWS);
    std::vector<fq_ct> pys(NUM_ROWS);
    std::vector<fq_ct> z1s(NUM_ROWS);
    std::vector<fq_ct> z2s(NUM_ROWS);

    for (size_t i = 0; i < NUM_ROWS; i++) {
        ops[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(i % 4 == 0 ? 0 : 3));
        pxs[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        pys[i] = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq::random_element()));
        z1s[i] = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        z2s[i] = fq_ct::create_from_u512_as_witness(
            &builder, uint512_t(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
    }

    size_t gates_after_inputs = builder.num_gates();
    size_t input_creation_cost = gates_after_inputs - gates_before_inputs;

    size_t gates_before_computation = builder.num_gates();

    // Vertical batching: compute column sums
    auto compute_column_sum = [&](const std::vector<fq_ct>& col) -> fq_ct {
        fq_ct sum = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0));

        for (size_t batch = 0; batch < NUM_BATCHES; batch++) {
            std::vector<fq_ct> left(BATCH_SIZE);
            std::vector<fq_ct> right(BATCH_SIZE);

            for (size_t j = 0; j < BATCH_SIZE; j++) {
                size_t row_idx = batch * BATCH_SIZE + j;
                left[j] = col[row_idx];
                right[j] = x_powers[NUM_ROWS - 1 - row_idx];
            }

            fq_ct batch_sum = fq_ct::mult_madd(left, right, {});
            sum = sum + batch_sum;
        }

        return sum;
    };

    fq_ct op_sum = compute_column_sum(ops);
    fq_ct px_sum = compute_column_sum(pxs);
    fq_ct py_sum = compute_column_sum(pys);
    fq_ct z1_sum = compute_column_sum(z1s);
    fq_ct z2_sum = compute_column_sum(z2s);

    fq_ct result = fq_ct::mult_madd({ px_sum, py_sum, z1_sum, z2_sum }, { v, v2, v3, v4 }, { op_sum });
    (void)result;

    size_t gates_after_computation = builder.num_gates();
    size_t computation_cost = gates_after_computation - gates_before_computation;

    size_t total_gates = builder.num_gates();

    info("=== Optimized Vertical Batching (", NUM_ROWS, " rows) ===");
    info("Power witness creation:    ", witness_creation_cost, " gates");
    info("Power chain verification:  ", verification_cost, " gates");
    info("Total power cost:          ", witness_creation_cost + verification_cost, " gates");
    info("Input creation:            ", input_creation_cost, " gates");
    info("Column computation:        ", computation_cost, " gates");
    info("Total gates:               ", total_gates);
    info("Log2 total:                ~", std::log2(total_gates));
    info("");

    size_t computation_only = witness_creation_cost + verification_cost + computation_cost;
    info("Computation only (pre-constrained inputs): ", computation_only, " gates");
    info("Log2 computation only:                     ~", std::log2(computation_only));
    info("");

    bool valid = CircuitChecker::check(builder);
    EXPECT_TRUE(valid) << "Circuit check failed";
}

// Helper to create bigfield without range constraints (simulates pre-constrained input)
template <typename Builder_, typename Params>
stdlib::bigfield<Builder_, Params> create_unsafe_bigfield(Builder_* builder, const fq& value)
{
    using BF = stdlib::bigfield<Builder_, Params>;
    uint256_t val(value);
    constexpr uint256_t limb_mask = (uint256_t(1) << BF::NUM_LIMB_BITS) - 1;

    uint256_t l0 = val & limb_mask;
    uint256_t l1 = (val >> BF::NUM_LIMB_BITS) & limb_mask;
    uint256_t l2 = (val >> (2 * BF::NUM_LIMB_BITS)) & limb_mask;
    uint256_t l3 = (val >> (3 * BF::NUM_LIMB_BITS));

    auto limb0 = stdlib::field_t<Builder_>::from_witness(builder, fr(l0));
    auto limb1 = stdlib::field_t<Builder_>::from_witness(builder, fr(l1));
    auto limb2 = stdlib::field_t<Builder_>::from_witness(builder, fr(l2));
    auto limb3 = stdlib::field_t<Builder_>::from_witness(builder, fr(l3));

    return BF::unsafe_construct_from_limbs(limb0, limb1, limb2, limb3);
}

// Convenience wrapper for MegaFqCt
MegaFqCt create_unsafe_mega_fq(MegaBuilder* builder, const fq& value)
{
    return create_unsafe_bigfield<MegaBuilder, bb::Bn254FqParams>(builder, value);
}

/**
 * @brief Prove the vertical batching circuit using MegaZK
 */
TEST_F(BigfieldGateCountTest, VerticalBatchingMegaProof)
{
    constexpr size_t NUM_ROWS = 4096;
    constexpr size_t BATCH_SIZE = 16;
    constexpr size_t NUM_BATCHES = NUM_ROWS / BATCH_SIZE;

    MegaBuilder builder;

    // Create challenge values (these need range constraints as they're verifier challenges)
    fq x_native = fq::random_element();
    fq v_native = fq::random_element();

    MegaFqCt x = MegaFqCt::create_from_u512_as_witness(&builder, uint512_t(x_native));
    MegaFqCt v = MegaFqCt::create_from_u512_as_witness(&builder, uint512_t(v_native));

    // Compute all native powers first
    std::vector<fq> x_powers_native(NUM_ROWS);
    x_powers_native[0] = fq(1);
    for (size_t i = 1; i < NUM_ROWS; i++) {
        x_powers_native[i] = x_powers_native[i - 1] * x_native;
    }

    // Create all powers as witnesses (unsafe - no range constraints)
    std::vector<MegaFqCt> x_powers(NUM_ROWS);
    for (size_t i = 0; i < NUM_ROWS; i++) {
        x_powers[i] = create_unsafe_mega_fq(&builder, x_powers_native[i]);
    }

    // Batch-verify the power chain using random linear combination
    fq r_native = fq::random_element();

    std::vector<fq> r_powers_native(NUM_ROWS);
    r_powers_native[0] = fq(1);
    for (size_t i = 1; i < NUM_ROWS; i++) {
        r_powers_native[i] = r_powers_native[i - 1] * r_native;
    }

    std::vector<MegaFqCt> r_powers(NUM_ROWS);
    for (size_t i = 0; i < NUM_ROWS; i++) {
        r_powers[i] = create_unsafe_mega_fq(&builder, r_powers_native[i]);
    }

    constexpr size_t VERIFY_BATCH = 16;
    size_t num_verify_batches = (NUM_ROWS - 1) / VERIFY_BATCH;

    MegaFqCt A = create_unsafe_mega_fq(&builder, fq(0));
    MegaFqCt B = create_unsafe_mega_fq(&builder, fq(0));

    for (size_t batch = 0; batch < num_verify_batches; batch++) {
        std::vector<MegaFqCt> r_batch(VERIFY_BATCH);
        std::vector<MegaFqCt> x_batch(VERIFY_BATCH);
        std::vector<MegaFqCt> x_next_batch(VERIFY_BATCH);

        for (size_t j = 0; j < VERIFY_BATCH; j++) {
            size_t idx = batch * VERIFY_BATCH + j;
            r_batch[j] = r_powers[idx];
            x_batch[j] = x_powers[idx];
            x_next_batch[j] = x_powers[idx + 1];
        }

        MegaFqCt a_batch = MegaFqCt::mult_madd(r_batch, x_batch, {});
        A = A + a_batch;

        MegaFqCt b_batch = MegaFqCt::mult_madd(r_batch, x_next_batch, {});
        B = B + b_batch;
    }

    MegaFqCt lhs = A * x;
    lhs.assert_equal(B);

    // Compute powers of v
    MegaFqCt v2 = v.sqr();
    MegaFqCt v3 = v2 * v;
    MegaFqCt v4 = v3 * v;

    // Create all row inputs (unsafe - no range constraints, simulating pre-constrained from ECCVM)
    std::vector<MegaFqCt> ops(NUM_ROWS);
    std::vector<MegaFqCt> pxs(NUM_ROWS);
    std::vector<MegaFqCt> pys(NUM_ROWS);
    std::vector<MegaFqCt> z1s(NUM_ROWS);
    std::vector<MegaFqCt> z2s(NUM_ROWS);

    for (size_t i = 0; i < NUM_ROWS; i++) {
        ops[i] = create_unsafe_mega_fq(&builder, fq(i % 4 == 0 ? 0 : 3));
        pxs[i] = create_unsafe_mega_fq(&builder, fq::random_element());
        pys[i] = create_unsafe_mega_fq(&builder, fq::random_element());
        z1s[i] = create_unsafe_mega_fq(&builder, fq(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
        z2s[i] = create_unsafe_mega_fq(&builder, fq(uint256_t(fr::random_element()) & ((uint256_t(1) << 128) - 1)));
    }

    // Vertical batching: compute column sums
    auto compute_column_sum = [&](const std::vector<MegaFqCt>& col) -> MegaFqCt {
        MegaFqCt sum = create_unsafe_mega_fq(&builder, fq(0));

        for (size_t batch = 0; batch < NUM_BATCHES; batch++) {
            std::vector<MegaFqCt> left(BATCH_SIZE);
            std::vector<MegaFqCt> right(BATCH_SIZE);

            for (size_t j = 0; j < BATCH_SIZE; j++) {
                size_t row_idx = batch * BATCH_SIZE + j;
                left[j] = col[row_idx];
                right[j] = x_powers[NUM_ROWS - 1 - row_idx];
            }

            MegaFqCt batch_sum = MegaFqCt::mult_madd(left, right, {});
            sum = sum + batch_sum;
        }

        return sum;
    };

    MegaFqCt op_sum = compute_column_sum(ops);
    MegaFqCt px_sum = compute_column_sum(pxs);
    MegaFqCt py_sum = compute_column_sum(pys);
    MegaFqCt z1_sum = compute_column_sum(z1s);
    MegaFqCt z2_sum = compute_column_sum(z2s);

    MegaFqCt result = MegaFqCt::mult_madd({ px_sum, py_sum, z1_sum, z2_sum }, { v, v2, v3, v4 }, { op_sum });
    (void)result;

    size_t total_gates = builder.num_gates();
    info("=== MegaZK Proof Generation ===");
    info("Total gates: ", total_gates);
    info("Log2 gates:  ~", std::log2(total_gates));
    info("");

    // Generate and verify proof
    info("Generating prover instance...");
    auto prover_instance = std::make_shared<ProverInstance_<MegaFlavor>>(builder);

    info("Creating verification key...");
    auto verification_key = std::make_shared<MegaFlavor::VerificationKey>(prover_instance->get_precomputed());

    info("Creating prover...");
    MegaProver prover{ prover_instance, verification_key };

    info("Generating proof...");
    auto proof = prover.construct_proof();
    info("Proof generated successfully");
    info("Proof size: ", proof.size(), " bytes");

    // Skip verification for now due to CRS size issues
    // The key measurement is the proving memory usage above
    EXPECT_GT(proof.size(), 0) << "Proof should not be empty";
}

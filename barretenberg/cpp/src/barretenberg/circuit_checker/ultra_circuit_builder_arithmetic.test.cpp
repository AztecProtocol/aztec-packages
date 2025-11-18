#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test suite for UltraCircuitBuilder arithmetic gate methods
 *
 * Methods under test:
 * ---------------------------
 * create_add_gate              (q_arith=1, 3-wire addition)
 * create_big_add_gate          (q_arith=1, 4-wire addition)
 * create_big_add_gate          (q_arith=2, 4-wire addition with w_4_shift)
 * create_big_mul_add_gate      (q_arith=1, 4-wire mul+add without w_4_shift)
 * create_big_mul_add_gate      (q_arith=2, 4-wire mul+add with w_4_shift)
 * create_arithmetic_gate       (q_arith=1, general arithmetic gate)
 * create_bool_gate             (q_arith=1, boolean constraint x² - x = 0)
 *
 */
class UltraCircuitBuilderArithmetic : public ::testing::Test {
  protected:
    // Helper structs to set up gate data
    struct AddTripleData {
        fr a, b, c;
        fr a_scaling, b_scaling, c_scaling, const_scaling;
    };

    struct AddQuadData {
        fr a, b, c, d;
        fr a_scaling, b_scaling, c_scaling, d_scaling, const_scaling;
    };

    struct MulQuadData {
        fr a, b, c, d;
        fr mul_scaling, a_scaling, b_scaling, c_scaling, d_scaling, const_scaling;
    };

    struct ArithTripleData {
        fr a, b, c;
        fr q_m, q_l, q_r, q_o, q_c;
    };

    // Helper for q_arith=3 mode gate setup
    struct QArith3Data {
        fr w_1, w_2, w_3, w_4;   // Current gate wire values
        fr w_1_next, w_4_next;   // Next gate wire values (for shifts)
        fr q_m_modifier = fr(0); // Added to correct q_m (for testing failures)
        fr q_c_modifier = fr(0); // Added to correct q_c (for testing failures)
    };

    // Creates a q_arith=3 gate with both subrelations satisfied (or intentionally broken)
    static void create_q_arith_3_gate(UltraCircuitBuilder& builder, const QArith3Data& data)
    {
        // Secondary subrelation: w_1 + w_4 - w_1_shift + q_m = 0
        // => q_m = w_1_shift - w_1 - w_4
        fr q_m = data.w_1_next - data.w_1 - data.w_4 + data.q_m_modifier;

        // Primary subrelation: q_1*w_1 + q_2*w_2 + q_3*w_3 + q_4*w_4 + q_c + 2*w_4_shift = 0
        const fr scale = fr(2);
        fr q_1 = scale;
        fr q_2 = scale;
        fr q_3 = scale;
        fr q_4 = scale;
        fr q_c = -(q_1 * data.w_1 + q_2 * data.w_2 + q_3 * data.w_3 + q_4 * data.w_4 + fr(2) * data.w_4_next) +
                 data.q_c_modifier;

        uint32_t w1_idx = builder.add_variable(data.w_1);
        uint32_t w2_idx = builder.add_variable(data.w_2);
        uint32_t w3_idx = builder.add_variable(data.w_3);
        uint32_t w4_idx = builder.add_variable(data.w_4);
        uint32_t w1_next_idx = builder.add_variable(data.w_1_next);
        uint32_t w4_next_idx = builder.add_variable(data.w_4_next);

        // Gate 1: q_arith = 3
        builder.blocks.arithmetic.populate_wires(w1_idx, w2_idx, w3_idx, w4_idx);
        builder.blocks.arithmetic.q_m().emplace_back(q_m);
        builder.blocks.arithmetic.q_1().emplace_back(q_1);
        builder.blocks.arithmetic.q_2().emplace_back(q_2);
        builder.blocks.arithmetic.q_3().emplace_back(q_3);
        builder.blocks.arithmetic.q_4().emplace_back(q_4);
        builder.blocks.arithmetic.q_c().emplace_back(q_c);
        builder.blocks.arithmetic.set_gate_selector(3);
        builder.check_selector_length_consistency();
        builder.increment_num_gates();

        // Gate 2: provides w_1_shift and w_4_shift for gate 1
        builder.blocks.arithmetic.populate_wires(w1_next_idx, builder.zero_idx(), builder.zero_idx(), w4_next_idx);
        builder.blocks.arithmetic.q_m().emplace_back(0);
        builder.blocks.arithmetic.q_1().emplace_back(0);
        builder.blocks.arithmetic.q_2().emplace_back(0);
        builder.blocks.arithmetic.q_3().emplace_back(0);
        builder.blocks.arithmetic.q_4().emplace_back(0);
        builder.blocks.arithmetic.q_c().emplace_back(0);
        builder.blocks.arithmetic.set_gate_selector(1);
        builder.check_selector_length_consistency();
        builder.increment_num_gates();
    }

    // Create gate that enforces: a + b = c
    static AddTripleData create_add_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a + b;
        return { a, b, c, fr(1), fr(1), fr(-1), fr(0) };
    }

    // Create gate that enforces: c = a + b + c
    static AddQuadData create_add_quad_data(uint64_t a_val = 3, uint64_t b_val = 5, uint64_t c_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c(c_val);
        fr d = a + b + c;
        return { a, b, c, d, fr(1), fr(1), fr(1), fr(-1), fr(0) };
    }

    // Create gate that enforces: d = a * b + c
    static MulQuadData create_mul_quad_data(uint64_t a_val = 5, uint64_t b_val = 7, uint64_t c_val = 3)
    {
        fr a(a_val);
        fr b(b_val);
        fr c(c_val);
        fr d = a * b + c;
        return { a, b, c, d, fr(1), fr(0), fr(0), fr(1), fr(-1), fr(0) };
    }

    // Create gate that enforces: c = a * b + 2a + 3b
    static ArithTripleData create_arithmetic_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a * b + fr(2) * a + fr(3) * b;
        return { a, b, c, fr(1), fr(2), fr(3), fr(-1), fr(0) };
    }
};

// Verifies that a valid 3-wire addition gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, AddGate)
{
    UltraCircuitBuilder builder;
    auto data = create_add_triple_data(5, 7);
    builder.create_add_gate({ builder.add_variable(data.a),
                              builder.add_variable(data.b),
                              builder.add_variable(data.c),
                              data.a_scaling,
                              data.b_scaling,
                              data.c_scaling,
                              data.const_scaling });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or scaling coefficient in an add gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, AddGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_add_triple_data(5, 7);
        modify_data(data);
        builder.create_add_gate({ builder.add_variable(data.a),
                                  builder.add_variable(data.b),
                                  builder.add_variable(data.c),
                                  data.a_scaling,
                                  data.b_scaling,
                                  data.c_scaling,
                                  data.const_scaling });
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](AddTripleData& d) { d.a += fr(1); });
    test_invalid([](AddTripleData& d) { d.b += fr(1); });
    test_invalid([](AddTripleData& d) { d.c += fr(1); });

    // Test scaling coefficient failures
    test_invalid([](AddTripleData& d) { d.a_scaling += fr(1); });
    test_invalid([](AddTripleData& d) { d.b_scaling += fr(1); });
    test_invalid([](AddTripleData& d) { d.c_scaling += fr(1); });
    test_invalid([](AddTripleData& d) { d.const_scaling += fr(1); });
}

// Verifies that a valid 4-wire addition gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, BigAddGate)
{
    UltraCircuitBuilder builder;
    auto data = create_add_quad_data(3, 5, 7);
    builder.create_big_add_gate({ builder.add_variable(data.a),
                                  builder.add_variable(data.b),
                                  builder.add_variable(data.c),
                                  builder.add_variable(data.d),
                                  data.a_scaling,
                                  data.b_scaling,
                                  data.c_scaling,
                                  data.d_scaling,
                                  data.const_scaling });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or scaling coefficient in a big add gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, BigAddGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_add_quad_data(3, 5, 7);
        modify_data(data);

        uint32_t a_idx = builder.add_variable(data.a);
        uint32_t b_idx = builder.add_variable(data.b);
        uint32_t c_idx = builder.add_variable(data.c);
        uint32_t d_idx = builder.add_variable(data.d);

        builder.create_big_add_gate({ a_idx,
                                      b_idx,
                                      c_idx,
                                      d_idx,
                                      data.a_scaling,
                                      data.b_scaling,
                                      data.c_scaling,
                                      data.d_scaling,
                                      data.const_scaling });

        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](AddQuadData& d) { d.a += fr(1); });
    test_invalid([](AddQuadData& d) { d.b += fr(1); });
    test_invalid([](AddQuadData& d) { d.c += fr(1); });
    test_invalid([](AddQuadData& d) { d.d += fr(1); });

    // Test scaling coefficient failures
    test_invalid([](AddQuadData& d) { d.a_scaling += fr(1); });
    test_invalid([](AddQuadData& d) { d.b_scaling += fr(1); });
    test_invalid([](AddQuadData& d) { d.c_scaling += fr(1); });
    test_invalid([](AddQuadData& d) { d.d_scaling += fr(1); });
    test_invalid([](AddQuadData& d) { d.const_scaling += fr(1); });
}

// Verifies that a valid arithmetic gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, ArithmeticGate)
{
    UltraCircuitBuilder builder;
    auto data = create_arithmetic_triple_data(5, 7);

    uint32_t a_idx = builder.add_variable(data.a);
    uint32_t b_idx = builder.add_variable(data.b);
    uint32_t c_idx = builder.add_variable(data.c);

    builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, data.q_m, data.q_l, data.q_r, data.q_o, data.q_c });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or selector coefficient in a arithmetic gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, ArithmeticGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_arithmetic_triple_data(5, 7);
        modify_data(data);

        uint32_t a_idx = builder.add_variable(data.a);
        uint32_t b_idx = builder.add_variable(data.b);
        uint32_t c_idx = builder.add_variable(data.c);

        builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, data.q_m, data.q_l, data.q_r, data.q_o, data.q_c });

        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](ArithTripleData& d) { d.a += fr(1); });
    test_invalid([](ArithTripleData& d) { d.b += fr(1); });
    test_invalid([](ArithTripleData& d) { d.c += fr(1); });

    // Test selector coefficient failures
    test_invalid([](ArithTripleData& d) { d.q_m += fr(1); });
    test_invalid([](ArithTripleData& d) { d.q_l += fr(1); });
    test_invalid([](ArithTripleData& d) { d.q_r += fr(1); });
    test_invalid([](ArithTripleData& d) { d.q_o += fr(1); });
    test_invalid([](ArithTripleData& d) { d.q_c += fr(1); });
}

// Verifies that multiple independent gates can coexist in a circuit
TEST_F(UltraCircuitBuilderArithmetic, MultipleGates)
{
    UltraCircuitBuilder builder;

    // Create three independent operations
    auto add_data = create_add_triple_data(5, 7);
    auto big_mul_data = create_mul_quad_data(3, 4);
    auto arith_data = create_arithmetic_triple_data(2, 6);

    // Add gate
    uint32_t add_a = builder.add_variable(add_data.a);
    uint32_t add_b = builder.add_variable(add_data.b);
    uint32_t add_c = builder.add_variable(add_data.c);
    builder.create_add_gate(
        { add_a, add_b, add_c, add_data.a_scaling, add_data.b_scaling, add_data.c_scaling, add_data.const_scaling });

    // Big mul gate
    uint32_t a_idx = builder.add_variable(big_mul_data.a);
    uint32_t b_idx = builder.add_variable(big_mul_data.b);
    uint32_t c_idx = builder.add_variable(big_mul_data.c);
    uint32_t d_idx = builder.add_variable(big_mul_data.d);

    builder.create_big_mul_add_gate({ a_idx,
                                      b_idx,
                                      c_idx,
                                      d_idx,
                                      big_mul_data.mul_scaling,
                                      big_mul_data.a_scaling,
                                      big_mul_data.b_scaling,
                                      big_mul_data.c_scaling,
                                      big_mul_data.d_scaling,
                                      big_mul_data.const_scaling },
                                    /* use_next_gate_w_4 */ false);

    // Arithmetic gate
    uint32_t arith_a = builder.add_variable(arith_data.a);
    uint32_t arith_b = builder.add_variable(arith_data.b);
    uint32_t arith_c = builder.add_variable(arith_data.c);
    builder.create_arithmetic_gate(
        { arith_a, arith_b, arith_c, arith_data.q_m, arith_data.q_l, arith_data.q_r, arith_data.q_o, arith_data.q_c });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that arithmetic_gate can handle complex multi-term expressions
TEST_F(UltraCircuitBuilderArithmetic, ArithmeticGateComplexExpression)
{
    UltraCircuitBuilder builder;

    // Polynomial: 3*a*b + 5*a - 2*b = c
    fr a(7);
    fr b(11);
    fr c = fr(3) * a * b + fr(5) * a - fr(2) * b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, fr(3), fr(5), fr(-2), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that q_arith = 2 mode (with w_4_shift) works correctly
// In this mode, the constraint includes the w_4 value from the NEXT row
// Constraint: 2 * [q_m * w_1 * w_2 + \sum_{i=1..4} q_i * w_i + q_c + w_4_shift] = 0
TEST_F(UltraCircuitBuilderArithmetic, BigAddGateWithNextRowW4)
{
    UltraCircuitBuilder builder;

    // First gate: a + b + c + d + next_w_4 = 0
    // where next_w_4 comes from the w_4 wire of the following gate
    fr a(3);
    fr b(5);
    fr c(7);
    fr next_w_4(11); // This will be the w_4 of the next gate
    fr d = -(a + b + c + next_w_4);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(fr(13));

    // First gate with use_next_gate_w_4 = true (sets q_arith = 2)
    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(1), fr(0) },
                                /* use_next_gate_w_4 */ true);

    // Second gate to provide the w_4 value
    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that q_arith = 2 mode fails when w_4_shift value is incorrect
TEST_F(UltraCircuitBuilderArithmetic, BigAddGateWithNextRowW4Failure)
{
    UltraCircuitBuilder builder;

    // Set up the same as above but with WRONG d value
    fr a(3);
    fr b(5);
    fr c(7);
    fr next_w_4(11);
    fr d = -(a + b + c + next_w_4) + fr(1); // INCORRECT: off by 1

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(fr(13));

    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(1), fr(0) },
                                /* use_next_gate_w_4 */ true);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_FALSE(CircuitChecker::check(builder));
}

// Verifies that a valid big_mul_add_gate without w_4_shift passes (q_arith = 1)
TEST_F(UltraCircuitBuilderArithmetic, BigMulAddGate)
{
    UltraCircuitBuilder builder;

    // Constraint: a * b + c + d = 0, or equivalently d = -(a*b + c)
    fr a(3);
    fr b(5);
    fr c(7);
    fr d = -(a * b + c);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);

    // create_big_mul_add_gate with include_next_gate_w_4=false uses q_arith=1
    builder.create_big_mul_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(0), fr(0), fr(1), fr(1), fr(0) },
                                    /* use_next_gate_w_4 */ false);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or scaling coefficient in a big_mul_add_gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, BigMulAddGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_mul_quad_data(5, 7, 3);
        modify_data(data);

        uint32_t a_idx = builder.add_variable(data.a);
        uint32_t b_idx = builder.add_variable(data.b);
        uint32_t c_idx = builder.add_variable(data.c);
        uint32_t d_idx = builder.add_variable(data.d);

        builder.create_big_mul_add_gate({ a_idx,
                                          b_idx,
                                          c_idx,
                                          d_idx,
                                          data.mul_scaling,
                                          data.a_scaling,
                                          data.b_scaling,
                                          data.c_scaling,
                                          data.d_scaling,
                                          data.const_scaling },
                                        /* use_next_gate_w_4 */ false);

        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](MulQuadData& d) { d.a += fr(1); });
    test_invalid([](MulQuadData& d) { d.b += fr(1); });
    test_invalid([](MulQuadData& d) { d.c += fr(1); });
    test_invalid([](MulQuadData& d) { d.d += fr(1); });

    // Test scaling coefficient failures
    test_invalid([](MulQuadData& d) { d.mul_scaling += fr(1); });
    test_invalid([](MulQuadData& d) { d.a_scaling += fr(1); });
    test_invalid([](MulQuadData& d) { d.b_scaling += fr(1); });
    test_invalid([](MulQuadData& d) { d.c_scaling += fr(1); });
    test_invalid([](MulQuadData& d) { d.d_scaling += fr(1); });
    test_invalid([](MulQuadData& d) { d.const_scaling += fr(1); });
}

// Verifies that q_arith = 2 mode works with big_mul_add_gate
TEST_F(UltraCircuitBuilderArithmetic, BigMulAddGateWithNextRowW4)
{
    UltraCircuitBuilder builder;

    // Constraint: a * b + c + d + next_w_4 = 0
    fr a(3);
    fr b(5);
    fr c(7);
    fr next_w_4(11);
    fr d = -(a * b + c + next_w_4);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(fr(13));

    // Note: mul_scaling is also adjusted for q_arith = 2 mode
    builder.create_big_mul_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(0), fr(0), fr(1), fr(1), fr(0) },
                                    /* use_next_gate_w_4 */ true);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that q_arith = 2 mode fails when w_4_shift value is incorrect for big_mul_add_gate
TEST_F(UltraCircuitBuilderArithmetic, BigMulAddGateWithNextRowW4Failure)
{
    UltraCircuitBuilder builder;

    // Set up the same as above but with WRONG d value
    fr a(3);
    fr b(5);
    fr c(7);
    fr next_w_4(11);
    fr d = -(a * b + c + next_w_4) + fr(1); // INCORRECT: off by 1

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(fr(13));

    builder.create_big_mul_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(0), fr(0), fr(1), fr(1), fr(0) },
                                    /* use_next_gate_w_4 */ true);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_FALSE(CircuitChecker::check(builder));
}

// Verifies that create_bool_gate works for boolean values (0 and 1)
TEST_F(UltraCircuitBuilderArithmetic, BoolGate)
{
    // Test that 0 passes
    {
        UltraCircuitBuilder builder;
        uint32_t zero_idx = builder.add_variable(fr(0));
        builder.create_bool_gate(zero_idx);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Test that 1 passes
    {
        UltraCircuitBuilder builder;
        uint32_t one_idx = builder.add_variable(fr(1));
        builder.create_bool_gate(one_idx);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

// Verifies that create_bool_gate fails for non-boolean values
TEST_F(UltraCircuitBuilderArithmetic, BoolGateFailure)
{
    // Test that 2 fails
    {
        UltraCircuitBuilder builder;
        uint32_t two_idx = builder.add_variable(fr(2));
        builder.create_bool_gate(two_idx);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }

    // Test that -1 fails
    {
        UltraCircuitBuilder builder;
        uint32_t neg_one_idx = builder.add_variable(fr(-1));
        builder.create_bool_gate(neg_one_idx);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

// Verifies that q_arith = 3 mode works for pure addition (no multiplication term)
// In q_arith=3 mode, multiplication is disabled and both subrelations are active:
// Subrelation 1: [q_1*w_1 + q_2*w_2 + q_3*w_3 + q_4*w_4 + q_c + 2*w_4_shift] * 3 = 0
// Subrelation 2: [w_1 + w_4 - w_1_shift + q_m] * 6 = 0
//
// BOTH subrelations must be satisfied simultaneously!
TEST_F(UltraCircuitBuilderArithmetic, QArith3Basic)
{
    UltraCircuitBuilder builder;

    QArith3Data data{
        .w_1 = fr(10), .w_2 = fr(5), .w_3 = fr(7), .w_4 = fr(20), .w_1_next = fr(50), .w_4_next = fr(3),
        // No modifiers - both subrelations will be satisfied
    };

    create_q_arith_3_gate(builder, data);
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that q_arith = 3 mode fails when primary subrelation is violated
TEST_F(UltraCircuitBuilderArithmetic, QArith3PrimarySubrelationFailure)
{
    UltraCircuitBuilder builder;

    QArith3Data data{
        .w_1 = fr(10),
        .w_2 = fr(5),
        .w_3 = fr(7),
        .w_4 = fr(20),
        .w_1_next = fr(30),
        .w_4_next = fr(3),
        .q_m_modifier = fr(0), // Secondary subrelation still satisfied
        .q_c_modifier = fr(1), // Primary subrelation violated: off by 1
    };

    create_q_arith_3_gate(builder, data);
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// Verifies that q_arith = 3 mode fails when secondary subrelation is violated
TEST_F(UltraCircuitBuilderArithmetic, QArith3SecondarySubrelationFailure)
{
    UltraCircuitBuilder builder;

    QArith3Data data{
        .w_1 = fr(15),
        .w_2 = fr(8),
        .w_3 = fr(12),
        .w_4 = fr(25),
        .w_1_next = fr(50),
        .w_4_next = fr(5),
        .q_m_modifier = fr(1), // Secondary subrelation violated: off by 1
        .q_c_modifier = fr(0), // Primary subrelation still satisfied
    };

    create_q_arith_3_gate(builder, data);
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// ========================================
// 2. EDGE CASES WITH SPECIAL VALUES
// ========================================

// Verifies that multiplication by zero works correctly
TEST_F(UltraCircuitBuilderArithmetic, MultiplicationByZero)
{
    UltraCircuitBuilder builder;

    // Test: 0 * 5 = 0
    fr zero = fr(0);
    fr five = fr(5);
    fr result = fr(0);

    uint32_t zero_idx = builder.add_variable(zero);
    uint32_t five_idx = builder.add_variable(five);
    uint32_t result_idx = builder.add_variable(result);

    // q_m * w_1 * w_2 + q_o * w_3 = 0, where w_1=0, w_2=5, w_3=0
    builder.create_arithmetic_gate({ zero_idx, five_idx, result_idx, fr(1), fr(0), fr(0), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that using constant variables in arithmetic gates works
TEST_F(UltraCircuitBuilderArithmetic, ConstantVariablesInGates)
{
    UltraCircuitBuilder builder;

    // Create constant variables
    uint32_t const_5 = builder.put_constant_variable(fr(5));
    uint32_t const_7 = builder.put_constant_variable(fr(7));

    // Use them in an arithmetic gate: 5 + 7 = 12
    fr result = fr(12);
    uint32_t result_idx = builder.add_variable(result);

    builder.create_add_gate({ const_5, const_7, result_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that fixed witnesses work correctly in arithmetic constraints
TEST_F(UltraCircuitBuilderArithmetic, FixedWitnessInArithmeticGate)
{
    UltraCircuitBuilder builder;

    // Create a variable with the correct value, then fix it
    uint32_t a_idx = builder.add_variable(fr(10)); // Create with correct value
    builder.fix_witness(a_idx, fr(10));            // Fix it to ensure it stays 10

    // Create another variable
    fr b = fr(15);
    uint32_t b_idx = builder.add_variable(b);

    // Result should be 10 + 15 = 25
    fr result = fr(25);
    uint32_t result_idx = builder.add_variable(result);

    builder.create_add_gate({ a_idx, b_idx, result_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies behavior with field boundary values (large values near modulus)
TEST_F(UltraCircuitBuilderArithmetic, FieldBoundaryValues)
{
    UltraCircuitBuilder builder;

    // Test with -1 (which is modulus - 1 in field arithmetic)
    fr minus_one = fr(-1);
    fr one = fr(1);
    fr zero = fr(0);

    uint32_t minus_one_idx = builder.add_variable(minus_one);
    uint32_t one_idx = builder.add_variable(one);
    uint32_t zero_idx = builder.add_variable(zero);

    // -1 + 1 = 0
    builder.create_add_gate({ minus_one_idx, one_idx, zero_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that all-zero gates pass (trivial constraint)
TEST_F(UltraCircuitBuilderArithmetic, AllZeroGate)
{
    UltraCircuitBuilder builder;

    uint32_t zero = builder.zero_idx();

    // All wires zero, all scalings zero: 0*0 + 0*0 + 0*0 + 0*0 + 0 = 0
    builder.create_arithmetic_gate({ zero, zero, zero, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// ========================================
// 3. SCALING FACTOR EDGE CASES
// ========================================

// Verifies that zero scaling factors effectively disable wires
TEST_F(UltraCircuitBuilderArithmetic, ZeroScalingFactors)
{
    UltraCircuitBuilder builder;

    // Even though a=5 and b=7, if their scalings are 0, only c matters
    fr a(5);
    fr b(7);
    fr c(0); // Only this needs to be correct

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // 0*a + 0*b + (-1)*c = 0, so c must be 0
    builder.create_add_gate({ a_idx, b_idx, c_idx, fr(0), fr(0), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies multiplication-only gate (no linear terms)
TEST_F(UltraCircuitBuilderArithmetic, MultiplicationOnlyNoLinearTerms)
{
    UltraCircuitBuilder builder;

    // Pure multiplication: a * b = c, with no linear terms
    fr a(6);
    fr b(7);
    fr c = a * b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // q_m * a * b + q_o * c = 0
    builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, fr(1), fr(0), fr(0), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies cancellation with opposite scaling factors
TEST_F(UltraCircuitBuilderArithmetic, CancellationWithOppositeScalings)
{
    UltraCircuitBuilder builder;

    // Same variable with opposite scalings: a - a = 0
    fr a(42);
    uint32_t a_idx = builder.add_variable(a);
    uint32_t zero = builder.zero_idx();

    // a*1 + a*(-1) + 0 = 0
    builder.create_add_gate({ a_idx, a_idx, zero, fr(1), fr(-1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// ========================================
// 4. VARIABLE REUSE PATTERNS
// ========================================

// Verifies zero_idx() in various wire positions
TEST_F(UltraCircuitBuilderArithmetic, ZeroIndexInMultiplePositions)
{
    UltraCircuitBuilder builder;

    uint32_t zero = builder.zero_idx();
    fr a(10);
    fr b(20);
    fr c = a + b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // Test with zero in different positions
    // Position 1 (w_1): 0 + b = result
    {
        fr result = b;
        uint32_t result_idx = builder.add_variable(result);
        builder.create_add_gate({ zero, b_idx, result_idx, fr(1), fr(1), fr(-1), fr(0) });
    }

    // Position 2 (w_2): a + 0 = result
    {
        fr result = a;
        uint32_t result_idx = builder.add_variable(result);
        builder.create_add_gate({ a_idx, zero, result_idx, fr(1), fr(1), fr(-1), fr(0) });
    }

    // Position 3 (w_3): a + b - 0 = invalid (result can't be zero if a+b != 0)
    // So we test a + b = c normally
    builder.create_add_gate({ a_idx, b_idx, c_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// ========================================
// 5. COMPLEX CONSTRAINT COMBINATIONS
// ========================================

// Verifies gate with all terms active (multiplication + all linear terms + constant)
TEST_F(UltraCircuitBuilderArithmetic, AllTermsActive)
{
    UltraCircuitBuilder builder;

    // q_m*a*b + q_1*a + q_2*b + q_3*c + q_c = 0
    // Example: 2*a*b + 3*a + 5*b + 7*c + 11 = 0
    fr a(2);
    fr b(3);
    fr q_m(2), q_1(3), q_2(5), q_3(7), q_c(11);
    fr c = -(q_m * a * b + q_1 * a + q_2 * b + q_c) / q_3;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, q_m, q_1, q_2, q_3, q_c });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies non-zero constant term with multiplication
TEST_F(UltraCircuitBuilderArithmetic, NonZeroConstantWithMultiplication)
{
    UltraCircuitBuilder builder;

    // a * b + 100 = c
    fr a(5);
    fr b(7);
    fr constant(100);
    fr c = a * b + constant;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // q_m * a * b + q_o * c + q_c = 0
    // 1 * a * b + (-1) * c + 100 = 0
    builder.create_arithmetic_gate({ a_idx, b_idx, c_idx, fr(1), fr(0), fr(0), fr(-1), constant });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies balanced multi-coefficient equation
TEST_F(UltraCircuitBuilderArithmetic, BalancedEquation)
{
    UltraCircuitBuilder builder;

    // 3*a + 5*b = 7*c
    fr a(10);
    fr b(14);
    fr c = (fr(3) * a + fr(5) * b) / fr(7);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // 3*a + 5*b - 7*c = 0
    builder.create_add_gate({ a_idx, b_idx, c_idx, fr(3), fr(5), fr(-7), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies complex big_mul_add_gate with all parameters non-zero
TEST_F(UltraCircuitBuilderArithmetic, BigMulAddAllParametersNonZero)
{
    UltraCircuitBuilder builder;

    // mul_scaling * a * b + a_scaling * a + b_scaling * b + c_scaling * c + d_scaling * d + const = 0
    fr mul_scaling(2);
    fr a_scaling(3);
    fr b_scaling(5);
    fr c_scaling(7);
    fr d_scaling(11);
    fr const_scaling(13);

    fr a(2);
    fr b(3);
    fr c(4);

    // Solve for d: d = -(mul*a*b + a_s*a + b_s*b + c_s*c + const) / d_s
    fr d = -(mul_scaling * a * b + a_scaling * a + b_scaling * b + c_scaling * c + const_scaling) / d_scaling;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);

    builder.create_big_mul_add_gate(
        { a_idx, b_idx, c_idx, d_idx, mul_scaling, a_scaling, b_scaling, c_scaling, d_scaling, const_scaling },
        /* use_next_gate_w_4 */ false);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// ========================================
// 6. INTERPLAY WITH CIRCUIT MECHANISMS
// ========================================

// Verifies that assert_equal works correctly with arithmetic constraints
TEST_F(UltraCircuitBuilderArithmetic, AssertEqualWithArithmetic)
{
    UltraCircuitBuilder builder;

    // Create two variables
    fr value_a(42);
    fr value_b(42);

    uint32_t a_idx = builder.add_variable(value_a);
    uint32_t b_idx = builder.add_variable(value_b);

    // Assert they're equal
    builder.assert_equal(a_idx, b_idx);

    // Now use them in an arithmetic gate: a + a = 2*a
    fr result = fr(2) * value_a;
    uint32_t result_idx = builder.add_variable(result);

    // Because a == b, we can use either
    builder.create_add_gate({ a_idx, b_idx, result_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies public input variables work in arithmetic gates
TEST_F(UltraCircuitBuilderArithmetic, PublicInputInArithmetic)
{
    UltraCircuitBuilder builder;

    // Add a public input
    fr public_value(100);
    uint32_t public_idx = builder.add_public_variable(public_value);

    // Use it in an arithmetic constraint
    fr private_value(50);
    fr result = public_value + private_value;

    uint32_t private_idx = builder.add_variable(private_value);
    uint32_t result_idx = builder.add_variable(result);

    // public + private = result
    builder.create_add_gate({ public_idx, private_idx, result_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

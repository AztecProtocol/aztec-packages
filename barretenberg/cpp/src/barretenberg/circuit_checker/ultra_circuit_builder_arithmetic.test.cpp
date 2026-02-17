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
 * Note: q_arith=3 mode is also tested via direct builder access since it is only used internally via the non-native
 * field gate methods.
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

    // Create gate that enforces: a + b = c
    static AddTripleData create_add_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a + b;
        return { a, b, c, fr(1), fr(1), fr(-1), fr(0) };
    }

    // Create gate that enforces: d = a + b + c
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
        builder.create_big_add_gate({ builder.add_variable(data.a),
                                      builder.add_variable(data.b),
                                      builder.add_variable(data.c),
                                      builder.add_variable(data.d),
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
    builder.create_arithmetic_gate({ builder.add_variable(data.a),
                                     builder.add_variable(data.b),
                                     builder.add_variable(data.c),
                                     data.q_m,
                                     data.q_l,
                                     data.q_r,
                                     data.q_o,
                                     data.q_c });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or selector coefficient in a arithmetic gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, ArithmeticGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_arithmetic_triple_data(5, 7);
        modify_data(data);
        builder.create_arithmetic_gate({ builder.add_variable(data.a),
                                         builder.add_variable(data.b),
                                         builder.add_variable(data.c),
                                         data.q_m,
                                         data.q_l,
                                         data.q_r,
                                         data.q_o,
                                         data.q_c });
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

    builder.create_arithmetic_gate({ builder.add_variable(a),
                                     builder.add_variable(b),
                                     builder.add_variable(c),
                                     fr(3),
                                     fr(5),
                                     fr(-2),
                                     fr(-1),
                                     fr(0) });
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

    // create_big_mul_add_gate with include_next_gate_w_4=false uses q_arith=1
    builder.create_big_mul_add_gate({ builder.add_variable(a),
                                      builder.add_variable(b),
                                      builder.add_variable(c),
                                      builder.add_variable(d),
                                      fr(1),
                                      fr(0),
                                      fr(0),
                                      fr(1),
                                      fr(1),
                                      fr(0) },
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
        builder.create_big_mul_add_gate({ builder.add_variable(data.a),
                                          builder.add_variable(data.b),
                                          builder.add_variable(data.c),
                                          builder.add_variable(data.d),
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

// Verifies q_arith = 3 mode with both subrelations satisfied, and failures when tampered
// When q_arith=3 mode, multiplication is disabled and two subrelations are active:
// Subrelation 1 (primary): [q_1*w_1 + q_2*w_2 + q_3*w_3 + q_4*w_4 + q_c + 2*w_4_shift] * 3 = 0
// Subrelation 2 (secondary): [w_1 + w_4 - w_1_shift + q_m] * 6 = 0
TEST_F(UltraCircuitBuilderArithmetic, QArith3Gate)
{
    auto build_and_check = [](auto modify_fn, bool expect_valid) {
        UltraCircuitBuilder builder;

        // Baseline wire values
        fr w_1(10);
        fr w_2(5);
        fr w_3(7);
        fr w_4(20);
        fr w_1_next(30);
        fr w_4_next(3);

        // Compute selectors to satisfy both subrelations
        fr q_m = w_1_next - w_1 - w_4;
        const fr scale = fr(2);
        fr q_1 = scale;
        fr q_2 = scale;
        fr q_3 = scale;
        fr q_4 = scale;
        fr q_c = -(q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + fr(2) * w_4_next);

        // Apply modification (if any)
        modify_fn(w_1, w_2, w_3, w_4, w_1_next, w_4_next, q_m, q_1, q_2, q_3, q_4, q_c);

        uint32_t w1_idx = builder.add_variable(w_1);
        uint32_t w2_idx = builder.add_variable(w_2);
        uint32_t w3_idx = builder.add_variable(w_3);
        uint32_t w4_idx = builder.add_variable(w_4);
        uint32_t w1_next_idx = builder.add_variable(w_1_next);
        uint32_t w4_next_idx = builder.add_variable(w_4_next);

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

        // Gate 2: provides w_1_shift and w_4_shift
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

        if (expect_valid) {
            EXPECT_TRUE(CircuitChecker::check(builder));
        } else {
            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    };

    // Test baseline: no modifications, should pass
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&) {}, true);

    // Test witness failures (affect primary subrelation)
    build_and_check([](fr& w_1, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&) { w_1 += fr(1); }, false);
    build_and_check([](fr&, fr& w_2, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&) { w_2 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr& w_3, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&) { w_3 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr& w_4, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&) { w_4 += fr(1); }, false);

    // Test shift wire failures
    build_and_check([](fr&, fr&, fr&, fr&, fr& w_1_next, fr&, fr&, fr&, fr&, fr&, fr&, fr&) { w_1_next += fr(1); },
                    false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr& w_4_next, fr&, fr&, fr&, fr&, fr&, fr&) { w_4_next += fr(1); },
                    false);

    // Test selector failures
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr& q_m, fr&, fr&, fr&, fr&, fr&) { q_m += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr& q_1, fr&, fr&, fr&, fr&) { q_1 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr& q_2, fr&, fr&, fr&) { q_2 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr& q_3, fr&, fr&) { q_3 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr& q_4, fr&) { q_4 += fr(1); }, false);
    build_and_check([](fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr&, fr& q_c) { q_c += fr(1); }, false);
}

// Verifies that multiplication by zero works correctly
TEST_F(UltraCircuitBuilderArithmetic, MultiplicationByZero)
{
    UltraCircuitBuilder builder;

    // Test: 0 * 5 = 0
    fr zero = fr(0);
    fr five = fr(5);
    fr result = fr(0);

    // q_m * w_1 * w_2 + q_o * w_3 = 0, where w_1=0, w_2=5, w_3=0
    builder.create_arithmetic_gate({ builder.add_variable(zero),
                                     builder.add_variable(five),
                                     builder.add_variable(result),
                                     fr(1),
                                     fr(0),
                                     fr(0),
                                     fr(-1),
                                     fr(0) });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that using fixed witnesses in arithmetic gates works
TEST_F(UltraCircuitBuilderArithmetic, FixedWitnessesInGates)
{
    UltraCircuitBuilder builder;

    // Create fixed witnesses in two different ways
    uint32_t const_5 = builder.put_constant_variable(fr(5));
    uint32_t const_7 = builder.add_variable(fr(7));
    builder.fix_witness(const_7, fr(7)); // Fix it to ensure it stays 7

    // Use them in an arithmetic gate: 5 + 7 = 12
    fr result = fr(12);
    uint32_t result_idx = builder.add_variable(result);

    builder.create_add_gate({ const_5, const_7, result_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies behavior with field boundary values (values near modulus)
TEST_F(UltraCircuitBuilderArithmetic, FieldBoundaryValues)
{
    UltraCircuitBuilder builder;

    // Test with -1 (modulus - 1 in field)
    fr minus_one = fr(-1);
    fr one = fr(1);
    fr zero = fr(0);

    // -1 + 1 = 0
    builder.create_add_gate({ builder.add_variable(minus_one),
                              builder.add_variable(one),
                              builder.add_variable(zero),
                              fr(1),
                              fr(1),
                              fr(-1),
                              fr(0) });
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

// Verifies that builder.zero_idx() works as expected in gates
TEST_F(UltraCircuitBuilderArithmetic, ZeroIdx)
{
    UltraCircuitBuilder builder;

    // Even though a=5 and b=7, if their scalings are 0, only c matters
    fr a(5);
    fr b(7);

    // 1*5 + 1*7 + 1*c = 12, so c must be 0
    builder.create_add_gate(
        { builder.add_variable(a), builder.add_variable(b), builder.zero_idx(), fr(1), fr(1), fr(1), fr(-12) });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that zero scaling factors effectively disable wires
TEST_F(UltraCircuitBuilderArithmetic, ZeroScalingFactors)
{
    UltraCircuitBuilder builder;

    // Even though a=5 and b=7, if their scalings are 0, only c matters
    fr a(5);
    fr b(7);
    fr c(0); // Only this needs to be correct

    // 0*a + 0*b + (-1)*c = 0, so c must be 0
    builder.create_add_gate(
        { builder.add_variable(a), builder.add_variable(b), builder.add_variable(c), fr(0), fr(0), fr(-1), fr(0) });
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

    builder.create_big_mul_add_gate({ builder.add_variable(a),
                                      builder.add_variable(b),
                                      builder.add_variable(c),
                                      builder.add_variable(d),
                                      mul_scaling,
                                      a_scaling,
                                      b_scaling,
                                      c_scaling,
                                      d_scaling,
                                      const_scaling },
                                    /* use_next_gate_w_4 */ false);
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

    // public + private = result
    builder.create_add_gate(
        { public_idx, builder.add_variable(private_value), builder.add_variable(result), fr(1), fr(1), fr(-1), fr(0) });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

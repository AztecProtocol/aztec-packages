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
 *
 */
class UltraCircuitBuilderArithmetic : public ::testing::Test {
  protected:
    // Helper structs to set up gate data
    struct AddTripleData {
        fr a, b, c;
        fr a_scaling, b_scaling, c_scaling, const_scaling;
    };

    struct MulTripleData {
        fr a, b, c;
        fr mul_scaling, c_scaling, const_scaling;
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

// ===== Q_ARITH MODE TESTS =====

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
    // Note: The scalings are automatically adjusted by the builder for q_arith = 2 mode
    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(1), fr(0) },
                                true /* use_next_gate_w_4 */);

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
                                true /* use_next_gate_w_4 */);

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
                                    false /* use_next_gate_w_4 */);

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
                                        false /* use_next_gate_w_4 */);

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
                                    true /* use_next_gate_w_4 */);

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
                                    true /* use_next_gate_w_4 */);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_FALSE(CircuitChecker::check(builder));
}

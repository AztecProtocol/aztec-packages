#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

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

    struct PolyTripleData {
        fr a, b, c;
        fr q_m, q_l, q_r, q_o, q_c;
    };

    static AddTripleData create_add_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a + b;
        return { a, b, c, fr(1), fr(1), fr(-1), fr(0) };
    }

    static MulTripleData create_mul_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a * b;
        return { a, b, c, fr(1), fr(-1), fr(0) };
    }

    static AddQuadData create_add_quad_data(uint64_t a_val = 3, uint64_t b_val = 5, uint64_t c_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c(c_val);
        fr d = a + b + c;
        return { a, b, c, d, fr(1), fr(1), fr(1), fr(-1), fr(0) };
    }

    static MulQuadData create_mul_quad_data(uint64_t a_val = 5, uint64_t b_val = 7, uint64_t c_val = 3)
    {
        fr a(a_val);
        fr b(b_val);
        fr c(c_val);
        fr d = a * b + c;
        return { a, b, c, d, fr(1), fr(0), fr(0), fr(1), fr(-1), fr(0) };
    }

    static PolyTripleData create_poly_triple_data(uint64_t a_val = 5, uint64_t b_val = 7)
    {
        fr a(a_val);
        fr b(b_val);
        fr c = a * b + fr(2) * a + fr(3) * b;
        return { a, b, c, fr(1), fr(2), fr(3), fr(-1), fr(0) };
    }
};

// ===== ADD GATE TESTS =====

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

// ===== MUL GATE TESTS =====

// Verifies that a valid 3-wire multiplication gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, MulGate)
{
    UltraCircuitBuilder builder;
    auto data = create_mul_triple_data(5, 7);
    builder.create_mul_gate({ builder.add_variable(data.a),
                              builder.add_variable(data.b),
                              builder.add_variable(data.c),
                              data.mul_scaling,
                              data.c_scaling,
                              data.const_scaling });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or scaling coefficient in a mul gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, MulGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_mul_triple_data(5, 7);
        modify_data(data);
        builder.create_mul_gate({ builder.add_variable(data.a),
                                  builder.add_variable(data.b),
                                  builder.add_variable(data.c),
                                  data.mul_scaling,
                                  data.c_scaling,
                                  data.const_scaling });
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](MulTripleData& d) { d.a += fr(1); });
    test_invalid([](MulTripleData& d) { d.b += fr(1); });
    test_invalid([](MulTripleData& d) { d.c += fr(1); });

    // Test scaling coefficient failures
    test_invalid([](MulTripleData& d) { d.mul_scaling += fr(1); });
    test_invalid([](MulTripleData& d) { d.c_scaling += fr(1); });
    test_invalid([](MulTripleData& d) { d.const_scaling += fr(1); });
}

// ===== BIG ADD GATE TESTS =====

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

// ===== BIG MUL GATE TESTS =====

// Verifies that a valid 4-wire multiplication gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, BigMulGate)
{
    UltraCircuitBuilder builder;
    auto data = create_mul_quad_data(5, 7, 3);

    uint32_t a_idx = builder.add_variable(data.a);
    uint32_t b_idx = builder.add_variable(data.b);
    uint32_t c_idx = builder.add_variable(data.c);
    uint32_t d_idx = builder.add_variable(data.d);

    builder.create_big_mul_gate({ a_idx,
                                  b_idx,
                                  c_idx,
                                  d_idx,
                                  data.mul_scaling,
                                  data.a_scaling,
                                  data.b_scaling,
                                  data.c_scaling,
                                  data.d_scaling,
                                  data.const_scaling });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or scaling coefficient in a big mul gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, BigMulGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_mul_quad_data(5, 7, 3);
        modify_data(data);

        uint32_t a_idx = builder.add_variable(data.a);
        uint32_t b_idx = builder.add_variable(data.b);
        uint32_t c_idx = builder.add_variable(data.c);
        uint32_t d_idx = builder.add_variable(data.d);

        builder.create_big_mul_gate({ a_idx,
                                      b_idx,
                                      c_idx,
                                      d_idx,
                                      data.mul_scaling,
                                      data.a_scaling,
                                      data.b_scaling,
                                      data.c_scaling,
                                      data.d_scaling,
                                      data.const_scaling });

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

// ===== POLY GATE TESTS =====

// Verifies that a valid polynomial gate passes the circuit checker
TEST_F(UltraCircuitBuilderArithmetic, PolyGate)
{
    UltraCircuitBuilder builder;
    auto data = create_poly_triple_data(5, 7);

    uint32_t a_idx = builder.add_variable(data.a);
    uint32_t b_idx = builder.add_variable(data.b);
    uint32_t c_idx = builder.add_variable(data.c);

    builder.create_poly_gate({ a_idx, b_idx, c_idx, data.q_m, data.q_l, data.q_r, data.q_o, data.q_c });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any variable or selector coefficient in a poly gate causes failure
TEST_F(UltraCircuitBuilderArithmetic, PolyGateFailure)
{
    auto test_invalid = [](auto modify_data) {
        UltraCircuitBuilder builder;
        auto data = create_poly_triple_data(5, 7);
        modify_data(data);

        uint32_t a_idx = builder.add_variable(data.a);
        uint32_t b_idx = builder.add_variable(data.b);
        uint32_t c_idx = builder.add_variable(data.c);

        builder.create_poly_gate({ a_idx, b_idx, c_idx, data.q_m, data.q_l, data.q_r, data.q_o, data.q_c });

        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test witness failures
    test_invalid([](PolyTripleData& d) { d.a += fr(1); });
    test_invalid([](PolyTripleData& d) { d.b += fr(1); });
    test_invalid([](PolyTripleData& d) { d.c += fr(1); });

    // Test selector coefficient failures
    test_invalid([](PolyTripleData& d) { d.q_m += fr(1); });
    test_invalid([](PolyTripleData& d) { d.q_l += fr(1); });
    test_invalid([](PolyTripleData& d) { d.q_r += fr(1); });
    test_invalid([](PolyTripleData& d) { d.q_o += fr(1); });
    test_invalid([](PolyTripleData& d) { d.q_c += fr(1); });
}

// Verifies that multiple independent gates can coexist in a circuit
TEST_F(UltraCircuitBuilderArithmetic, MultipleGates)
{
    UltraCircuitBuilder builder;

    // Create three independent operations
    auto add_data = create_add_triple_data(5, 7);
    auto mul_data = create_mul_triple_data(3, 4);
    auto poly_data = create_poly_triple_data(2, 6);

    // Add gate
    uint32_t add_a = builder.add_variable(add_data.a);
    uint32_t add_b = builder.add_variable(add_data.b);
    uint32_t add_c = builder.add_variable(add_data.c);
    builder.create_add_gate(
        { add_a, add_b, add_c, add_data.a_scaling, add_data.b_scaling, add_data.c_scaling, add_data.const_scaling });

    // Mul gate
    uint32_t mul_a = builder.add_variable(mul_data.a);
    uint32_t mul_b = builder.add_variable(mul_data.b);
    uint32_t mul_c = builder.add_variable(mul_data.c);
    builder.create_mul_gate({ mul_a, mul_b, mul_c, mul_data.mul_scaling, mul_data.c_scaling, mul_data.const_scaling });

    // Poly gate
    uint32_t poly_a = builder.add_variable(poly_data.a);
    uint32_t poly_b = builder.add_variable(poly_data.b);
    uint32_t poly_c = builder.add_variable(poly_data.c);
    builder.create_poly_gate(
        { poly_a, poly_b, poly_c, poly_data.q_m, poly_data.q_l, poly_data.q_r, poly_data.q_o, poly_data.q_c });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that poly_gate can handle complex multi-term expressions
TEST_F(UltraCircuitBuilderArithmetic, PolyGateComplexExpression)
{
    UltraCircuitBuilder builder;

    // Polynomial: 3*a*b + 5*a - 2*b = c
    fr a(7);
    fr b(11);
    fr c = fr(3) * a * b + fr(5) * a - fr(2) * b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_poly_gate({ a_idx, b_idx, c_idx, fr(3), fr(5), fr(-2), fr(-1), fr(0) });

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

    // Second gate: simple gate to provide w_4 value for the first gate's w_4_shift
    fr dummy(13);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(dummy);

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

    fr dummy(13);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(dummy);

    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(1), fr(0) },
                                true /* use_next_gate_w_4 */);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_FALSE(CircuitChecker::check(builder));
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

    fr dummy(13);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    uint32_t next_w_4_idx = builder.add_variable(next_w_4);
    uint32_t dummy_idx = builder.add_variable(dummy);

    // Note: mul_scaling is also adjusted for q_arith = 2 mode
    builder.create_big_mul_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(0), fr(0), fr(1), fr(1), fr(0) },
                                    true /* use_next_gate_w_4 */);

    builder.create_big_add_gate({ dummy_idx, dummy_idx, dummy_idx, next_w_4_idx, fr(0), fr(0), fr(0), fr(0), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// ===== EDGE CASE TESTS =====

// Verifies that zero values work correctly in add gates
TEST_F(UltraCircuitBuilderArithmetic, AddGateWithZeros)
{
    UltraCircuitBuilder builder;

    fr a(0);
    fr b(5);
    fr c = a + b; // 5

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_add_gate({ a_idx, b_idx, c_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that zero values work correctly in mul gates
TEST_F(UltraCircuitBuilderArithmetic, MulGateWithZero)
{
    UltraCircuitBuilder builder;

    fr a(0);
    fr b(5);
    fr c = a * b; // 0

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_mul_gate({ a_idx, b_idx, c_idx, fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that identity operations work: a + 0 = a
TEST_F(UltraCircuitBuilderArithmetic, AddIdentity)
{
    UltraCircuitBuilder builder;

    fr a(42);
    fr zero(0);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t zero_idx = builder.add_variable(zero);

    builder.create_add_gate({ a_idx, zero_idx, a_idx, fr(1), fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that multiplication by one works: a * 1 = a
TEST_F(UltraCircuitBuilderArithmetic, MulIdentity)
{
    UltraCircuitBuilder builder;

    fr a(42);
    fr one(1);

    uint32_t a_idx = builder.add_variable(a);
    uint32_t one_idx = builder.add_variable(one);

    builder.create_mul_gate({ a_idx, one_idx, a_idx, fr(1), fr(-1), fr(0) });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

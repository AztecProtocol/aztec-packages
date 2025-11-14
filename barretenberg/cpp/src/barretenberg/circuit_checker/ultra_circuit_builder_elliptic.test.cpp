#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

class UltraCircuitBuilderElliptic : public ::testing::Test {
  protected:
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;

    // Helper to create points for addition/subtraction: (p1, p2, p1 ± p2)
    struct AdditionPoints {
        affine_element p1, p2, result;
    };

    // Helper to create points for doubling: (p1, 2*p1)
    struct DoublingPoints {
        affine_element p1, result;
    };

    static AdditionPoints create_add_points(uint64_t seed1 = 1, uint64_t seed2 = 2, bool is_addition = true)
    {
        affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(seed1) }, 0);
        affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(seed2) }, 0);
        affine_element result =
            is_addition ? affine_element(element(p1) + element(p2)) : affine_element(element(p1) - element(p2));
        return { p1, p2, result };
    }

    static DoublingPoints create_dbl_points(uint64_t seed = 1)
    {
        affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(seed) }, 0);
        affine_element result(element(p1).dbl());
        return { p1, result };
    }

    // Add all variables for an add gate and return wire indices as tuple
    static auto add_add_gate_variables(UltraCircuitBuilder& builder, const AdditionPoints& points)
    {
        return std::make_tuple(builder.add_variable(points.p1.x),
                               builder.add_variable(points.p1.y),
                               builder.add_variable(points.p2.x),
                               builder.add_variable(points.p2.y),
                               builder.add_variable(points.result.x),
                               builder.add_variable(points.result.y));
    }

    // Add all variables for a dbl gate and return wire indices as tuple
    static auto add_dbl_gate_variables(UltraCircuitBuilder& builder, const DoublingPoints& points)
    {
        return std::make_tuple(builder.add_variable(points.p1.x),
                               builder.add_variable(points.p1.y),
                               builder.add_variable(points.result.x),
                               builder.add_variable(points.result.y));
    }
};

// Verifies that a valid elliptic curve point addition passes the circuit checker.
TEST_F(UltraCircuitBuilderElliptic, Addition)
{
    UltraCircuitBuilder builder;
    auto points = create_add_points(1, 2, true);

    auto [x1, y1, x2, y2, x3, y3] = add_add_gate_variables(builder, points);
    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any coordinate in an addition operation causes the circuit checker to fail.
TEST_F(UltraCircuitBuilderElliptic, AdditionFailure)
{
    auto test_invalid_coordinate = [](auto modify_points) {
        UltraCircuitBuilder builder;
        auto points = create_add_points(1, 2, true);
        modify_points(points);
        auto [x1, y1, x2, y2, x3, y3] = add_add_gate_variables(builder, points);
        builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    test_invalid_coordinate([](AdditionPoints& p) { p.p1.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p1.y += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p2.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p2.y += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.result.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.result.y += bb::fr(1); });
}

// Verifies that a valid elliptic curve point subtraction passes the circuit checker.
TEST_F(UltraCircuitBuilderElliptic, Subtraction)
{
    UltraCircuitBuilder builder;
    auto points = create_add_points(1, 2, false); // false = subtraction
    auto [x1, y1, x2, y2, x3, y3] = add_add_gate_variables(builder, points);
    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, -1 });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any coordinate in a subtraction operation causes the circuit checker to fail.
TEST_F(UltraCircuitBuilderElliptic, SubtractionFailure)
{
    auto test_invalid_coordinate = [](auto modify_points) {
        UltraCircuitBuilder builder;
        auto points = create_add_points(1, 2, /*is_addition=*/false);
        modify_points(points);
        auto [x1, y1, x2, y2, x3, y3] = add_add_gate_variables(builder, points);
        builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*sign_coefficient=*/-1 });
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    test_invalid_coordinate([](AdditionPoints& p) { p.p1.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p1.y += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p2.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.p2.y += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.result.x += bb::fr(1); });
    test_invalid_coordinate([](AdditionPoints& p) { p.result.y += bb::fr(1); });
}

// Verifies that a valid elliptic curve point doubling passes the circuit checker.
TEST_F(UltraCircuitBuilderElliptic, Double)
{
    UltraCircuitBuilder builder;
    auto points = create_dbl_points(1);

    auto [x1, y1, x3, y3] = add_dbl_gate_variables(builder, points);
    builder.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating any coordinate in a doubling operation causes the circuit checker to fail.
TEST_F(UltraCircuitBuilderElliptic, DoubleFailure)
{
    auto test_invalid_coordinate = [](auto modify_points) {
        UltraCircuitBuilder builder;
        auto points = create_dbl_points(1);
        modify_points(points);
        auto [x1, y1, x3, y3] = add_dbl_gate_variables(builder, points);
        builder.create_ecc_dbl_gate({ x1, y1, x3, y3 });
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    test_invalid_coordinate([](DoublingPoints& p) { p.p1.x += bb::fr(1); });
    test_invalid_coordinate([](DoublingPoints& p) { p.p1.y += bb::fr(1); });
    test_invalid_coordinate([](DoublingPoints& p) { p.result.x += bb::fr(1); });
    test_invalid_coordinate([](DoublingPoints& p) { p.result.y += bb::fr(1); });
}

// Verifies that multiple independent elliptic curve operations can coexist in a circuit.
TEST_F(UltraCircuitBuilderElliptic, MultipleOperationsUnchained)
{
    UltraCircuitBuilder builder;

    // Create three different operations
    auto add_points = create_add_points(1, 2, true);
    auto sub_points = create_add_points(1, 3, false);
    auto dbl_points = create_dbl_points(2);

    // Add all gates
    auto [add_x1, add_y1, add_x2, add_y2, add_x3, add_y3] = add_add_gate_variables(builder, add_points);
    auto [sub_x1, sub_y1, sub_x2, sub_y2, sub_x3, sub_y3] = add_add_gate_variables(builder, sub_points);
    auto [dbl_x1, dbl_y1, dbl_x3, dbl_y3] = add_dbl_gate_variables(builder, dbl_points);

    builder.create_ecc_add_gate({ add_x1, add_y1, add_x2, add_y2, add_x3, add_y3, /*sign_coefficient=*/1 });
    builder.create_ecc_add_gate({ sub_x1, sub_y1, sub_x2, sub_y2, sub_x3, sub_y3, /*sign_coefficient=*/-1 });
    builder.create_ecc_dbl_gate({ dbl_x1, dbl_y1, dbl_x3, dbl_y3 });

    EXPECT_EQ(builder.blocks.elliptic.size(), 6UL); // 3 unchained operations, 2 gates each
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that chaining two operations by reusing intermediate results reduces the gate count.
TEST_F(UltraCircuitBuilderElliptic, ChainedOperations)
{
    UltraCircuitBuilder builder;

    // First addition: p1 + p2 = temp
    auto first_add = create_add_points(1, 2, true);

    // Second addition: temp + p3 = result
    affine_element p3 = crypto::pedersen_commitment::commit_native({ bb::fr(3) }, 0);
    affine_element result(element(first_add.result) + element(p3));

    // Add variables for first operation
    auto [x1, y1, x2, y2, x_temp, y_temp] = add_add_gate_variables(builder, first_add);

    // Add variables for second operation
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);
    uint32_t x_result = builder.add_variable(result.x);
    uint32_t y_result = builder.add_variable(result.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x_temp, y_temp, /*sign_coefficient=*/1 });
    builder.create_ecc_add_gate({ x_temp, y_temp, x3, y3, x_result, y_result, /*sign_coefficient=*/1 });

    EXPECT_EQ(builder.blocks.elliptic.size(), 3UL); // 2 chained operations = 2 + (2 - 1) gates
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that a chain of three operations (add-double-add) correctly reuses intermediate results.
TEST_F(UltraCircuitBuilderElliptic, ChainedOperationsWithDouble)
{
    UltraCircuitBuilder builder;

    // Chain: p1 + p2 = temp1, then 2*temp1 = temp2, then temp2 + p3 = result
    auto first_add = create_add_points(1, 2, true);
    affine_element temp1 = first_add.result;

    // Double temp1
    affine_element temp2(element(temp1).dbl());

    // Add p3 to temp2
    affine_element p3 = crypto::pedersen_commitment::commit_native({ bb::fr(3) }, 0);
    affine_element result(element(temp2) + element(p3));

    // Add variables for first operation (addition)
    auto [x1, y1, x2, y2, x_temp1, y_temp1] = add_add_gate_variables(builder, first_add);

    // Add variables for second operation (doubling)
    uint32_t x_temp2 = builder.add_variable(temp2.x);
    uint32_t y_temp2 = builder.add_variable(temp2.y);

    // Add variables for third operation (addition)
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);
    uint32_t x_result = builder.add_variable(result.x);
    uint32_t y_result = builder.add_variable(result.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x_temp1, y_temp1, /*sign_coefficient=*/1 });
    builder.create_ecc_dbl_gate({ x_temp1, y_temp1, x_temp2, y_temp2 });
    builder.create_ecc_add_gate({ x_temp2, y_temp2, x3, y3, x_result, y_result, /*sign_coefficient=*/1 });

    EXPECT_EQ(builder.blocks.elliptic.size(), 4UL); // 3 chained operations, 2 + (2 - 1) + (2 - 1) gates
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that invalidating a middle operation in a chain causes circuit checker to fail
TEST_F(UltraCircuitBuilderElliptic, ChainedOperationsDoubleFailure)
{
    UltraCircuitBuilder builder;

    // Chain: p1 + p2 = temp1, then 2*temp1 = temp2 (INVALID), then temp2 + p3 = result
    auto first_add = create_add_points(1, 2, true);
    affine_element temp1 = first_add.result;

    // Double temp1
    affine_element temp2(element(temp1).dbl());
    temp2.x += bb::fr(1); // Invalidate the middle result

    // Add p3 to (invalid) temp2
    affine_element p3 = crypto::pedersen_commitment::commit_native({ bb::fr(3) }, 0);
    affine_element result(element(temp2) + element(p3));

    // Add variables for first operation (addition - valid)
    auto [x1, y1, x2, y2, x_temp1, y_temp1] = add_add_gate_variables(builder, first_add);

    // Add variables for second operation (doubling - INVALID)
    uint32_t x_temp2 = builder.add_variable(temp2.x);
    uint32_t y_temp2 = builder.add_variable(temp2.y);

    // Add variables for third operation (addition)
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);
    uint32_t x_result = builder.add_variable(result.x);
    uint32_t y_result = builder.add_variable(result.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x_temp1, y_temp1, /*sign_coefficient=*/1 });
    builder.create_ecc_dbl_gate({ x_temp1, y_temp1, x_temp2, y_temp2 });
    builder.create_ecc_add_gate({ x_temp2, y_temp2, x3, y3, x_result, y_result, /*sign_coefficient=*/1 });

    EXPECT_EQ(builder.blocks.elliptic.size(), 4UL); // 3 chained operations, 2 + (2 - 1) + (2 - 1) gates
    // Should fail because the middle operation (doubling) has an invalid result
    EXPECT_FALSE(CircuitChecker::check(builder));
}

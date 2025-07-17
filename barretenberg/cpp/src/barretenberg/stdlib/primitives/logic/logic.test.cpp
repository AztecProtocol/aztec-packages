#include <gtest/gtest.h>

#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "logic.hpp"

#pragma GCC diagnostic ignored "-Wunused-local-typedefs"

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Builder = TypeParam;                                                                                         \
    using witness_ct = stdlib::witness_t<Builder>;                                                                     \
    using field_ct = stdlib::field_t<Builder>;                                                                         \
    using bool_ct = stdlib::bool_t<Builder>;                                                                           \
    using public_witness_ct = stdlib::public_witness_t<Builder>;
using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <class T> void ignore_unused(T&) {} // use to ignore unused variables in lambdas

template <class Builder> class LogicTest : public testing::Test {};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;

TYPED_TEST_SUITE(LogicTest, CircuitTypes);

TYPED_TEST(LogicTest, TestCorrectLogic)
{
    STDLIB_TYPE_ALIASES

    auto run_test = [](size_t num_bits, Builder& builder) {
        uint256_t mask = (uint256_t(1) << num_bits) - 1;

        uint256_t a = engine.get_random_uint256() & mask;
        uint256_t b = engine.get_random_uint256() & mask;

        uint256_t and_expected = a & b;
        uint256_t xor_expected = a ^ b;

        field_ct x = witness_ct(&builder, a);
        field_ct y = witness_ct(&builder, b);

        field_ct x_const(&builder, a);
        field_ct y_const(&builder, b);

        field_ct and_result = stdlib::logic<Builder>::create_logic_constraint(x, y, num_bits, false);
        field_ct xor_result = stdlib::logic<Builder>::create_logic_constraint(x, y, num_bits, true);

        field_ct and_result_left_constant =
            stdlib::logic<Builder>::create_logic_constraint(x_const, y, num_bits, false);
        field_ct xor_result_left_constant = stdlib::logic<Builder>::create_logic_constraint(x_const, y, num_bits, true);

        field_ct and_result_right_constant =
            stdlib::logic<Builder>::create_logic_constraint(x, y_const, num_bits, false);
        field_ct xor_result_right_constant =
            stdlib::logic<Builder>::create_logic_constraint(x, y_const, num_bits, true);

        field_ct and_result_both_constant =
            stdlib::logic<Builder>::create_logic_constraint(x_const, y_const, num_bits, false);
        field_ct xor_result_both_constant =
            stdlib::logic<Builder>::create_logic_constraint(x_const, y_const, num_bits, true);

        EXPECT_EQ(uint256_t(and_result.get_value()), and_expected);
        EXPECT_EQ(uint256_t(and_result_left_constant.get_value()), and_expected);
        EXPECT_EQ(uint256_t(and_result_right_constant.get_value()), and_expected);
        EXPECT_EQ(uint256_t(and_result_both_constant.get_value()), and_expected);

        EXPECT_EQ(uint256_t(xor_result.get_value()), xor_expected);
        EXPECT_EQ(uint256_t(xor_result_left_constant.get_value()), xor_expected);
        EXPECT_EQ(uint256_t(xor_result_right_constant.get_value()), xor_expected);
        EXPECT_EQ(uint256_t(xor_result_both_constant.get_value()), xor_expected);
    };

    auto builder = Builder();
    for (size_t i = 8; i < 248; i += 8) {
        run_test(i, builder);
    }
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

// Tests the constraints will fail if the operands are larger than expected even though the result contains the correct
// number of bits when using the UltraBuilder This is because the range constraints on the right and left operand
// are not being satisfied.
TYPED_TEST(LogicTest, LargeOperands)
{
    STDLIB_TYPE_ALIASES

    auto builder = Builder();

    uint256_t mask = (uint256_t(1) << 48) - 1;
    uint256_t a = engine.get_random_uint256() & mask;
    uint256_t b = engine.get_random_uint256() & mask;

    uint256_t expected_mask = (uint256_t(1) << 40) - 1;
    uint256_t and_expected = (a & b) & expected_mask;
    uint256_t xor_expected = (a ^ b) & expected_mask;

    field_ct x = witness_ct(&builder, a);
    field_ct y = witness_ct(&builder, b);

    field_ct xor_result = stdlib::logic<Builder>::create_logic_constraint(x, y, 40, true);
    field_ct and_result = stdlib::logic<Builder>::create_logic_constraint(x, y, 40, false);
    EXPECT_EQ(uint256_t(and_result.get_value()), and_expected);
    EXPECT_EQ(uint256_t(xor_result.get_value()), xor_expected);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

// Ensures that malicious witnesses which produce the same result are detected. This potential security issue cannot
// happen if the builder doesn't support lookup gates because constraints will be created for each bit of the left and
// right operand.
TYPED_TEST(LogicTest, DifferentWitnessSameResult)
{

    STDLIB_TYPE_ALIASES
    auto builder = Builder();
    if (HasPlookup<Builder>) {
        uint256_t a = 3758096391;
        uint256_t b = 2147483649;
        field_ct x = witness_ct(&builder, uint256_t(a));
        field_ct y = witness_ct(&builder, uint256_t(b));

        uint256_t xor_expected = a ^ b;
        const std::function<std::pair<uint256_t, uint256_t>(uint256_t, uint256_t, size_t)>& get_bad_chunk =
            [](uint256_t left, uint256_t right, size_t chunk_size) {
                (void)left;
                (void)right;
                (void)chunk_size;
                auto left_chunk = uint256_t(2684354565);
                auto right_chunk = uint256_t(3221225475);
                return std::make_pair(left_chunk, right_chunk);
            };

        field_ct xor_result = stdlib::logic<Builder>::create_logic_constraint(x, y, 32, true, get_bad_chunk);
        EXPECT_EQ(uint256_t(xor_result.get_value()), xor_expected);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
}

// Comprehensive test for all combinations of constants and witnesses
TYPED_TEST(LogicTest, AllConstantWitnessCombinations)
{
    STDLIB_TYPE_ALIASES

    auto test_combination = [](Builder& builder,
                               uint256_t a_val,
                               uint256_t b_val,
                               size_t num_bits,
                               bool is_xor,
                               bool a_is_constant,
                               bool b_is_constant) {
        // Create inputs based on whether they should be constants or witnesses
        field_ct a = a_is_constant ? field_ct(&builder, a_val) : witness_ct(&builder, a_val);
        field_ct b = b_is_constant ? field_ct(&builder, b_val) : witness_ct(&builder, b_val);

        // Calculate expected result
        uint256_t expected;
        if (is_xor) {
            expected = a_val ^ b_val;
        } else {
            expected = a_val & b_val;
        }

        // Apply bit mask to expected result
        uint256_t mask = (uint256_t(1) << num_bits) - 1;
        expected = expected & mask;

        // Create logic constraint
        field_ct result = stdlib::logic<Builder>::create_logic_constraint(a, b, num_bits, is_xor);

        // Verify result
        EXPECT_EQ(uint256_t(result.get_value()), expected)
            << "Failed for " << (is_xor ? "XOR" : "AND") << " with a=" << a_val << " b=" << b_val
            << " bits=" << num_bits << " a_const=" << a_is_constant << " b_const=" << b_is_constant;
    };

    auto builder = Builder();

    // Test various bit sizes (up to 252 bits for grumpkin field)
    std::vector<size_t> bit_sizes = { 1UL, 4UL, 8UL, 16UL, 32UL, 64UL, 128UL, 252UL };

    // Test various input combinations (reduced set for faster testing)
    std::vector<uint256_t> test_values = { 0,
                                           1,
                                           2,
                                           3,
                                           15,
                                           16,
                                           255,
                                           256,
                                           65535,
                                           65536,
                                           (uint256_t(1) << 32) - 1,
                                           (uint256_t(1) << 32),
                                           (uint256_t(1) << 64) - 1,
                                           (uint256_t(1) << 64),
                                           (uint256_t(1) << 128) - 1,
                                           (uint256_t(1) << 128) };

    // Test all combinations: witness-witness, constant-witness, witness-constant, constant-constant
    std::vector<std::pair<bool, bool>> combinations = {
        { false, false }, // witness-witness
        { true, false },  // constant-witness
        { false, true },  // witness-constant
        { true, true }    // constant-constant
    };

    // Test both AND and XOR operations
    std::vector<bool> operations = { false, true }; // false = AND, true = XOR

    for (size_t num_bits : bit_sizes) {
        uint256_t max_val = (uint256_t(1) << num_bits) - 1;

        for (uint256_t a_val : test_values) {
            for (uint256_t b_val : test_values) {
                // Apply bit mask to inputs
                uint256_t masked_a = a_val & max_val;
                uint256_t masked_b = b_val & max_val;

                for (bool is_xor : operations) {
                    for (auto [a_is_constant, b_is_constant] : combinations) {
                        test_combination(builder, masked_a, masked_b, num_bits, is_xor, a_is_constant, b_is_constant);
                    }
                }
            }
        }
    }

    // Test edge cases with specific values
    std::vector<std::tuple<uint256_t, uint256_t, size_t>> edge_cases = {
        { 0, 0, 1 },                                                // Zero values, 1 bit
        { 1, 1, 1 },                                                // One values, 1 bit
        { 0, 1, 1 },                                                // Zero and one, 1 bit
        { 255, 255, 8 },                                            // Max 8-bit values
        { 65535, 65535, 16 },                                       // Max 16-bit values
        { (uint256_t(1) << 32) - 1, (uint256_t(1) << 32) - 1, 32 }, // Max 32-bit values
        { 0, (uint256_t(1) << 64) - 1, 64 },                        // Zero and max 64-bit value
        { (uint256_t(1) << 64) - 1, 0, 64 },                        // Max 64-bit value and zero
        { 0, (uint256_t(1) << 252) - 1, 252 },                      // Zero and max 252-bit value
        { (uint256_t(1) << 252) - 1, 0, 252 },                      // Max 252-bit value and zero
    };

    for (auto [a_val, b_val, num_bits] : edge_cases) {
        for (bool is_xor : operations) {
            for (auto [a_is_constant, b_is_constant] : combinations) {
                test_combination(builder, a_val, b_val, num_bits, is_xor, a_is_constant, b_is_constant);
            }
        }
    }

    // Test random values for larger bit sizes
    for (size_t num_bits : { 64UL, 128UL, 252UL }) {
        uint256_t max_val = (uint256_t(1) << num_bits) - 1;

        for (size_t i = 0; i < 10; ++i) { // Test 10 random combinations
            uint256_t a_val = engine.get_random_uint256() & max_val;
            uint256_t b_val = engine.get_random_uint256() & max_val;

            for (bool is_xor : operations) {
                for (auto [a_is_constant, b_is_constant] : combinations) {
                    test_combination(builder, a_val, b_val, num_bits, is_xor, a_is_constant, b_is_constant);
                }
            }
        }
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

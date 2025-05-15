#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2 {
namespace {

// Test constructors
TEST(Uint1Test, Constructors)
{
    // Default constructor should initialize to 0
    uint1_t default_val;
    EXPECT_EQ(default_val.value(), 0);

    // Constructor from bool
    uint1_t true_val(true);
    EXPECT_EQ(true_val.value(), 1);

    uint1_t false_val(false);
    EXPECT_EQ(false_val.value(), 0);

    // Constructor from integers
    uint1_t from_int_zero(0);
    EXPECT_EQ(from_int_zero.value(), 0);

    uint1_t from_int_one(1);
    EXPECT_EQ(from_int_one.value(), 1);

    uint1_t from_int_two(2);
    EXPECT_EQ(from_int_two.value(), 1); // Any non-zero value becomes 1

    uint1_t from_int_negative(-1);
    EXPECT_EQ(from_int_negative.value(), 1); // Any non-zero value becomes 1
}

// Test arithmetic operators
TEST(Uint1Test, ArithmeticOperators)
{
    uint1_t zero(0);
    uint1_t one(1);

    // Addition
    EXPECT_EQ((zero + zero).value(), 0);
    EXPECT_EQ((zero + one).value(), 1);
    EXPECT_EQ((one + zero).value(), 1);
    EXPECT_EQ((one + one).value(), 0); // 1+1=0 with overflow (XOR behavior)

    // Subtraction
    EXPECT_EQ((zero - zero).value(), 0);
    EXPECT_EQ((zero - one).value(), 1); // 0-1=1 with underflow
    EXPECT_EQ((one - zero).value(), 1);
    EXPECT_EQ((one - one).value(), 0);

    // Multiplication
    EXPECT_EQ((zero * zero).value(), 0);
    EXPECT_EQ((zero * one).value(), 0);
    EXPECT_EQ((one * zero).value(), 0);
    EXPECT_EQ((one * one).value(), 1);

    // Division
    EXPECT_EQ((zero / one).value(), 0);
    EXPECT_EQ((one / one).value(), 1);
    // Division by zero isn't tested as it's undefined behavior

    // Unary negation
    EXPECT_EQ((-zero).value(), 1);
    EXPECT_EQ((-one).value(), 0);
}

// Test bitwise operators
TEST(Uint1Test, BitwiseOperators)
{
    uint1_t zero(0);
    uint1_t one(1);

    // Bitwise AND
    EXPECT_EQ((zero & zero).value(), 0);
    EXPECT_EQ((zero & one).value(), 0);
    EXPECT_EQ((one & zero).value(), 0);
    EXPECT_EQ((one & one).value(), 1);

    // Bitwise OR
    EXPECT_EQ((zero | zero).value(), 0);
    EXPECT_EQ((zero | one).value(), 1);
    EXPECT_EQ((one | zero).value(), 1);
    EXPECT_EQ((one | one).value(), 1);

    // Bitwise XOR
    EXPECT_EQ((zero ^ zero).value(), 0);
    EXPECT_EQ((zero ^ one).value(), 1);
    EXPECT_EQ((one ^ zero).value(), 1);
    EXPECT_EQ((one ^ one).value(), 0);

    // Bitwise NOT
    EXPECT_EQ((~zero).value(), 1);
    EXPECT_EQ((~one).value(), 0);
}

// Test shift operators
TEST(Uint1Test, ShiftOperators)
{
    uint1_t zero(0);
    uint1_t one(1);

    // Left shift
    EXPECT_EQ((zero << zero).value(), 0);
    EXPECT_EQ((zero << one).value(), 0);
    EXPECT_EQ((one << zero).value(), 1);
    EXPECT_EQ((one << one).value(), 0); // 1<<1=2, which becomes 0 in uint1_t

    // Right shift
    EXPECT_EQ((zero >> zero).value(), 0);
    EXPECT_EQ((zero >> one).value(), 0);
    EXPECT_EQ((one >> zero).value(), 1);
    EXPECT_EQ((one >> one).value(), 0);
}

// Test comparison operators
TEST(Uint1Test, ComparisonOperators)
{
    uint1_t zero(0);
    uint1_t one(1);
    uint1_t also_one(1);

    // Equality
    EXPECT_TRUE(zero == zero);
    EXPECT_FALSE(zero == one);
    EXPECT_FALSE(one == zero);
    EXPECT_TRUE(one == also_one);

    // Inequality
    EXPECT_FALSE(zero != zero);
    EXPECT_TRUE(zero != one);
    EXPECT_TRUE(one != zero);
    EXPECT_FALSE(one != also_one);

    // Less than
    EXPECT_FALSE(zero < zero);
    EXPECT_TRUE(zero < one);
    EXPECT_FALSE(one < zero);
    EXPECT_FALSE(one < also_one);

    // Less than or equal
    EXPECT_TRUE(zero <= zero);
    EXPECT_TRUE(zero <= one);
    EXPECT_FALSE(one <= zero);
    EXPECT_TRUE(one <= also_one);

    // Greater than
    EXPECT_FALSE(zero > zero);
    EXPECT_FALSE(zero > one);
    EXPECT_TRUE(one > zero);
    EXPECT_FALSE(one > also_one);

    // Greater than or equal
    EXPECT_TRUE(zero >= zero);
    EXPECT_FALSE(zero >= one);
    EXPECT_TRUE(one >= zero);
    EXPECT_TRUE(one >= also_one);
}

// Test uint8_t conversion
TEST(Uint1Test, Conversion)
{
    uint1_t zero(0);
    uint1_t one(1);

    // Test explicit conversion through value()
    EXPECT_EQ(zero.value(), 0);
    EXPECT_EQ(one.value(), 1);

    // Test implicit conversion to uint8_t
    uint8_t zero_u8 = zero;
    uint8_t one_u8 = one;
    EXPECT_EQ(zero_u8, 0);
    EXPECT_EQ(one_u8, 1);
}

// Test behavior in complex expressions
TEST(Uint1Test, ComplexExpressions)
{
    uint1_t zero(0);
    uint1_t one(1);

    // Test compound expressions
    EXPECT_EQ(((zero | one) & ~zero).value(), 1);
    EXPECT_EQ(((zero & one) | zero).value(), 0);
    EXPECT_EQ(((zero ^ one) ^ zero).value(), 1);

    // Test with arithmetic and bitwise operations mixed
    EXPECT_EQ((zero + one * zero).value(), 0);
    EXPECT_EQ((zero | (one & zero)).value(), 0);
    EXPECT_EQ((zero + (one | zero)).value(), 1);

    // Test more complex expressions
    EXPECT_EQ(((zero | one) + (zero & zero)).value(), 1);
    EXPECT_EQ(((zero ^ one) - (one & zero)).value(), 1);
    EXPECT_EQ(((~zero & one) * (zero | zero)).value(), 0);
}

} // namespace
} // namespace bb::avm2

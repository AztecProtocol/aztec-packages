/**
 * @brief Generic parameterized tests for all field types.
 *
 * Tests here use only the common field interface and do NOT rely on prime-field-specific features.
 *
 * @note: Prime-field-specific tests are in prime_field.test.cpp
 */

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fq12.hpp"
#include "barretenberg/ecc/curves/bn254/fq2.hpp"
#include "barretenberg/ecc/curves/bn254/fq6.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <typename F> class FieldTest : public ::testing::Test {};

using AllFieldTypes = ::testing::
    Types<bb::fq, bb::fr, secp256k1::fq, secp256k1::fr, secp256r1::fq, secp256r1::fr, bb::fq2, bb::fq6, bb::fq12>;

TYPED_TEST_SUITE(FieldTest, AllFieldTypes);

// ================================
// Zero and One
// ================================

TYPED_TEST(FieldTest, ZeroIsAdditiveIdentity)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF zero = FF::zero();

    EXPECT_EQ(a + zero, a);
    EXPECT_EQ(zero + a, a);
}

TYPED_TEST(FieldTest, OneIsMultiplicativeIdentity)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF one = FF::one();

    EXPECT_EQ(a * one, a);
    EXPECT_EQ(one * a, a);
}

TYPED_TEST(FieldTest, IsZero)
{
    using FF = TypeParam;

    FF zero = FF::zero();
    FF one = FF::one();
    FF random = FF::random_element();

    EXPECT_TRUE(zero.is_zero());
    EXPECT_FALSE(one.is_zero());
    EXPECT_FALSE(random.is_zero());
}

// ================================
// Addition
// ================================

TYPED_TEST(FieldTest, AdditionCommutative)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();

    EXPECT_EQ(a + b, b + a);
}

TYPED_TEST(FieldTest, AdditionAssociative)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF c = FF::random_element();
    FF a_plus_b = a + b;
    FF b_plus_c = b + c;

    EXPECT_EQ(a_plus_b + c, a + b_plus_c);
}

// ================================
// Subtraction and Negation
// ================================

TYPED_TEST(FieldTest, SubtractionIsAdditionOfNegation)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF neg_b = -b;

    EXPECT_EQ(a - b, a + neg_b);
}

TYPED_TEST(FieldTest, NegationCancels)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF neg_a = -a;
    FF result = a + neg_a;

    EXPECT_EQ(result, FF::zero());
}

TYPED_TEST(FieldTest, NegationOfZero)
{
    using FF = TypeParam;

    FF zero = FF::zero();
    FF neg_zero = -zero;

    EXPECT_EQ(zero, neg_zero);
}

TYPED_TEST(FieldTest, DoubleNegation)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    EXPECT_EQ(-(-a), a);
}

// ================================
// Multiplication
// ================================

TYPED_TEST(FieldTest, MultiplicationCommutative)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();

    EXPECT_EQ(a * b, b * a);
}

TYPED_TEST(FieldTest, MultiplicationAssociative)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF c = FF::random_element();

    EXPECT_EQ((a * b) * c, a * (b * c));
}

TYPED_TEST(FieldTest, MultiplicationDistributive)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF c = FF::random_element();

    EXPECT_EQ(a * (b + c), (a * b) + (a * c));
}

TYPED_TEST(FieldTest, MulByZero)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF zero = FF::zero();

    EXPECT_EQ(a * zero, FF::zero());
    EXPECT_EQ(zero * a, FF::zero());
}

// ================================
// Squaring
// ================================

TYPED_TEST(FieldTest, SquaringMatchesMultiplication)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF sqr_result = a.sqr();
    FF mul_result = a * a;

    EXPECT_EQ(sqr_result, mul_result);
}

TYPED_TEST(FieldTest, DifferenceOfSquares)
{
    using FF = TypeParam;

    // (a - b)(a + b) = a² - b²
    FF a = FF::random_element();
    FF b = FF::random_element();

    FF lhs = (a - b) * (a + b);
    FF rhs = a.sqr() - b.sqr();

    EXPECT_EQ(lhs, rhs);
}

// ================================
// Inversion
// ================================

TYPED_TEST(FieldTest, InverseProperty)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF a_inv = a.invert();
    FF result = a * a_inv;

    EXPECT_EQ(result, FF::one());
}

TYPED_TEST(FieldTest, InvertOneIsOne)
{
    using FF = TypeParam;

    FF one = FF::one();
    FF result = one.invert();
    EXPECT_EQ(result, FF::one());
}

TYPED_TEST(FieldTest, DoubleInverse)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF a_inv_inv = a.invert().invert();

    EXPECT_EQ(a_inv_inv, a);
}

// ================================
// Self-Modifying Operations
// ================================

TYPED_TEST(FieldTest, SelfNeg)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF a_copy = a;

    a_copy.self_neg();
    EXPECT_EQ(a_copy, -a);
}

TYPED_TEST(FieldTest, OperatorPlusEquals)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF expected = a + b;

    a += b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, OperatorMinusEquals)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF expected = a - b;

    a -= b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, OperatorTimesEquals)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF expected = a * b;

    a *= b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, SelfSqr)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF expected = a.sqr();

    a.self_sqr();
    EXPECT_EQ(a, expected);
}

// ================================
// Algebraic Identities
// ================================

TYPED_TEST(FieldTest, AddMulConsistency)
{
    using FF = TypeParam;

    // a + a + a should equal 3a (verified via repeated addition on both sides)
    FF a = FF::random_element();
    FF sum = a + a + a;

    // Build "3" as one + one + one to avoid integer constructors, which do not exist in our implementation of extension
    // fields.
    FF three = FF::one() + FF::one() + FF::one();
    FF product = a * three;

    EXPECT_EQ(sum, product);
}

TYPED_TEST(FieldTest, SubMulConsistency)
{
    using FF = TypeParam;

    // 4a - a = 3a
    FF a = FF::random_element();
    FF four_a = a + a + a + a;
    FF result = four_a - a;

    FF three = FF::one() + FF::one() + FF::one();
    FF expected = a * three;

    EXPECT_EQ(result, expected);
}

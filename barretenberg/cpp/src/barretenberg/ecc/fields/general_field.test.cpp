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
    using F = TypeParam;

    F a = F::random_element();
    F zero = F::zero();

    EXPECT_EQ(a + zero, a);
    EXPECT_EQ(zero + a, a);
}

TYPED_TEST(FieldTest, OneIsMultiplicativeIdentity)
{
    using F = TypeParam;

    F a = F::random_element();
    F one = F::one();

    EXPECT_EQ(a * one, a);
    EXPECT_EQ(one * a, a);
}

TYPED_TEST(FieldTest, IsZero)
{
    using F = TypeParam;

    F zero = F::zero();
    F one = F::one();
    F random = F::random_element();

    EXPECT_TRUE(zero.is_zero());
    EXPECT_FALSE(one.is_zero());
    EXPECT_FALSE(random.is_zero());
}

// ================================
// Addition
// ================================

TYPED_TEST(FieldTest, AdditionCommutative)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();

    EXPECT_EQ(a + b, b + a);
}

TYPED_TEST(FieldTest, AdditionAssociative)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F c = F::random_element();
    F a_plus_b = a + b;
    F b_plus_c = b + c;

    EXPECT_EQ(a_plus_b + c, a + b_plus_c);
}

// ================================
// Subtraction and Negation
// ================================

TYPED_TEST(FieldTest, SubtractionIsAdditionOfNegation)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F neg_b = -b;

    EXPECT_EQ(a - b, a + neg_b);
}

TYPED_TEST(FieldTest, NegationCancels)
{
    using F = TypeParam;

    F a = F::random_element();
    F neg_a = -a;
    F result = a + neg_a;

    EXPECT_EQ(result, F::zero());
}

TYPED_TEST(FieldTest, NegationOfZero)
{
    using F = TypeParam;

    F zero = F::zero();
    F neg_zero = -zero;

    EXPECT_EQ(zero, neg_zero);
}

TYPED_TEST(FieldTest, DoubleNegation)
{
    using F = TypeParam;

    F a = F::random_element();
    EXPECT_EQ(-(-a), a);
}

// ================================
// Multiplication
// ================================

TYPED_TEST(FieldTest, MultiplicationCommutative)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();

    EXPECT_EQ(a * b, b * a);
}

TYPED_TEST(FieldTest, MultiplicationAssociative)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F c = F::random_element();

    EXPECT_EQ((a * b) * c, a * (b * c));
}

TYPED_TEST(FieldTest, MultiplicationDistributive)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F c = F::random_element();

    EXPECT_EQ(a * (b + c), (a * b) + (a * c));
}

TYPED_TEST(FieldTest, MulByZero)
{
    using F = TypeParam;

    F a = F::random_element();
    F zero = F::zero();

    EXPECT_EQ(a * zero, F::zero());
    EXPECT_EQ(zero * a, F::zero());
}

// ================================
// Squaring
// ================================

TYPED_TEST(FieldTest, SquaringMatchesMultiplication)
{
    using F = TypeParam;

    F a = F::random_element();
    F sqr_result = a.sqr();
    F mul_result = a * a;

    EXPECT_EQ(sqr_result, mul_result);
}

TYPED_TEST(FieldTest, DifferenceOfSquares)
{
    using F = TypeParam;

    // (a - b)(a + b) = a² - b²
    F a = F::random_element();
    F b = F::random_element();

    F lhs = (a - b) * (a + b);
    F rhs = a.sqr() - b.sqr();

    EXPECT_EQ(lhs, rhs);
}

// ================================
// Inversion
// ================================

TYPED_TEST(FieldTest, InverseProperty)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_inv = a.invert();
    F result = a * a_inv;

    EXPECT_EQ(result, F::one());
}

TYPED_TEST(FieldTest, InvertOneIsOne)
{
    using F = TypeParam;

    F one = F::one();
    F result = one.invert();
    EXPECT_EQ(result, F::one());
}

TYPED_TEST(FieldTest, DoubleInverse)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_inv_inv = a.invert().invert();

    EXPECT_EQ(a_inv_inv, a);
}

// ================================
// Self-Modifying Operations
// ================================

TYPED_TEST(FieldTest, SelfNeg)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_copy = a;

    a_copy.self_neg();
    EXPECT_EQ(a_copy, -a);
}

TYPED_TEST(FieldTest, OperatorPlusEquals)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F expected = a + b;

    a += b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, OperatorMinusEquals)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F expected = a - b;

    a -= b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, OperatorTimesEquals)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = F::random_element();
    F expected = a * b;

    a *= b;
    EXPECT_EQ(a, expected);
}

TYPED_TEST(FieldTest, SelfSqr)
{
    using F = TypeParam;

    F a = F::random_element();
    F expected = a.sqr();

    a.self_sqr();
    EXPECT_EQ(a, expected);
}

// ================================
// Algebraic Identities
// ================================

TYPED_TEST(FieldTest, AddMulConsistency)
{
    using F = TypeParam;

    // a + a + a should equal 3a (verified via repeated addition on both sides)
    F a = F::random_element();
    F sum = a + a + a;

    // Build "3" as one + one + one to avoid integer constructors, which do not exist in our implementation of extension
    // fields.
    F three = F::one() + F::one() + F::one();
    F product = a * three;

    EXPECT_EQ(sum, product);
}

TYPED_TEST(FieldTest, SubMulConsistency)
{
    using F = TypeParam;

    // 4a - a = 3a
    F a = F::random_element();
    F four_a = a + a + a + a;
    F result = four_a - a;

    F three = F::one() + F::one() + F::one();
    F expected = a * three;

    EXPECT_EQ(result, expected);
}

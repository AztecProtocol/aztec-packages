/**
 * @brief Generic parameterized tests for all field types.
 *
 * Tests here use only the common field interface and do NOT rely on prime-field-specific features.
 *
 * @note: Prime-field-specific tests are in prime_field.test.cpp
 */

#include "barretenberg/common/type_traits.hpp"
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

template <typename F>
concept HasPow = IsAnyOf<F, bb::fq, bb::fr, secp256k1::fq, secp256k1::fr, secp256r1::fq, secp256r1::fr>;

template <typename F>
concept HasSqrt = IsAnyOf<F, bb::fq, bb::fr>;

template <typename F>
concept IsExtensionField = IsAnyOf<F, bb::fq2, bb::fq6, bb::fq12>;

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
// Exponentation
// ================================

TYPED_TEST(FieldTest, PowRegressionCheck)
{
    if constexpr (HasPow<TypeParam>) {
        using FF = TypeParam;

        FF zero = FF::zero();
        FF one = FF::one();

        EXPECT_EQ(zero.pow(uint256_t(0)), one);
    }
}

TYPED_TEST(FieldTest, Sqrt)
{
    if constexpr (HasSqrt<TypeParam>) {
        using FF = TypeParam;

        FF input = FF::random_element();
        auto [is_sqr, root] = input.sqrt();
        FF result = root.sqr();

        if (is_sqr) {
            EXPECT_EQ(result, input);
        } else {
            EXPECT_EQ(result, FF::zero());
        }
    }
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

TYPED_TEST(FieldTest, MulSqrConsistency)
{
    using FF = TypeParam;

    // Check that (a - b) * (a + b) = a^2 - b^2
    FF a = FF::random_element();
    FF b = FF::random_element();
    FF t1;
    FF t2;
    FF mul_result;
    FF sqr_result;

    t1 = a - b;
    t2 = a + b;
    mul_result = t1 * t2;

    t1 = a.sqr();
    t2 = b.sqr();
    sqr_result = t1 - t2;

    EXPECT_EQ(mul_result, sqr_result);
}

// ================================
// Montgomery Form and Reduction
// ================================

TYPED_TEST(FieldTest, FromMontgomeryForm)
{
    using FF = TypeParam;

    constexpr FF t0 = FF::one();
    // Use from_montgomery_form_reduced() for base fields to ensure full reduction to [0, p).
    // The WASM Montgomery multiplication returns coarse results in [0, 2p), so without
    // reduce_once() the raw limbs may hold p+1 instead of 1.
    // Extension fields already call from_montgomery_form_reduced() on their components internally.
    constexpr FF result = [&]() constexpr {
        if constexpr (!IsExtensionField<FF>) {
            return t0.from_montgomery_form_reduced();
        } else {
            return t0.from_montgomery_form();
        }
    }();
    constexpr uint256_t expected = 0x01;
    uint256_t to_be_compared;

    if constexpr (!IsExtensionField<FF>) {
        to_be_compared = { result.data[0], result.data[1], result.data[2], result.data[3] };
    } else if constexpr (std::is_same_v<FF, bb::fq2>) {
        EXPECT_EQ(result.c1, bb::fq::zero());
        to_be_compared = { result.c0.data[0], result.c0.data[1], result.c0.data[2], result.c0.data[3] };
    } else if constexpr (std::is_same_v<FF, bb::fq6>) {
        EXPECT_EQ(result.c0.c1, bb::fq::zero());
        EXPECT_EQ(result.c1, bb::fq2::zero());
        EXPECT_EQ(result.c2, bb::fq2::zero());
        to_be_compared = { result.c0.c0.data[0], result.c0.c0.data[1], result.c0.c0.data[2], result.c0.c0.data[3] };
    } else {
        EXPECT_EQ(result.c0.c0.c1, bb::fq::zero());
        EXPECT_EQ(result.c0.c1, bb::fq2::zero());
        EXPECT_EQ(result.c0.c2, bb::fq2::zero());
        EXPECT_EQ(result.c1, bb::fq6::zero());
        to_be_compared = {
            result.c0.c0.c0.data[0], result.c0.c0.c0.data[1], result.c0.c0.c0.data[2], result.c0.c0.c0.data[3]
        };
    }

    EXPECT_EQ(to_be_compared, expected);
}

TYPED_TEST(FieldTest, MontgomeryConsistencyCheck)
{
    using FF = TypeParam;

    FF a = FF::random_element();
    FF b = FF::random_element();
    FF aR;
    FF bR;
    FF aRR;
    FF bRR;
    FF bRRR;
    FF result_a;
    FF result_b;
    FF result_c;
    FF result_d;

    aR = a.to_montgomery_form();
    aRR = aR.to_montgomery_form();
    bR = b.to_montgomery_form();
    bRR = bR.to_montgomery_form();
    bRRR = bRR.to_montgomery_form();
    result_a = aRR * bRR; // abRRR
    result_b = aR * bRRR; // abRRR
    result_c = aR * bR;   // abR
    result_d = a * b;     // abR^-1

    EXPECT_EQ((result_a == result_b), true);

    if constexpr (!IsExtensionField<FF> || std::is_same_v<FF, bb::fq2>) {
        result_a.self_from_montgomery_form(); // abRR
        result_a.self_from_montgomery_form(); // abR
        result_a.self_from_montgomery_form(); // ab
        result_c.self_from_montgomery_form(); // ab
        result_d.self_to_montgomery_form();   // ab

        EXPECT_EQ((result_a == result_c), true);
        EXPECT_EQ((result_a == result_d), true);
    }
}

// ================================
// Other tests
// ================================

TYPED_TEST(FieldTest, Copy)
{
    if constexpr (!IsExtensionField<TypeParam>) {
        using FF = TypeParam;

        FF result = FF::random_element();
        FF expected;
        FF::__copy(result, expected);

        EXPECT_EQ((result == expected), true);
    }
}

TYPED_TEST(FieldTest, SerializeToBuffer)
{
    if constexpr (!IsExtensionField<TypeParam>) {
        using FF = TypeParam;

        std::array<uint8_t, 32> buffer;
        FF a{ 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };
        a = a.to_montgomery_form();

        FF::serialize_to_buffer(a, &buffer[0]);

        EXPECT_EQ(buffer[31], 0x10);
        EXPECT_EQ(buffer[30], 0x32);
        EXPECT_EQ(buffer[29], 0x54);
        EXPECT_EQ(buffer[28], 0x76);
        EXPECT_EQ(buffer[27], 0x78);
        EXPECT_EQ(buffer[26], 0x56);
        EXPECT_EQ(buffer[25], 0x34);
        EXPECT_EQ(buffer[24], 0x12);

        EXPECT_EQ(buffer[23], 0x21);
        EXPECT_EQ(buffer[22], 0x43);
        EXPECT_EQ(buffer[21], 0x65);
        EXPECT_EQ(buffer[20], 0x87);
        EXPECT_EQ(buffer[19], 0x89);
        EXPECT_EQ(buffer[18], 0x67);
        EXPECT_EQ(buffer[17], 0x45);
        EXPECT_EQ(buffer[16], 0x23);

        EXPECT_EQ(buffer[15], 0x32);
        EXPECT_EQ(buffer[14], 0x54);
        EXPECT_EQ(buffer[13], 0x76);
        EXPECT_EQ(buffer[12], 0x98);
        EXPECT_EQ(buffer[11], 0x9a);
        EXPECT_EQ(buffer[10], 0x78);
        EXPECT_EQ(buffer[9], 0x56);
        EXPECT_EQ(buffer[8], 0x34);

        EXPECT_EQ(buffer[7], 0x65);
        EXPECT_EQ(buffer[6], 0x87);
        EXPECT_EQ(buffer[5], 0xa9);
        EXPECT_EQ(buffer[4], 0xcb);
        EXPECT_EQ(buffer[3], 0xab);
        EXPECT_EQ(buffer[2], 0x89);
        EXPECT_EQ(buffer[1], 0x67);
        EXPECT_EQ(buffer[0], 0x00);
    }
}

TYPED_TEST(FieldTest, SerializeFromBuffer)
{
    if constexpr (!IsExtensionField<TypeParam>) {
        using FF = TypeParam;

        std::array<uint8_t, 32> buffer;
        FF expected{ 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };

        FF::serialize_to_buffer(expected, &buffer[0]);
        FF result = FF::serialize_from_buffer(&buffer[0]);

        EXPECT_EQ(result, expected);
    } else if constexpr (std::is_same_v<TypeParam, bb::fq2>) {
        std::array<uint8_t, 64> buffer;
        fq expected_c0 = { 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };
        fq expected_c1 = { 0x12a4e67f76b43210, 0x23e56f898a65cc21, 0x005678add98e5432, 0x1f6789a2cba98700 };
        fq2 expected{ expected_c0, expected_c1 };

        fq2::serialize_to_buffer(expected, &buffer[0]);

        fq2 result = fq2::serialize_from_buffer(&buffer[0]);

        EXPECT_EQ(result, expected);
    }
}

/**
 * @brief Parameterized tests for prime fields (field<> template).
 *
 * These tests are specific to prime fields and use features like:
 * - uint256_t conversion and modular arithmetic verification
 * - Direct modulus access and comparison
 * - Montgomery form with specific R values
 * - Multiplicative generator (quadratic non-residue) (AUDITTODO: kill this, or at least only force for BN254 fields.)
 *
 * Prime fields tested:
 * - BN254: fq (base field), fr (scalar field)
 * - secp256k1: fq (base field), fr (scalar field)
 * - secp256r1: fq (base field), fr (scalar field)
 *
 * @note: Grumpkin shares fields with BN254 (swapped), so we test 6 distinct moduli.
 */

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

// Type-parameterized test fixture for prime fields
template <typename F> class PrimeFieldTest : public ::testing::Test {
  public:
    // Helper to get a random field element as uint256_t (for reference calculations)
    static uint256_t get_random_element_raw()
    {
        uint256_t res = engine.get_random_uint256();
        while (res >= F::modulus) {
            res -= F::modulus;
        }
        return res;
    }
};

// Register all prime field types
using PrimeFieldTypes = ::testing::Types<bb::fq, bb::fr, secp256k1::fq, secp256k1::fr, secp256r1::fq, secp256r1::fr>;

// Fields where sqrt() works correctly
using SqrtFieldTypes = ::testing::Types<bb::fq, bb::fr, secp256k1::fq, secp256r1::fq>;

// Fields that have cube_root_of_unity() defined
using CubeRootFieldTypes = ::testing::Types<bb::fq, bb::fr, secp256k1::fq, secp256k1::fr>;

TYPED_TEST_SUITE(PrimeFieldTest, PrimeFieldTypes);

template <typename> class PrimeFieldSqrtTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldSqrtTest, SqrtFieldTypes);

template <typename> class PrimeFieldCubeRootTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldCubeRootTest, CubeRootFieldTypes);

// ================================
// Compile-time Tests (Prime Field Specific)
// ================================

TYPED_TEST(PrimeFieldTest, CompileTimeEquality)
{
    using F = TypeParam;

    constexpr F a{ 0x01, 0x02, 0x03, 0x04 };
    constexpr F b{ 0x01, 0x02, 0x03, 0x04 };

    constexpr F c{ 0x01, 0x02, 0x03, 0x05 };
    constexpr F d{ 0x01, 0x02, 0x04, 0x04 };
    constexpr F e{ 0x01, 0x03, 0x03, 0x04 };
    constexpr F f{ 0x02, 0x02, 0x03, 0x04 };
    static_assert(a == b);
    static_assert(!(a == c));
    static_assert(!(a == d));
    static_assert(!(a == e));
    static_assert(!(a == f));
}

TYPED_TEST(PrimeFieldTest, CompileTimeSmallAddSubMul)
{
    using F = TypeParam;

    constexpr F a{ 0x01, 0x02, 0x03, 0x04 };
    constexpr F b{ 0x05, 0x06, 0x07, 0x08 };

    // Just verify these operations are constexpr and produce consistent results
    constexpr F sum = a + b;
    constexpr F diff = a - b;
    constexpr F prod = a * b;
    constexpr F sq = a.sqr();

    // Verify at runtime that constexpr results match runtime results
    EXPECT_EQ(sum, a + b);
    EXPECT_EQ(diff, a - b);
    EXPECT_EQ(prod, a * b);
    EXPECT_EQ(sq, a.sqr());
}

TYPED_TEST(PrimeFieldTest, CompileTimeUint256Conversion)
{
    using F = TypeParam;

    constexpr uint256_t a{ 0x1111, 0x2222, 0x3333, 0x4444 };
    constexpr F b(a);
    constexpr uint256_t c = b;

    static_assert(a == c);
}

// ================================
// uint256_t Arithmetic Verification
// ================================

TYPED_TEST(PrimeFieldTest, AdditionModular)
{
    using F = TypeParam;

    uint256_t a_raw = TestFixture::get_random_element_raw();
    uint256_t b_raw = TestFixture::get_random_element_raw();

    F a(a_raw);
    F b(b_raw);
    F c = a + b;

    uint512_t expected_512 = uint512_t(a_raw) + uint512_t(b_raw);
    uint256_t expected = (expected_512 % uint512_t(F::modulus)).lo;

    EXPECT_EQ(uint256_t(c), expected);
}

TYPED_TEST(PrimeFieldTest, SubtractionModular)
{
    using F = TypeParam;

    uint256_t a_raw = TestFixture::get_random_element_raw();
    uint256_t b_raw = TestFixture::get_random_element_raw();

    F a(a_raw);
    F b(b_raw);
    F c = a - b;

    uint512_t expected_512 = uint512_t(a_raw) + uint512_t(F::modulus) - uint512_t(b_raw);
    uint256_t expected = (expected_512 % uint512_t(F::modulus)).lo;

    EXPECT_EQ(uint256_t(c), expected);
}

TYPED_TEST(PrimeFieldTest, MultiplicationModular)
{
    using F = TypeParam;

    uint256_t a_raw = TestFixture::get_random_element_raw();
    uint256_t b_raw = TestFixture::get_random_element_raw();

    F a(a_raw);
    F b(b_raw);
    F c = a * b;

    uint512_t c_512 = uint512_t(a_raw) * uint512_t(b_raw);
    uint256_t expected = (c_512 % uint512_t(F::modulus)).lo;

    EXPECT_EQ(uint256_t(c), expected);
}

TYPED_TEST(PrimeFieldTest, SquaringModular)
{
    using F = TypeParam;

    uint256_t a_raw = TestFixture::get_random_element_raw();

    F a(a_raw);
    F c = a.sqr();

    uint512_t c_512 = uint512_t(a_raw) * uint512_t(a_raw);
    uint256_t expected = (c_512 % uint512_t(F::modulus)).lo;

    EXPECT_EQ(uint256_t(c), expected);
}

TYPED_TEST(PrimeFieldTest, Uint256Roundtrip)
{
    using F = TypeParam;

    uint256_t original = TestFixture::get_random_element_raw();
    F field_element(original);
    uint256_t recovered(field_element);

    EXPECT_EQ(original, recovered);
}

// ================================
// Montgomery Form (Prime Field Specific)
// ================================

TYPED_TEST(PrimeFieldTest, MontgomeryRoundtrip)
{
    using F = TypeParam;

    F a = F::random_element();
    F b = a.from_montgomery_form().to_montgomery_form();
    EXPECT_EQ(a, b);
}

// ================================
// Square Root
// ================================

TYPED_TEST(PrimeFieldSqrtTest, SqrtOfOne)
{
    using F = TypeParam;

    F one = F::one();
    auto [is_sqr, root] = one.sqrt();

    EXPECT_TRUE(is_sqr);
    EXPECT_EQ(root.sqr(), one);
}

TYPED_TEST(PrimeFieldSqrtTest, SqrtConsistency)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_sqr = a.sqr();
    auto [is_sqr, root] = a_sqr.sqrt();

    EXPECT_TRUE(is_sqr);
    EXPECT_EQ(root.sqr(), a_sqr);
    EXPECT_TRUE((root == a) || (root == -a));
}

// ================================
// Cube Root of Unity
// ================================

TYPED_TEST(PrimeFieldCubeRootTest, CubeRootOfUnity)
{
    using F = TypeParam;

    // lambda^3 = 1, so (lambda * x)^3 = x^3
    F x = F::random_element();
    F lambda = F::cube_root_of_unity();
    F lambda_x = x * lambda;

    F x_cubed = x * x * x;
    F lambda_x_cubed = lambda_x * lambda_x * lambda_x;

    EXPECT_EQ(x_cubed, lambda_x_cubed);
}

// ================================
// Multiplicative Generator (Quadratic Non-Residue). AUDITTODO: kill this?
// ================================

TYPED_TEST(PrimeFieldTest, MultiplicativeGenerator)
{
    using F = TypeParam;

    // The multiplicative generator g is defined such that g^((p-1)/2) = -1
    // This means g is a quadratic non-residue (not a perfect square in the field)
    F g = F::multiplicative_generator();
    uint256_t p_minus_one_over_two = (F::modulus - 1) >> 1;
    EXPECT_EQ(g.pow(p_minus_one_over_two), -F::one());
}

// ================================
// Exponentiation
// ================================

TYPED_TEST(PrimeFieldTest, PowZeroExponent)
{
    using F = TypeParam;

    // a^0 = 1 for any non-zero a
    F a = F::random_element();
    EXPECT_EQ(a.pow(uint256_t(0)), F::one());
}

TYPED_TEST(PrimeFieldTest, PowOneExponent)
{
    using F = TypeParam;

    F a = F::random_element();
    EXPECT_EQ(a.pow(uint256_t(1)), a);
}

TYPED_TEST(PrimeFieldTest, PowTwo)
{
    using F = TypeParam;

    F a = F::random_element();
    EXPECT_EQ(a.pow(uint256_t(2)), a * a);
}

TYPED_TEST(PrimeFieldTest, PowThree)
{
    using F = TypeParam;

    F a = F::random_element();
    EXPECT_EQ(a.pow(uint256_t(3)), a * a * a);
}

// ================================
// Batch Invert (only implemented for prime fields)
// ================================

TYPED_TEST(PrimeFieldTest, BatchInvert)
{
    using F = TypeParam;
    constexpr size_t batch_size = 10;

    std::vector<F> elements(batch_size);
    std::vector<F> inverses(batch_size);

    for (size_t i = 0; i < batch_size; ++i) {
        elements[i] = F::random_element();
        inverses[i] = elements[i];
    }

    F::batch_invert(&inverses[0], batch_size);

    for (size_t i = 0; i < batch_size; ++i) {
        F product = elements[i] * inverses[i];
        product = product.reduce_once().reduce_once();
        EXPECT_EQ(product, F::one());
    }
}

// ================================
// Increment Operators
// ================================

TYPED_TEST(PrimeFieldTest, PlusEqualsInt)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_copy = a;

    a += 2;
    F expected = a_copy + F(2);
    EXPECT_EQ(a, expected);

    a += 3;
    expected = a_copy + F(5);
    EXPECT_EQ(a, expected);
}


TYPED_TEST(PrimeFieldTest, PrefixIncrement)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_before = a;
    F b = ++a;

    // Prefix increment returns the new value
    EXPECT_EQ(b, a);
    EXPECT_EQ(a, a_before + F(1));
}

TYPED_TEST(PrimeFieldTest, PostfixIncrement)
{
    using F = TypeParam;

    F a = F::random_element();
    F a_old = a;
    F b = a++;

    // Postfix increment returns the old value
    EXPECT_EQ(b, a_old);
    EXPECT_EQ(a, a_old + F(1));
}

// ================================
// Serialization
// ================================

TYPED_TEST(PrimeFieldTest, Msgpack)
{
    using F = TypeParam;

    F a = F::random_element();
    auto [actual, expected] = msgpack_roundtrip(a);
    EXPECT_EQ(actual, expected);
}

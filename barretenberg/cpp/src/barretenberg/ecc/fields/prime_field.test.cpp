/**
 * @brief Parameterized tests for prime fields (field<> template).
 *
 * These tests are specific to prime fields and use features like:
 * - uint256_t conversion and modular arithmetic verification
 * - Direct modulus access and comparison
 * - Montgomery form with specific R values
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

// Helper to create a field element whose internal (Montgomery) representation has exactly
// the given limbs. This is done by constructing from the value and then calling
// from_montgomery_form() to make the limbs directly represent the desired pattern.
// Also verifies that the internal representation matches the expected limbs (on non-WASM only,
// since WASM uses different internal representation during computation).
template <typename F> F create_element_with_limbs(uint64_t l0, uint64_t l1, uint64_t l2, uint64_t l3)
{
    uint256_t val{ l0, l1, l2, l3 };
    F result(val);
    result.self_from_montgomery_form_reduced();

// On WASM, the internal Montgomery multiplication uses 29-bit limbs and may produce
// different (but equivalent) representations. Skip limb verification on WASM.
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    // Verify the internal representation matches expected limbs
    EXPECT_EQ(result.data[0], l0);
    EXPECT_EQ(result.data[1], l1);
    EXPECT_EQ(result.data[2], l2);
    EXPECT_EQ(result.data[3], l3);
#endif

    return result;
}
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

// Fields whose modulus is 256 bits.
using TwoFiftySixBitFieldTypes = ::testing::Types<secp256k1::fq, secp256k1::fr>;

// Fields whose modulus is 254 bits (BN254 fq and fr).
using TwoFiftyFourBitFieldTypes = ::testing::Types<bb::fq, bb::fr>;

TYPED_TEST_SUITE(PrimeFieldTest, PrimeFieldTypes);

template <typename> class PrimeFieldSqrtTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldSqrtTest, SqrtFieldTypes);

template <typename> class PrimeFieldCubeRootTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldCubeRootTest, CubeRootFieldTypes);

template <typename> class PrimeFieldTwoFiftySixTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldTwoFiftySixTest, TwoFiftySixBitFieldTypes);

template <typename> class PrimeFieldTwoFiftyFourTest : public ::testing::Test {};
TYPED_TEST_SUITE(PrimeFieldTwoFiftyFourTest, TwoFiftyFourBitFieldTypes);
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

TYPED_TEST(PrimeFieldTest, IsZeroOnModulusForm)
{
    using F = TypeParam;

    F modulus_form{ F::modulus.data[0], F::modulus.data[1], F::modulus.data[2], F::modulus.data[3] };
    EXPECT_TRUE(modulus_form.is_zero());

    F prefix_match{ F::modulus.data[0], F::modulus.data[1], F::modulus.data[2], F::modulus.data[3] - 1 };
    EXPECT_FALSE(prefix_match.is_zero());

    F first_limb_only{ F::modulus.data[0], 0, 0, 0 };
    EXPECT_FALSE(first_limb_only.is_zero());
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
    static_assert(a == c || a == c - F::modulus);
}

// Regression for the WASM coarse-Montgomery footgun behind the fused IPA fold (#330) abort:
// from_montgomery_form() is only coarse-reduced ([0, 2p)) and returns value+p on WASM's 29-bit-limb
// Montgomery backend, so reading its raw limbs misreads a short value as full-width. The reduced
// variant must return the canonical ([0, p)) value on every platform. This deterministically fails on
// WASM if a limb-level caller reads from_montgomery_form()'s coarse limbs, and passes everywhere once
// from_montgomery_form_reduced() is used instead.
TYPED_TEST(PrimeFieldTest, ReducedLimbsAreCanonicalForShortValues)
{
    using F = TypeParam;

    for (size_t i = 0; i < 256; ++i) {
        // A 127-bit value, as produced by the fused fold's challenge inputs.
        const F seed = F::random_element().from_montgomery_form_reduced();
        const uint256_t value(seed.data[0], seed.data[1] & 0x7FFFFFFFFFFFFFFFULL, 0, 0);

        const F reduced = F(value).from_montgomery_form_reduced();
        EXPECT_EQ(reduced.data[0], value.data[0]);
        EXPECT_EQ(reduced.data[1], value.data[1]);
        EXPECT_TRUE(((reduced.data[2] | reduced.data[3]) == 0) && ((reduced.data[1] >> 63) == 0))
            << "from_montgomery_form_reduced() must be canonical (< 2^127) for a 127-bit value";
    }
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
// Internal Representation Tests for Big Fields
// ================================

// Shows that the raw limbs of an addition can have a result which is not automatically reduced, even when we are in the
// 256-bit field range.
TYPED_TEST(PrimeFieldTwoFiftySixTest, AddYieldsLimbsBiggerThanModulus)
{
    using F = TypeParam;

    auto small_number = 10;
    F small_field_elt = F(small_number).from_montgomery_form();
    uint256_t small_number_from_limbs(
        small_field_elt.data[0], small_field_elt.data[1], small_field_elt.data[2], small_field_elt.data[3]);
    uint256_t big_number = uint256_t(F::modulus) - 1;
    F big_field_elt = F(big_number).from_montgomery_form();
    uint256_t big_number_from_limbs(
        big_field_elt.data[0], big_field_elt.data[1], big_field_elt.data[2], big_field_elt.data[3]);

    // make sure that the limbs combine to the number. (this is not immediate because we internall represent via
    // Montgomery form. Here, it is guaranteed because we call `.from_montgomery_form()`).
    EXPECT_EQ(small_number_from_limbs, small_number);
    EXPECT_EQ(big_number, big_number_from_limbs);

    F result = small_field_elt + big_field_elt;

    // Extract the raw limbs from result
    uint256_t result_from_limbs(result.data[0], result.data[1], result.data[2], result.data[3]);

    // Check if the uint256_t from limbs is >= p
    bool is_gte_modulus = result_from_limbs >= F::modulus;
    EXPECT_EQ(is_gte_modulus, true);
}

// ================================
// Single Non-Zero Limb Edge Cases
// ================================
// These tests verify correctness when the internal Montgomery representation has only one
// non-zero limb, which can expose carry propagation bugs in Montgomery multiplication and
// other operations.

TYPED_TEST(PrimeFieldTest, SingleLimbArithmetic)
{
    using F = TypeParam;

    // Test values for each limb position (only one limb non-zero at a time)
    // For limb 3, use modulus.data[3] / 2 to stay below modulus
    constexpr std::array<uint64_t, 4> limb_values = {
        0xDEADBEEFCAFEBABEULL, 0xFEDCBA9876543210ULL, 0x123456789ABCDEF0ULL, F::modulus.data[3] / 2
    };

    for (size_t limb_idx = 0; limb_idx < 4; ++limb_idx) {
        std::array<uint64_t, 4> limbs = { 0, 0, 0, 0 };
        limbs[limb_idx] = limb_values[limb_idx];

        F a = create_element_with_limbs<F>(limbs[0], limbs[1], limbs[2], limbs[3]);
        F b = F::random_element();
        uint256_t a_val = uint256_t(a);
        uint256_t b_val = uint256_t(b);

        // Test add
        F sum = a + b;
        uint512_t expected_sum = (uint512_t(a_val) + uint512_t(b_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(sum), expected_sum.lo) << "Add failed for limb " << limb_idx;

        // Test sub
        F diff = a - b;
        uint512_t expected_diff = (uint512_t(a_val) + uint512_t(F::modulus) - uint512_t(b_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(diff), expected_diff.lo) << "Sub failed for limb " << limb_idx;

        // Test mul
        F prod = a * b;
        uint512_t expected_prod = (uint512_t(a_val) * uint512_t(b_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(prod), expected_prod.lo) << "Mul failed for limb " << limb_idx;

        // Test sqr
        F sq = a.sqr();
        uint512_t expected_sq = (uint512_t(a_val) * uint512_t(a_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(sq), expected_sq.lo) << "Sqr failed for limb " << limb_idx;
    }
}

// Test multiplication of two single-limb values (different limbs)
TYPED_TEST(PrimeFieldTest, CrossLimbMultiplication)
{
    using F = TypeParam;

    // Create elements with single non-zero limbs at different positions
    // For limb 3, use modulus.data[3] / 2 to stay below modulus
    constexpr std::array<std::array<uint64_t, 4>, 4> limb_patterns = { { { { 0xABCDEF0123456789ULL, 0, 0, 0 } },
                                                                         { { 0, 0x9876543210FEDCBAULL, 0, 0 } },
                                                                         { { 0, 0, 0x1111222233334444ULL, 0 } },
                                                                         { { 0, 0, 0, F::modulus.data[3] / 2 } } } };

    // Build field elements and their uint256_t values
    std::array<F, 4> elems;
    std::array<uint256_t, 4> vals;
    for (size_t i = 0; i < 4; ++i) {
        elems[i] = create_element_with_limbs<F>(
            limb_patterns[i][0], limb_patterns[i][1], limb_patterns[i][2], limb_patterns[i][3]);
        vals[i] = uint256_t(elems[i]);
    }

    // Test all pairwise multiplications
    for (size_t i = 0; i < 4; ++i) {
        for (size_t j = 0; j < 4; ++j) {
            F prod = elems[i] * elems[j];
            uint512_t expected_prod = (uint512_t(vals[i]) * uint512_t(vals[j])) % uint512_t(F::modulus);
            EXPECT_EQ(uint256_t(prod), expected_prod.lo) << "Failed for limb " << i << " * limb " << j;
        }
    }
}

// ================================
// Edge Cases Near Modulus Boundary
// ================================

// Test multiplication and squaring of values near the modulus
TYPED_TEST(PrimeFieldTest, NearModulusMultiplication)
{
    using F = TypeParam;

    for (uint64_t offset = 1; offset <= 10; ++offset) {
        uint256_t val = F::modulus - offset;
        F a(val);
        uint256_t a_val = uint256_t(a);

        // Test squaring
        F sq = a.sqr();
        uint512_t expected_sq = (uint512_t(a_val) * uint512_t(a_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(sq), expected_sq.lo) << "Sqr failed for (p - " << offset << ")^2";

        // Test a * (a + 1)
        F a_plus_one = a + F(1);
        uint256_t a_plus_one_val = uint256_t(a_plus_one);
        F prod = a * a_plus_one;
        uint512_t expected_prod = (uint512_t(a_val) * uint512_t(a_plus_one_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(prod), expected_prod.lo)
            << "Mul failed for (p - " << offset << ") * (p - " << offset << " + 1)";
    }
}

// ================================
// Boundary Tests
// ================================
// Test arithmetic with internal representations near the representation boundary.
// - 254-bit fields (modulus.data[3] < MODULUS_TOP_LIMB_LARGE_THRESHOLD): boundary is 2p
// - 256-bit fields (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD): boundary is 2^256 - 1

TYPED_TEST(PrimeFieldTest, BoundaryArithmetic)
{
    using F = TypeParam;
    constexpr std::array<uint64_t, 3> offsets = { 1, 2, 3 };

    for (uint64_t offset : offsets) {
        F a;
        if constexpr (F::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
            // 256-bit fields: construct element with internal representation near 2^256 - offset.
            // (p - offset) + (2^256 - p) = 2^256 - offset, which has field value -offset.
            uint256_t two_256_minus_p = uint256_t(0) - F::modulus;
            F two_256_minus_p_elt(two_256_minus_p);
            two_256_minus_p_elt.self_from_montgomery_form_reduced();
            F p_minus_offset(F::modulus - offset);
            p_minus_offset.self_from_montgomery_form_reduced();
            a = p_minus_offset + two_256_minus_p_elt;

            // Verify internal representation is 2^256 - offset
            if (offset == 1) {
                for (size_t i = 0; i < 4; ++i) {
                    EXPECT_EQ(a.data[i], 0xFFFFFFFFFFFFFFFFULL);
                }
            }
        } else {
            // 254-bit fields: construct element with internal representation near 2p - (offset + 1).
            // (p - 1) + (p - offset) = 2p - (offset + 1), which has field value -(offset + 1).
            F p_minus_one(F::modulus - 1);
            p_minus_one.self_from_montgomery_form_reduced();
            F p_minus_offset(F::modulus - offset);
            p_minus_offset.self_from_montgomery_form_reduced();
            a = p_minus_one + p_minus_offset;
        }

        uint256_t a_val = uint256_t(a);
        F b = F::random_element();

        // Test all operations
        F sum = a + b;
        uint512_t expected_sum = (uint512_t(a_val) + uint512_t(uint256_t(b))) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(sum), expected_sum.lo) << "Add failed for offset " << offset;

        F diff = a - b;
        uint512_t expected_diff =
            (uint512_t(a_val) + uint512_t(F::modulus) - uint512_t(uint256_t(b))) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(diff), expected_diff.lo) << "Sub failed for offset " << offset;

        F prod = a * b;
        uint512_t expected_prod = (uint512_t(a_val) * uint512_t(uint256_t(b))) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(prod), expected_prod.lo) << "Mul failed for offset " << offset;

        F sq = a.sqr();
        uint512_t expected_sq = (uint512_t(a_val) * uint512_t(a_val)) % uint512_t(F::modulus);
        EXPECT_EQ(uint256_t(sq), expected_sq.lo) << "Sqr failed for offset " << offset;
    }
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

// This test requires exception support; in WASM builds (BB_NO_EXCEPTIONS),
// throw_or_abort calls abort() instead of throwing, so EXPECT_THROW cannot work.
#ifndef BB_NO_EXCEPTIONS
TYPED_TEST(PrimeFieldTest, MsgpackRejectsNonCanonical)
{
    using F = TypeParam;

    // Use a small value so that (value + modulus) is guaranteed to fit in 256 bits,
    // even for fields with moduli close to 2^256 (e.g., secp256k1, secp256r1).
    F a = F(1);
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, a);

    // Find the 32-byte binary payload inside the msgpack buffer.
    // pack_bin(32) produces: 0xc4 0x20 <32 bytes>
    uint8_t* buf = reinterpret_cast<uint8_t*>(buffer.data());
    size_t buf_size = buffer.size();
    uint8_t* field_bytes = nullptr;
    for (size_t i = 0; i + 33 <= buf_size; i++) {
        if (buf[i] == 0xc4 && buf[i + 1] == 0x20) {
            field_bytes = &buf[i + 2];
            break;
        }
    }
    ASSERT_NE(field_bytes, nullptr) << "Could not find 32-byte bin payload in msgpack buffer";

    // Replace the payload with (1 + modulus), a non-canonical encoding of 1.
    uint256_t non_canonical = uint256_t(1) + F::modulus;
    for (int i = 31; i >= 0; i--) {
        field_bytes[i] = static_cast<uint8_t>(non_canonical.data[0] & 0xFF);
        non_canonical >>= 8;
    }

    // Deserializing the mutated buffer must throw
    EXPECT_THROW(
        {
            msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
            F result;
            oh.get().convert(result);
        },
        std::runtime_error);
}
#else
TYPED_TEST(PrimeFieldTest, MsgpackRejectsNonCanonical)
{
    GTEST_SKIP() << "Skipping: throw_or_abort calls abort() when BB_NO_EXCEPTIONS is defined";
}
#endif

// ================================
// Montgomery Form Conversion Tests (254-bit fields)
// ================================

/**
 * Test that from_montgomery_form produces results in the valid range, [0, 2p - 1], WITHOUT needing further reduction.
 */
TYPED_TEST(PrimeFieldTwoFiftyFourTest, FromMontgomeryFormNoReductionNeeded)
{
    using F = TypeParam;
    constexpr uint256_t two_p = F::modulus + F::modulus;

    // Test 1: Random elements
    for (size_t i = 0; i < 100; i++) {
        F a = F::random_element();

        // Get internal limbs before conversion
        uint256_t a_internal(a.data[0], a.data[1], a.data[2], a.data[3]);

        // Verify input is in [0, 2p) range (coarse representation)
        ASSERT_LT(a_internal, two_p) << "Input not in coarse form";

        F result = a.from_montgomery_form();

        // Check result is already in [0, 2p) range
        uint256_t result_internal(result.data[0], result.data[1], result.data[2], result.data[3]);
        EXPECT_LT(result_internal, two_p) << "Result of from_montgomery_form exceeds [0, 2p) range";
    }

    // Test 2: Edge cases - elements near the boundary 2p
    // Construct elements with internal representation near 2p - 1
    for (uint64_t offset = 1; offset <= 10; offset++) {
        // Create element with internal representation = (2p - offset)
        // We do this by adding (p - 1) + (p - offset + 1) = 2p - offset
        F p_minus_one(F::modulus - 1);
        p_minus_one.self_from_montgomery_form();
        F p_minus_offset_plus_one(F::modulus - offset + 1);
        p_minus_offset_plus_one.self_from_montgomery_form();
        F a = p_minus_one + p_minus_offset_plus_one;

        // Verify we have internal representation near 2p
        uint256_t a_internal(a.data[0], a.data[1], a.data[2], a.data[3]);
        ASSERT_LT(a_internal, two_p) << "Test setup: element not in valid range";

        F result = a.from_montgomery_form();

        uint256_t result_internal(result.data[0], result.data[1], result.data[2], result.data[3]);
        EXPECT_LT(result_internal, two_p)
            << "Edge case: Result of from_montgomery_form exceeds [0, 2p) for offset " << offset;
    }
}

/**
 * Test that to_montgomery_form produces results in the valid range, [0, 2p - 1], WITHOUT needing further reduction.
 */
TYPED_TEST(PrimeFieldTwoFiftyFourTest, ToMontgomeryFormNoReductionNeeded)
{
    using F = TypeParam;
    constexpr uint256_t two_p = F::modulus + F::modulus;

    // Test 1: Random elements
    for (size_t i = 0; i < 100; i++) {
        F a = F::random_element();

        // Get internal limbs before conversion
        uint256_t a_internal(a.data[0], a.data[1], a.data[2], a.data[3]);

        // Verify input is in [0, 2p) range (coarse representation)
        ASSERT_LT(a_internal, two_p) << "Input not in coarse form";

        F result = a.to_montgomery_form();

        // Check result is already in [0, 2p) range
        uint256_t result_internal(result.data[0], result.data[1], result.data[2], result.data[3]);
        EXPECT_LT(result_internal, two_p) << "Result of to_montgomery_form exceeds [0, 2p) range";
    }

    // Test 2: Edge cases - elements near the boundary 2p
    // Construct elements with internal representation near 2p - 1
    for (uint64_t offset = 1; offset <= 10; offset++) {
        // Create element with internal representation = (2p - offset)
        // We do this by adding (p - 1) + (p - offset + 1) = 2p - offset
        F p_minus_one(F::modulus - 1);
        p_minus_one.self_from_montgomery_form();
        F p_minus_offset_plus_one(F::modulus - offset + 1);
        p_minus_offset_plus_one.self_from_montgomery_form();
        F a = p_minus_one + p_minus_offset_plus_one;

        // Verify we have internal representation near 2p
        uint256_t a_internal(a.data[0], a.data[1], a.data[2], a.data[3]);
        ASSERT_LT(a_internal, two_p) << "Test setup: element not in valid range";

        F result = a.to_montgomery_form();

        uint256_t result_internal(result.data[0], result.data[1], result.data[2], result.data[3]);
        EXPECT_LT(result_internal, two_p)
            << "Edge case: Result of to_montgomery_form exceeds [0, 2p) for offset " << offset;
    }
}

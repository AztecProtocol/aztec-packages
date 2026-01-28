/**
 * @brief BN254 base field (fq) specific tests.
 *
 * Other field arithmetic tests (both compile-time and runtime) are in ecc/fields/generic_field.test.cpp and
 * ecc/fields/prime_field.test.cpp. This file contains only BN254-specific functionality:
 * - Endomorphism scalar decomposition
 * - Buffer serialization (tests specific byte layout)
 * - Regression tests for specific values
 */

#include "fq.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

// ================================
// Fixed Compile-Time Tests (field-specific expected values)
// These tests use hardcoded expected values that are only valid for native builds (R = 2^256).
// WASM uses R = 2^261.
// ================================

#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
TEST(BN254Fq, CompileTimeMultiplication)
{
    constexpr fq a = uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };
    constexpr fq b = uint256_t{ 0x744fc10aec23e56aUL, 0x5dea4788a3b936a6UL, 0xa0a89f4a8af01df1UL, 0x72ae28836807df3UL };
    constexpr fq expected =
        uint256_t{ 0x6c0a789c0028fd09UL, 0xca9520d84c684efaUL, 0xcbf3f7b023a852b4UL, 0x1b2e4dac41400621UL };

    constexpr fq result = a * b;
    static_assert(result == expected);
}

TEST(BN254Fq, CompileTimeSquaring)
{
    constexpr fq a = uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };
    constexpr fq expected =
        uint256_t{ 0x41081a42fdaa7e23UL, 0x44d1140f756ed419UL, 0x53716b0a6f253e63UL, 0xb1a0b04044d75fUL };

    constexpr fq result = a.sqr();
    static_assert(result == expected);
}

TEST(BN254Fq, CompileTimeAddition)
{
    constexpr fq a{ 0x7d2e20e82f73d3e8, 0x8e50616a7a9d419d, 0xcdc833531508914b, 0xd510253a2ce62c };
    constexpr fq b{ 0x2829438b071fd14e, 0xb03ef3f9ff9274e, 0x605b671f6dc7b209, 0x8701f9d971fbc9 };
    constexpr fq expected{ 0xa55764733693a536, 0x995450aa1a9668eb, 0x2e239a7282d04354, 0x15c121f139ee1f6 };

    constexpr fq result = a + b;
    static_assert(result == expected);
}

TEST(BN254Fq, CompileTimeSubtraction)
{
    constexpr fq a{ 0xd68d01812313fb7c, 0x2965d7ae7c6070a5, 0x08ef9af6d6ba9a48, 0x0cb8fe2108914f53 };
    constexpr fq b{ 0x2cd2a2a37e9bf14a, 0xebc86ef589c530f6, 0x75124885b362b8fe, 0x1394324205c7a41d };
    constexpr fq expected{ 0xe5daeaf47cf50779, 0xd51ed34a5b0d0a3c, 0x4c2d9827a4d939a6, 0x29891a51e3fb4b5f };

    constexpr fq result = a - b;
    static_assert(result == expected);
}
#endif

TEST(BN254Fq, CompileTimeInversion)
{
    constexpr fq a = uint256_t{ 0xa9b879029c49e60eUL, 0x2517b72250caa7b3UL, 0x6b86c81105dae2d1UL, 0x3a81735d5aec0c3UL };
    constexpr fq inv = a.invert();
    // Verify a * a^-1 = 1
    static_assert(a * inv == fq::one());
}

// ================================
// Montgomery Form
// ================================

TEST(BN254Fq, FromMontgomeryForm)
{
    constexpr fq t0 = fq::one();
    constexpr fq result = t0.from_montgomery_form();
    constexpr fq expected{ 0x01, 0x00, 0x00, 0x00 };
    EXPECT_EQ(result, expected);
}

TEST(BN254Fq, MontgomeryConsistencyCheck)
{
    fq a = fq::random_element();
    fq b = fq::random_element();
    fq aR;
    fq bR;
    fq aRR;
    fq bRR;
    fq bRRR;
    fq result_a;
    fq result_b;
    fq result_c;
    fq result_d;
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
    result_a.self_from_montgomery_form(); // abRR
    result_a.self_from_montgomery_form(); // abR
    result_a.self_from_montgomery_form(); // ab
    result_c.self_from_montgomery_form(); // ab
    result_d.self_to_montgomery_form();   // ab
    EXPECT_EQ((result_a == result_c), true);
    EXPECT_EQ((result_a == result_d), true);
}

// ================================
// Arithmetic Consistency
// ================================

TEST(BN254Fq, AddMulConsistency)
{
    fq multiplicand = { 0x09, 0, 0, 0 };
    multiplicand.self_to_montgomery_form();

    fq a = fq::random_element();
    fq result;
    result = a + a;   // 2
    result += result; // 4
    result += result; // 8
    result += a;      // 9

    fq expected;
    expected = a * multiplicand;

    EXPECT_EQ((result == expected), true);
}

TEST(BN254Fq, SubMulConsistency)
{
    fq multiplicand = { 0x05, 0, 0, 0 };
    multiplicand.self_to_montgomery_form();

    fq a = fq::random_element();
    fq result;
    result = a + a;   // 2
    result += result; // 4
    result += result; // 8
    result -= a;      // 7
    result -= a;      // 6
    result -= a;      // 5

    fq expected;
    expected = a * multiplicand;

    EXPECT_EQ((result == expected), true);
}

TEST(BN254Fq, Invert)
{
    fq input = fq::random_element();
    fq inverse = input.invert();
    fq result = input * inverse;
    result = result.reduce_once();
    result = result.reduce_once();
    EXPECT_EQ(result, fq::one());
}

TEST(BN254Fq, InvertOneIsOne)
{
    fq result = fq::one();
    result = result.invert();
    EXPECT_EQ((result == fq::one()), true);
}

TEST(BN254Fq, Sqrt)
{
    fq input = fq::one();
    auto [is_sqr, root] = input.sqrt();
    fq result = root.sqr();
    EXPECT_EQ(result, input);
}

TEST(BN254Fq, SqrtRandom)
{
    for (size_t i = 0; i < 1; ++i) {
        fq input = fq::random_element().sqr();
        auto [is_sqr, root] = input.sqrt();
        fq root_test = root.sqr();
        EXPECT_EQ(root_test, input);
    }
}

TEST(BN254Fq, OneAndZero)
{
    fq result;
    result = fq::one() - fq::one();
    EXPECT_EQ((result == fq::zero()), true);
}

TEST(BN254Fq, Copy)
{
    fq result = fq::random_element();
    fq expected;
    fq::__copy(result, expected);
    EXPECT_EQ((result == expected), true);
}

TEST(BN254Fq, Neg)
{
    fq a = fq::random_element();
    fq b;
    b = -a;
    fq result;
    result = a + b;
    EXPECT_EQ((result == fq::zero()), true);
}

// ================================
// Endomorphism
// ================================


TEST(BN254Fq, SplitIntoEndomorphismScalars)
{
    fq k = fq::random_element();
    fq k1 = 0;
    fq k2 = 0;

    fq::split_into_endomorphism_scalars(k, k1, k2);

    fq result = 0;

    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    EXPECT_LT(uint256_t(k1).get_msb(), 128);
    EXPECT_LT(uint256_t(k2).get_msb(), 128);

    result = k2 * fq::cube_root_of_unity();
    result = k1 - result;

    result.self_from_montgomery_form();
    EXPECT_EQ(result, k);
}

TEST(BN254Fq, SplitIntoEndomorphismScalarsSimple)
{
    fq input = { 1, 0, 0, 0 };
    fq k = { 0, 0, 0, 0 };
    fq k1 = { 0, 0, 0, 0 };
    fq k2 = { 0, 0, 0, 0 };
    fq::__copy(input, k);

    fq::split_into_endomorphism_scalars(k, k1, k2);

    fq result{ 0, 0, 0, 0 };
    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    EXPECT_LT(uint256_t(k1).get_msb(), 128);
    EXPECT_LT(uint256_t(k2).get_msb(), 128);

    fq beta = fq::cube_root_of_unity();
    result = k2 * beta;
    result = k1 - result;

    result.self_from_montgomery_form_reduced();
    for (size_t i = 0; i < 4; ++i) {
        EXPECT_EQ(result.data[i], k.data[i]);
    }
}

TEST(BN254Fq, SplitIntoEndomorphismEdgeCase)
{
    fq input = { 0, 0, 1, 0 }; // 2^128
    fq k = { 0, 0, 0, 0 };
    fq k1 = { 0, 0, 0, 0 };
    fq k2 = { 0, 0, 0, 0 };
    fq::__copy(input, k);

    fq::split_into_endomorphism_scalars(k, k1, k2);

    fq result{ 0, 0, 0, 0 };
    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    EXPECT_LT(uint256_t(k1).get_msb(), 128);
    EXPECT_LT(uint256_t(k2).get_msb(), 128);

    fq beta = fq::cube_root_of_unity();
    result = k2 * beta;
    result = k1 - result;

    result.self_from_montgomery_form_reduced();
    for (size_t i = 0; i < 4; ++i) {
        EXPECT_EQ(result.data[i], k.data[i]);
    }
}

// ================================
// Buffer Serialization
// ================================

TEST(BN254Fq, SerializeToBuffer)
{
    std::array<uint8_t, 32> buffer;
    fq a = { 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };
    a = a.to_montgomery_form();

    fq::serialize_to_buffer(a, &buffer[0]);

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

TEST(BN254Fq, SerializeFromBuffer)
{
    std::array<uint8_t, 32> buffer;
    fq expected = { 0x1234567876543210, 0x2345678987654321, 0x3456789a98765432, 0x006789abcba98765 };

    fq::serialize_to_buffer(expected, &buffer[0]);
    fq result = fq::serialize_from_buffer(&buffer[0]);

    EXPECT_EQ(result, expected);
}

// ================================
// Regression Tests
// ================================
// TEST to check we don't have 0^0=0
TEST(BN254Fq, PowRegressionCheck)
{
    fq zero = fq::zero();
    fq one = fq::one();
    EXPECT_EQ(zero.pow(uint256_t(0)), one);
}

// AUDITTODO: should we remove this test?
TEST(BN254Fq, SqrRegression)
{
    std::array<uint256_t, 7> values = {
        uint256_t(0xbdf876654b0ade1b, 0x2c3a66c64569f338, 0x2cd8bf2ec1fe55a3, 0x11c0ea9ee5693ede),
        uint256_t(0x551b14ec34f2151c, 0x62e472ed83a2891e, 0xf208d5e5c9b5b3fb, 0x14315aeaf6027d8c),
        uint256_t(0xad39959ae8013750, 0x7f1d2c709ab84cbb, 0x408028b80a60c2f1, 0x1dcd116fc26f856e),
        uint256_t(0x95e967d30dcce9ce, 0x56139274241d2ea1, 0x85b19c1c616ec456, 0x1f1780cf9bf045b4),
        uint256_t(0xbe841c861d8eb80e, 0xc5980d67a21386c0, 0x5fd1f1afecddeeb5, 0x24dbb8c1baea0250),
        uint256_t(0x3ae4b3a27f05d6e3, 0xc5f6785b12df8d29, 0xc3a6c5f095103046, 0xd6b94cb2cc1fd4b),
        uint256_t(0xc003c71932a6ced5, 0x6302a413f68e26e9, 0x2ed4a9b64d69fad, 0xfe61ffab1ae227d)
    };
    for (auto& value : values) {
        fq element(value);
        EXPECT_EQ(element.sqr(), element * element);
    }
}
// ==============================
// Reduction equivalence
// ==============================

// A 512-bit value big_num  can be reduced mod p in two ways:
// 1. Direct: (big_num % p)
// 2. Split: fq(lo) + fq(2^256) * fq(hi), where big_num = lo + 2^256 * hi
// This test verifies both methods produce the same result.
TEST(BN254Fq, Uint512ReductionEquivalence)
{
    uint512_t random_uint512 = engine.get_random_uint512();
    auto random_lo = fq(random_uint512.lo);
    auto random_hi = fq(random_uint512.hi);
    uint512_t q(fq::modulus);
    constexpr auto pow_2_256 = fq(uint256_t(1) << 128).sqr();
    EXPECT_EQ(random_lo + pow_2_256 * random_hi, fq((random_uint512 % q).lo));
}

/**
 * @brief BN254 base field (fq) specific tests.
 *
 * Other field arithmetic tests (both compile-time and runtime) are in ecc/fields/generic_field.test.cpp and
 * ecc/fields/prime_field.test.cpp. This file contains only BN254-specific functionality:
 * - Fixed compile-time tests with field-specific expected values
 * - Endomorphism scalar decomposition
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
    constexpr fq a{ 0x83aa80986c4f06f8, 0xbd01cce5e3b3afc3, 0x1cba208cb70aa13b, 0x2a582eb35a932e0d };
    constexpr fq b{ 0x348ea47f1840a528, 0x5e6eb8e57e1b246d, 0x10852d3d36002e53, 0x280130d2f6a97aba };
    constexpr fq expected{ 0x67eaddc2ba233427, 0x3c4f7dfe46ef24a9, 0x8fecb77e2ff74d64, 0x275537b321138ee7 };

    constexpr fq result = a * b;
    static_assert(result == expected);
}

TEST(BN254Fq, CompileTimeSquaring)
{
    constexpr fq a{ 0x83aa80986c4f06f8, 0xbd01cce5e3b3afc3, 0x1cba208cb70aa13b, 0x2a582eb35a932e0d };
    constexpr fq expected{ 0xe441c0408a6fab60, 0xb94616ade6ed8752, 0x36cb53ba8e85397f, 0x17698305ec38b773 };

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
    constexpr fq a{ 0x83aa80986c4f06f8, 0xbd01cce5e3b3afc3, 0x1cba208cb70aa13b, 0x2a582eb35a932e0d };
    constexpr fq inv = a.invert();
    // Verify a * a^-1 = 1
    static_assert(a * inv == fq::one());
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

// Regression: k = ceil(m * 2^256 / endo_g2), for m an integer, previously produced negative k2 in the GLV
// splitting, causing 128-bit truncation to extract wrong values. See endomorphism_scalars.py.
TEST(BN254Fq, SplitEndomorphismNegativeK2)
{
    // clang-format off
    struct test_case { std::array<uint64_t, 4> limbs; const char* tag; };
    const std::array<test_case, 3> cases = {{
        {{ 0x71922da036dca5f4, 0xd970a56127fb8227, 0x59e26bcea0d48bac, 0x0 }, "m=1"},
        {{ 0xe3245b406db94be8, 0xb2e14ac24ff7044e, 0xb3c4d79d41a91759, 0x0 }, "m=2"},
        {{ 0x54b688e0a495f1dc, 0x8c51f02377f28676, 0x0da7436be27da306, 0x1 }, "m=3"},
    }};
    // clang-format on

    fq lambda = fq::cube_root_of_unity();

    for (const auto& tc : cases) {
        fq k{ tc.limbs[0], tc.limbs[1], tc.limbs[2], tc.limbs[3] };
        fq k1{ 0, 0, 0, 0 };
        fq k2{ 0, 0, 0, 0 };

        fq::split_into_endomorphism_scalars(k, k1, k2);

        k1.self_to_montgomery_form();
        k2.self_to_montgomery_form();
        fq result = k1 - k2 * lambda;
        result.self_from_montgomery_form();

        EXPECT_EQ(result, k) << tc.tag;
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
// Regression Tests
// ================================

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

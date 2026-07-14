/**
 * @brief BN254 scalar field (fr) specific tests.
 *
 * Other field arithmetic tests (both compile-time and runtime) are in ecc/fields/generic_field.test.cpp and
 * ecc/fields/prime_field.test.cpp. This file contains only BN254 scalar field specific functionality:
 * - Fixed compile-time tests with field-specific expected values
 * - Endomorphism scalar decomposition
 */

#include "fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

// ================================
// Fixed Compile-Time Tests (field-specific expected values)
// These tests use hardcoded expected values for the unified Montgomery radix R = 2^256.
// ================================

TEST(BN254Fr, CompileTimeMultiplication)
{
    constexpr fr a{ 0x20565a572c565a66, 0x7bccd0f01f5f7bff, 0x63ec2beaad64711f, 0x624953caaf44a814 };
    constexpr fr b{ 0xa17307a2108adeea, 0x74629976c14c5e2b, 0x9ce6f072ab1740ee, 0x398c753702b2bef0 };
    constexpr fr expected{ 0xe8cdd06343386834, 0x8cbb3f556258a9af, 0x5aef2f34f2d66fd4, 0x2d8263c7e10213ca };

    constexpr fr result = a * b;
    static_assert(result == expected);
}

TEST(BN254Fr, CompileTimeSquaring)
{
    constexpr fr a{ 0x20565a572c565a66, 0x7bccd0f01f5f7bff, 0x63ec2beaad64711f, 0x624953caaf44a814 };
    constexpr fr expected{ 0x3e928bdb06267b99, 0x1e5834571f52dfbf, 0x3d63bdf9bf7d0d4b, 0x353bb31adaa033c7 };

    constexpr fr result = a.sqr();
    static_assert(result == expected);
}

TEST(BN254Fr, CompileTimeAddition)
{
    constexpr fr a{ 0x20565a572c565a66, 0x7bccd0f01f5f7bff, 0x63ec2beaad64711f, 0x624953caaf44a814 };
    constexpr fr b{ 0xa17307a2108adeea, 0x74629976c14c5e2b, 0x9ce6f072ab1740ee, 0x398c753702b2bef0 };
    constexpr fr expected{ 0x3a0576d15ce1394e, 0x9fc799d5ed38f908, 0x903290f055790153, 0x3b0d2c1bef9426b1 };

    constexpr fr result = a + b;
    static_assert(result == expected);
}

TEST(BN254Fr, CompileTimeSubtraction)
{
    constexpr fr a{ 0xcfbcfcf457cf2d38, 0x7b27af26ce62aa61, 0xf0378e90d48f2b92, 0x4734b22cb21ded };
    constexpr fr b{ 0x569fdb1db5198770, 0x446ddccef8347d52, 0xef215227182d22a, 0x8281b4fb109306 };
    constexpr fr expected{ 0xe10cfe82b5a5ca, 0x8721a2e8c9a10e32, 0x51e604db660f0a22, 0x608d4fe2f404cb3b };

    constexpr fr result = a - b;
    static_assert(result == expected);
}

TEST(BN254Fr, CompileTimeInversion)
{
    constexpr fr a{ 0x20565a572c565a66, 0x7bccd0f01f5f7bff, 0x63ec2beaad64711f, 0x624953caaf44a814 };
    constexpr fr inv = a.invert();
    // Verify a * a^-1 = 1
    static_assert(a * inv == fr::one());
}

// ================================
// BN254 Scalar Field Specific
// ================================

TEST(BN254Fr, SplitIntoEndomorphismScalars)
{
    fr k = fr::random_element();
    fr k1 = { 0, 0, 0, 0 };
    fr k2 = { 0, 0, 0, 0 };

    fr::split_into_endomorphism_scalars(k, k1, k2);

    fr result{ 0, 0, 0, 0 };

    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();

    EXPECT_LT(uint256_t(k1).get_msb(), 128);
    EXPECT_LT(uint256_t(k2).get_msb(), 128);

    fr lambda = fr::cube_root_of_unity();
    result = k2 * lambda;
    result = k1 - result;

    result.self_from_montgomery_form();
    EXPECT_EQ(result, k);
}

TEST(BN254Fr, SplitIntoEndomorphismScalarsSimple)
{
    fr input = { 1, 0, 0, 0 };
    fr k = { 0, 0, 0, 0 };
    fr k1 = { 0, 0, 0, 0 };
    fr k2 = { 0, 0, 0, 0 };
    fr::__copy(input, k);

    fr::split_into_endomorphism_scalars(k, k1, k2);
    fr result{ 0, 0, 0, 0 };
    k1.self_to_montgomery_form_reduced();
    k2.self_to_montgomery_form_reduced();

    EXPECT_LT(uint256_t(k1).get_msb(), 128);
    EXPECT_LT(uint256_t(k2).get_msb(), 128);

    fr lambda = fr::cube_root_of_unity();
    result = k2 * lambda;
    result = k1 - result;

    result.self_from_montgomery_form_reduced();
    for (size_t i = 0; i < 4; ++i) {
        EXPECT_EQ(result.data[i], k.data[i]);
    }
}

// Regression: k = ceil(m * 2^256 / endo_g2), for m an integer, previously produced negative k2 in the GLV
// splitting, causing 128-bit truncation to extract wrong values.
TEST(BN254Fr, SplitEndomorphismNegativeK2)
{
    // clang-format off
    struct test_case { std::array<uint64_t, 4> limbs; const char* tag; };
    const std::array<test_case, 3> cases = {{
        {{ 0x01624731e1195570, 0x3ba491482db4da14, 0x59e26bcea0d48bac, 0x0 }, "m=1"},
        {{ 0x02c48e63c232aadf, 0x774922905b69b428, 0xb3c4d79d41a91758, 0x0 }, "m=2"},
        {{ 0x0426d595a34c004e, 0xb2edb3d8891e8e3c, 0x0da7436be27da304, 0x1 }, "m=3"},
    }};
    // clang-format on

    fr lambda = fr::cube_root_of_unity();

    for (const auto& tc : cases) {
        fr k{ tc.limbs[0], tc.limbs[1], tc.limbs[2], tc.limbs[3] };
        fr k1{ 0, 0, 0, 0 };
        fr k2{ 0, 0, 0, 0 };

        fr::split_into_endomorphism_scalars(k, k1, k2);

        k1.self_to_montgomery_form();
        k2.self_to_montgomery_form();
        fr result = k1 - k2 * lambda;
        result.self_from_montgomery_form();

        EXPECT_EQ(result, k) << tc.tag;
    }
}

// ================================
// Regression / Optimization Tests
// ================================

// Tests that (lo + 2^256 * hi) mod r == ((lo|hi) % r) in uint512_t
// This validates the optimization of avoiding slow uint512_t modulo
TEST(BN254Fr, EquivalentRandomness)
{
    uint512_t random_uint512 = engine.get_random_uint512();
    auto random_lo = fr(random_uint512.lo);
    auto random_hi = fr(random_uint512.hi);
    uint512_t r(fr::modulus);
    constexpr auto pow_2_256 = fr(uint256_t(1) << 128).sqr();
    EXPECT_EQ(random_lo + pow_2_256 * random_hi, fr((random_uint512 % r).lo));
}

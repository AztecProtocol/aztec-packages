#include "secp256r1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

// Field tests (add, sub, mul, sqr, sqrt, montgomery form) are in:
// - barretenberg/ecc/fields/field.test.cpp (generic field tests)
// - barretenberg/ecc/fields/prime_field.test.cpp (prime field specific tests)
// The tests below are for the secp256r1 elliptic curve group operations.

TEST(secp256r1, CurveCoefficients)
{
    secp256r1::fq expected_a = secp256r1::fq("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc");
    secp256r1::fq expected_b = secp256r1::fq("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");

    EXPECT_EQ(secp256r1::G1Params::a, expected_a);
    EXPECT_EQ(secp256r1::G1Params::b, expected_b);
}

TEST(secp256r1, GeneratorOnCurve)
{
    secp256r1::g1::element result = secp256r1::g1::one;
    secp256r1::fq expected_x = secp256r1::fq("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
    secp256r1::fq expected_y = secp256r1::fq("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");

    EXPECT_EQ(result.x, expected_x);
    EXPECT_EQ(result.y, expected_y);
    EXPECT_EQ(result.on_curve(), true);
}

/**
 * @brief We had an issue where we added field elements and subtracted a prime depending on the 2²⁵⁶ overflow. This
 * was incorrect. Sometimes we need to subtract the prime twice. The same is true for subtractions
 *
 */
TEST(secp256r1, AdditionSubtractionRegressionCheck)
{
    secp256r1::fq fq1(uint256_t{ 0xfffffe0000000200, 0x200fffff9ff, 0xfffffbfffffffe00, 0xfffffbff00000400 });
    secp256r1::fq fq2(uint256_t{ 0xfffffe0000000200, 0x200fffff9ff, 0xfffffbfffffffe00, 0xfffffbff00000400 });
    secp256r1::fq fq3(0);
    secp256r1::fq fq4(0);
    fq1 += secp256r1::fq(secp256r1::fq::modulus_minus_two);
    fq1 += secp256r1::fq(2);

    fq3 -= fq1;
    fq4 -= fq2;
    EXPECT_EQ(fq1 + fq1, fq2 + fq2);
    EXPECT_EQ(fq3, fq4);
}

#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
TEST(secp256r1, MontgomeryMulBigBug)
{
    secp256r1::fr a;
    a.data[0] = 0xC5BF4F6AFF993D09;
    a.data[1] = 0xA3361BDA67E62E0E;
    a.data[2] = 0xAAAAAAAAAAAAAAAA;
    a.data[3] = 0xFFFFFFFFE38E38E3;
    secp256r1::fr a_sqr = a.sqr();
    secp256r1::fr expected(uint256_t{ 0x57abc6aa0349c084, 0x65b21b232a4cb7a5, 0x5ba781948b0fcd6e, 0xd6e9e0644bda12f7 });
    EXPECT_EQ((a_sqr == expected), true);
}
#endif

TEST(secp256r1, CheckPrecomputedGenerators)
{
    ASSERT_TRUE((bb::check_precomputed_generators<secp256r1::g1, "biggroup offset generator", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<secp256r1::g1, "biggroup table offset generator", 1UL>()));
}

// Hacky: wasm does not properly find main() from gmock_main.
// We only want to run wasm tests specifically for ecc ops as our field handling is different.
// We need to make sure the hardcoded generators make sense.
// As this is our narrow focus, we hack this so ecc_tests can run.
#ifdef __wasm__
GTEST_API_ int main(int argc, char** argv)
{
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
#endif

#include "secp256k1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256k1_impl.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

// Field tests (add, sub, mul, sqr, sqrt, montgomery form) are in:
// - barretenberg/ecc/fields/field.test.cpp (generic field tests)
// - barretenberg/ecc/fields/prime_field.test.cpp (prime field specific tests)
// The tests below are for the secp256k1 elliptic curve group operations.
TEST(secp256k1, CurveCoefficients)
{
    secp256k1::fq expected_a = secp256k1::fq(0);
    secp256k1::fq expected_b = secp256k1::fq(7);

    EXPECT_EQ(secp256k1::G1Params::a, expected_a);
    EXPECT_EQ(secp256k1::G1Params::b, expected_b);
}

TEST(secp256k1, GeneratorOnCurve)
{
    secp256k1::g1::element result = secp256k1::g1::one;
    secp256k1::fq expected_x = secp256k1::fq("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
    secp256k1::fq expected_y = secp256k1::fq("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8");

    EXPECT_EQ(result.x, expected_x);
    EXPECT_EQ(result.y, expected_y);
    EXPECT_EQ(result.on_curve(), true);
}

TEST(secp256k1, CheckPrecomputedGenerators)
{
    ASSERT_TRUE((bb::check_precomputed_generators<secp256k1::g1, "biggroup offset generator", 1UL>()));
    ASSERT_TRUE((bb::check_precomputed_generators<secp256k1::g1, "biggroup table offset generator", 1UL>()));
}

TEST(secp256k1, GetEndomorphismScalars)
{
    for (size_t i = 0; i < 2048; i++) {
        secp256k1::fr k = secp256k1::fr::random_element();
        secp256k1::fr k1 = 0;
        secp256k1::fr k2 = 0;

        secp256k1::fr::split_into_endomorphism_scalars(k, k1, k2);
        bool k1_neg = false;
        bool k2_neg = false;

        if (k2.uint256_t_no_montgomery_conversion().get_msb() > 200) {
            k2 = -k2;
            k2_neg = true;
        }

        EXPECT_LT(k1.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);
        EXPECT_LT(k2.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);

        if (k1_neg) {
            k1 = -k1;
        }
        if (k2_neg) {
            k2 = -k2;
        }

        k1.self_to_montgomery_form();
        k2.self_to_montgomery_form();

        secp256k1::fr beta = secp256k1::fr::cube_root_of_unity();
        secp256k1::fr expected = k1 - k2 * beta;

        expected.self_from_montgomery_form();
        EXPECT_EQ(k, expected);
        if (k != expected) {
            break;
        }
    }
}

TEST(secp256k1, TestEndomorphismScalars)
{
    secp256k1::fr k = secp256k1::fr::random_element();
    secp256k1::fr k1 = 0;
    secp256k1::fr k2 = 0;

    secp256k1::fr::split_into_endomorphism_scalars(k, k1, k2);
    bool k1_neg = false;
    bool k2_neg = false;

    if (k1.uint256_t_no_montgomery_conversion().get_msb() > 200) {
        k1 = -k1;
        k1_neg = true;
    }
    if (k2.uint256_t_no_montgomery_conversion().get_msb() > 200) {
        k2 = -k2;
        k2_neg = true;
    }

    EXPECT_LT(k1.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);
    EXPECT_LT(k2.uint256_t_no_montgomery_conversion().get_msb(), 129ULL);

    if (k1_neg) {
        k1 = -k1;
    }
    if (k2_neg) {
        k2 = -k2;
    }
    k1.self_to_montgomery_form();
    k2.self_to_montgomery_form();
    static const uint256_t secp256k1_const_lambda{
        0xDF02967C1B23BD72ULL, 0x122E22EA20816678UL, 0xA5261C028812645AULL, 0x5363AD4CC05C30E0ULL
    };

    secp256k1::fr expected = k1 - k2 * secp256k1_const_lambda;

    expected.self_from_montgomery_form();
    EXPECT_EQ(k, expected);
}

TEST(secp256k1, NegAndSelfNeg0CmpRegression)
{
    secp256k1::fq a = 0;
    secp256k1::fq a_neg = -a;
    EXPECT_EQ((a == a_neg), true);
    a = 0;
    a_neg = 0;
    a_neg.self_neg();
    EXPECT_EQ((a == a_neg), true);
}

TEST(secp256k1, MontgomeryMulBigBug)
{
    secp256k1::fq a(uint256_t{ 0xfffffffe630dc02f, 0xffffffffffffffff, 0xffffffffffffffff, 0xffffffffffffffff });
    secp256k1::fq a_sqr = a.sqr();
    secp256k1::fq expected(uint256_t{ 0x60381e557e100000, 0x0, 0x0, 0x0 });
    EXPECT_EQ((a_sqr == expected), true);
}

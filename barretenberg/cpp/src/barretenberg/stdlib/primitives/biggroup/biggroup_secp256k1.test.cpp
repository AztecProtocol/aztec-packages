#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../bool/bool.hpp"
#include "../field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "gtest/gtest.h"
#include <vector>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class stdlibBiggroupSecp256k1 : public testing::Test {
  public:
    // We always use bigfield for secp256k1 as the scalar field is large.
    using element_ct = typename Curve::g1_bigfr_ct;
    using scalar_ct = typename Curve::bigfr_ct;

    using fq = typename Curve::fq;
    using fr = typename Curve::fr;
    using g1 = typename Curve::g1;
    using affine_element = typename g1::affine_element;
    using element = typename g1::element;

    using Builder = typename Curve::Builder;
    using witness_ct = stdlib::witness_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;

    static constexpr auto EXPECT_CIRCUIT_CORRECTNESS = [](Builder& builder, bool expected_result = true) {
        info("num gates = ", builder.get_estimated_num_finalized_gates());
        EXPECT_EQ(CircuitChecker::check(builder), expected_result);
    };

    // Primitives functions for computing wnafs over secp256k1 scalars
    template <size_t wnaf_size> void test_get_staggered_wnaf_fragment_value()
    {
        // Helper for easier invocation
        auto get_val = [](uint64_t fragment_u64, uint64_t stagger, bool is_negative, bool wnaf_skew) {
            return stdlib::element_default::element_test_accessor::
                get_staggered_wnaf_fragment_value<Builder, typename Curve::fq_ct, scalar_ct, g1, wnaf_size>(
                    fragment_u64, stagger, is_negative, wnaf_skew);
        };

        // Test: stagger == 0 returns (0, wnaf_skew)
        {
            auto [frag, skew] = get_val(123, 0, false, false);
            EXPECT_EQ(frag, 0);
            EXPECT_EQ(skew, false);

            auto [frag2, skew2] = get_val(456, 0, true, true);
            EXPECT_EQ(frag2, 0);
            EXPECT_EQ(skew2, true);
        }
        // Test: random positive values (honest case)
        {
            for (size_t i = 0; i < 20; ++i) {
                // Check for various stagger values ≤ 10
                for (size_t num_stagger_bits = 1; num_stagger_bits <= 10; ++num_stagger_bits) {
                    uint64_t input_frag = engine.get_random_uint32() % (1ULL << num_stagger_bits);
                    bool inp_skew = engine.get_random_uint32() & 1;
                    bool is_negative = false;

                    auto [output_frag, output_skew] = get_val(input_frag, num_stagger_bits, is_negative, inp_skew);

                    // input_frag - inp_skew * 2^t == output_wnaf - output_skew
                    int lhs = static_cast<int>(input_frag) - static_cast<int>(inp_skew * (1ULL << num_stagger_bits));

                    int output_wnaf_value =
                        (2 * static_cast<int>(output_frag) + 1) - static_cast<int>(1ULL << wnaf_size);
                    int rhs = output_wnaf_value - static_cast<int>(output_skew);

                    EXPECT_EQ(lhs, rhs);
                }
            }
        }
        // Test: random negative values
        {
            for (size_t i = 0; i < 20; ++i) {
                // Check for various stagger values ≤ 10
                for (size_t num_stagger_bits = 1; num_stagger_bits <= 10; ++num_stagger_bits) {
                    uint64_t input_frag = engine.get_random_uint32() % (1ULL << num_stagger_bits);
                    bool inp_skew = engine.get_random_uint32() & 1;
                    bool is_negative = true;

                    auto [output_frag, output_skew] = get_val(input_frag, num_stagger_bits, is_negative, inp_skew);

                    // In case of is_negative = true and input is even, we subtract 1 to make it odd and set skew = 1,
                    // which must be added to the output wnaf value.
                    // - input_frag + inp_skew * 2^t == output_wnaf + output_skew
                    int lhs = -static_cast<int>(input_frag) + static_cast<int>(inp_skew * (1ULL << num_stagger_bits));

                    int output_wnaf_value =
                        (2 * static_cast<int>(output_frag) + 1) - static_cast<int>(1ULL << wnaf_size);
                    int rhs = output_wnaf_value + static_cast<int>(output_skew);
                    EXPECT_EQ(lhs, rhs);
                }
            }
        }
    }

    // Add the necessary utility methods used in tests
    static void test_wnaf_secp256k1()
    {
        Builder builder = Builder();
        {
            // Generate a random even scalar
            fr scalar_a(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct::template compute_secp256k1_endo_wnaf<4, 0, 3>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 1, 2>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 2, 1>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 3, 0>(x_a, false);
        }
        {
            // Generate a random odd scalar
            fr scalar_b(fr::random_element());
            if ((uint256_t(scalar_b).get_bit(0) & 1) == 0) {
                scalar_b += fr(1); // skew bit is 0
            }
            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);
            element_ct::template compute_secp256k1_endo_wnaf<4, 0, 3>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 1, 2>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 2, 1>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<4, 3, 0>(x_b, false);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_secp256k1_stagger_out_of_range_fails()
    {
        Builder builder = Builder();

        // Generate a random even scalar
        fr scalar_a(fr::random_element());
        if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
            scalar_a -= fr(1); // skew bit is 1
        }
        scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);

        // If we range constrain the wnaf entries, but the stagger is out of range, the circuit should
        // fail.
        element_ct::template compute_secp256k1_endo_wnaf</*wnaf_size=*/4, /*lo_stagger=*/10, /*hi_stagger=*/0>(
            x_a, /*range_constrain_wnaf=*/true);

        EXPECT_CIRCUIT_CORRECTNESS(builder, false);
        EXPECT_EQ(builder.err(), "biggroup_nafs: stagger fragment is not in range");
    }

    static void test_wnaf_secp256k1_scalar_exceeding_modulus_regression_1()
    {
        Builder builder = Builder();
        const uint512_t scalar_field_modulus = scalar_ct::modulus_u512;

        // Generate a random scalar k < r (r is the scalar field modulus).
        const fr scalar_a = fr::random_element();
        scalar_ct scalar_a_ct = scalar_ct::from_witness(&builder, scalar_a);

        // Generate a large scalar k' := (k + mr) > r where r is the scalar field modulus and m >= 1
        // We need k' be larger than 256 bits to test the edge case properly. We achieve this by choosing
        // m = 2^256 / r + 1, which guarantees that r < 2^256 < k'.
        uint512_t m = ((uint512_t(1) << 256) / scalar_field_modulus) + 1;
        uint512_t large_value = uint512_t(scalar_a) + (m * scalar_field_modulus);
        scalar_ct large_scalar_ct = scalar_ct::create_from_u512_as_witness(&builder, large_value, true);
        EXPECT_EQ(large_scalar_ct.get_value() >= (uint512_t(1) << 256), true);
        EXPECT_EQ(large_scalar_ct.get_value() >= uint512_t(scalar_field_modulus), true);
        EXPECT_EQ(large_scalar_ct.get_value() % uint512_t(scalar_field_modulus), uint512_t(scalar_a));

        // circuit wnaf computation should work fine for scalar k
        element_ct::template compute_secp256k1_endo_wnaf<4, 0, 1>(scalar_a_ct, false);

        // circuit wnaf computation should also work for the large scalar k'
        element_ct::template compute_secp256k1_endo_wnaf<4, 0, 1>(large_scalar_ct, false);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_secp256k1_scalar_exceeding_modulus_regression_2()
    {
        Builder builder = Builder();
        const uint512_t scalar_field_modulus = scalar_ct::modulus_u512;

        // Generate a scalar k such that k < (2^256 - r)
        const size_t num_allowed_bits = ((uint512_t(1) << 256) - scalar_field_modulus).get_msb();
        const fr scalar_a = uint256_t(fr::random_element()) & ((uint256_t(1) << num_allowed_bits) - 1);
        scalar_ct scalar_a_ct = scalar_ct::from_witness(&builder, scalar_a);

        // Generate a large scalar k' := (k + r) < 2^256 (because k < 2^256 - r)
        uint512_t large_value = uint512_t(scalar_a) + scalar_field_modulus;
        scalar_ct large_scalar_ct = scalar_ct::create_from_u512_as_witness(&builder, large_value, true);
        EXPECT_EQ(large_scalar_ct.get_value() < (uint512_t(1) << 256), true);
        EXPECT_EQ(large_scalar_ct.get_value() >= uint512_t(scalar_field_modulus), true);
        EXPECT_EQ(large_scalar_ct.get_value() % uint512_t(scalar_field_modulus), uint512_t(scalar_a));

        // circuit wnaf computation should work fine for scalar k
        element_ct::template compute_secp256k1_endo_wnaf<4, 0, 1>(scalar_a_ct, false);

        // circuit wnaf computation should also work for the large scalar k'
        element_ct::template compute_secp256k1_endo_wnaf<4, 0, 1>(large_scalar_ct, false);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_8bit_secp256k1()
    {
        Builder builder = Builder();
        { // Generate a random even scalar
            fr scalar_a(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct::template compute_secp256k1_endo_wnaf<8, 0, 3>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 1, 2>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 2, 1>(x_a, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 3, 0>(x_a, false);
        }
        {
            // Generate a random odd scalar
            fr scalar_b(fr::random_element());
            if ((uint256_t(scalar_b).get_bit(0) & 1) == 0) {
                scalar_b += fr(1); // skew bit is 0
            }
            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);
            element_ct::template compute_secp256k1_endo_wnaf<8, 0, 3>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 1, 2>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 2, 1>(x_b, false);
            element_ct::template compute_secp256k1_endo_wnaf<8, 3, 0>(x_b, false);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_ecdsa_mul_secp256k1()
    {
        Builder builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fr scalar_a(fr::random_element());
            fr scalar_b(fr::random_element());
            fr scalar_c(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            element_ct P_a = element_ct::from_witness(&builder, g1::one * scalar_c);
            scalar_ct u1 = scalar_ct::from_witness(&builder, scalar_a);
            scalar_ct u2 = scalar_ct::from_witness(&builder, scalar_b);

            fr alo;
            fr ahi;
            fr blo;
            fr bhi;

            fr::split_into_endomorphism_scalars(scalar_a.from_montgomery_form(), alo, ahi);
            fr::split_into_endomorphism_scalars(scalar_b.from_montgomery_form(), blo, bhi);

            auto output = element_ct::secp256k1_ecdsa_mul(P_a, u1, u2);

            auto expected = affine_element(g1::one * (scalar_c * scalar_b) + g1::one * scalar_a);
            EXPECT_EQ(output.x.get_value().lo, uint256_t(expected.x));
            EXPECT_EQ(output.y.get_value().lo, uint256_t(expected.y));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_secp256k1_ecdsa_mul_skew_handling_regression()
    {
        // The scalars s1, u1, u2 are chosen such that:
        // Public key: P = (s1 * G)
        //
        // u1 * G + u2 * (s1 * G) = ø
        //
        // where ø is the point at infinity.
        //
        // The issue with such input was that we were not setting the point at infinity correctly
        // while adding the skew points. For the cases when we reach the point at infinity and still have
        // skew to add, we did not correctly set the flag _is_point_at_infinity. For this example, we have:
        //
        // u1_low skew:   0
        // u1_high skew:  1
        // u2_low skew:   1
        // u2_high skew:  0
        //
        // After adding the u2_low skew (i.e., its base point), we get the point at infinity. Then we handle the
        // u2 high skew as follows:
        // result = acc ± u1_high_base_point
        // result.x = u2_high_skew ? result.x : acc.x;
        // result.y = u2_high_skew ? result.y : acc.y;
        //
        // However, we did not set the flag _is_point_at_infinity for result. We must copy the flag from the
        // accumulator in this case, i.e., we must do:
        // result.x = u2_high_skew ? result.x : acc.x;
        // result.y = u2_high_skew ? result.y : acc.y;
        // result._is_point_at_infinity = u2_high_skew ? result._is_point_at_infinity :
        // acc._is_point_at_infinity;
        //
        // We define a new function `conditional_select` that does this operation and use it to handle the skew
        // addition.
        const uint256_t scalar_s1("0x66ad81e84534c20431c795de922fb592c3d8c68edcacfc6c5b52ab7ad10e47d3");
        const uint256_t scalar_u1("0x37e0ba2e9c4dd42077fd751a7426a8484a8ff2928a6c85a651e4470b461c6215");
        const uint256_t scalar_u2("0xdefbb9bbabde5b9f8d7175946e75babc2f11203a8bfb71beaeec1d7a2bff17dd");

        // Check the assumptions
        ASSERT(scalar_s1 < fr::modulus);
        ASSERT(scalar_u1 < fr::modulus);
        ASSERT(scalar_u2 < fr::modulus);
        ASSERT((fr(scalar_s1) * fr(scalar_u2) + fr(scalar_u1)).is_zero());
        ASSERT((g1::one * fr(scalar_u1) + (g1::one * fr(scalar_s1)) * fr(scalar_u2)).is_point_at_infinity());

        // Check that the wnaf skews of the lo and hi parts of u2 are as expected
        fr u2_lo;
        fr u2_hi;
        fr::split_into_endomorphism_scalars(fr(scalar_u2).from_montgomery_form(), u2_lo, u2_hi);
        ASSERT(uint256_t(u2_lo).get_bit(0) == 0); // u2_lo skew is 1 (even)
        ASSERT(uint256_t(u2_hi).get_bit(0) == 1); // u2_hi skew is 0 (odd)

        Builder builder = Builder();
        element_ct P_a = element_ct::from_witness(&builder, g1::one * fr(scalar_s1));
        scalar_ct u1 = scalar_ct::from_witness(&builder, fr(scalar_u1));
        scalar_ct u2 = scalar_ct::from_witness(&builder, fr(scalar_u2));
        auto output = element_ct::secp256k1_ecdsa_mul(P_a, u1, u2);

        // Check that the output is the point at infinity
        EXPECT_EQ(output.is_point_at_infinity().get_value(), true);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_secp256k1_ecdsa_mul_stagger_regression()
    {
        // This test uses the same idea as the skew handling regression test above.
        // However, in this test, we use scalars to ensure that we are correctly handling the stagger offsets
        // before adding the skew points. The scalars s1, u1, u2 are chosen such that: Public key: P = (s1 * G)
        //
        // u1 * G + u2 * (s1 * G) = ø
        //
        // where ø is the point at infinity. For this set of scalars, we have all the skews as 0.
        // This means that we will reach the point at infinity while adding the stagger fragments of the
        // scalars. Since we compute the wnaf with stagger offsets:
        //
        // compute_secp256k1_endo_wnaf<8, 2, 3>(u1, false);
        // compute_secp256k1_endo_wnaf<4, 0, 1>(u2, false);
        //
        // we have the following stagger offsets:
        // u1_low stagger bits:   2  <== add_3 = 2G
        // u1_high stagger bits:  3  <== add_1 = 3λG
        // u2_low stagger bits:   0
        // u2_high stagger bits:  1  <== add_2 = λG
        //
        // Hence we add these terms to the accumulator using addition chain:
        // acc += (((add_1) + add_2) + add_3).
        //
        // After adding add_2, the x-coordinate of the accumulator is equal to the x-coordinate of add_3.
        // Using incomplete addition formulae, we catch a circuit error as the addition is not valid if the
        // x-coordinates are equal. To avoid this, we use the complete addition formulae to add add_1, add_2,
        // add_3 to the accumulator. The increases the circuit size for secp256k1_ecdsa_mul by 730 gates but we
        // accept that for now to ensure correctness.
        //
        const uint256_t scalar_g1("0x9d496650d261d31af6aa4cf41e435ed739d0fe2c34728a21a0df5c66a3504ccd");
        const uint256_t scalar_u1("0xf3d9f52f0f55d3da6f902aa842aa604005633f3d165bc800f3a3aa661b18df5f");
        const uint256_t scalar_u2("0x1323b0342b1a56a076cbf5e3899156fbf3f439f2c3b0d5a95b9ef74622447f2e");

        // Check the assumptions
        ASSERT(scalar_g1 < fr::modulus);
        ASSERT(scalar_u1 < fr::modulus);
        ASSERT(scalar_u2 < fr::modulus);
        ASSERT((fr(scalar_g1) * fr(scalar_u2) + fr(scalar_u1)).is_zero());
        ASSERT((g1::one * fr(scalar_u1) + (g1::one * fr(scalar_g1)) * fr(scalar_u2)).is_point_at_infinity());

        // Create the circuit
        Builder builder = Builder();
        element_ct P_a = element_ct::from_witness(&builder, g1::one * fr(scalar_g1));
        scalar_ct u1 = scalar_ct::from_witness(&builder, fr(scalar_u1));
        scalar_ct u2 = scalar_ct::from_witness(&builder, fr(scalar_u2));
        auto output = element_ct::secp256k1_ecdsa_mul(P_a, u1, u2);

        // Check that the output is the point at infinity
        EXPECT_EQ(output.is_point_at_infinity().get_value(), true);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
};

// Then define the test types
using Secp256k1TestTypes =
    testing::Types<stdlib::secp256k1<bb::UltraCircuitBuilder>, stdlib::secp256k1<bb::MegaCircuitBuilder>>;

// Now register the test suite with the types
TYPED_TEST_SUITE(stdlibBiggroupSecp256k1, Secp256k1TestTypes);

// Define the individual tests
TYPED_TEST(stdlibBiggroupSecp256k1, GetStaggeredWnafFragmentValue4bit)
{
    TestFixture::template test_get_staggered_wnaf_fragment_value<4>();
}
TYPED_TEST(stdlibBiggroupSecp256k1, GetStaggeredWnafFragmentValue8bit)
{
    TestFixture::template test_get_staggered_wnaf_fragment_value<8>();
}
TYPED_TEST(stdlibBiggroupSecp256k1, WnafSecp256k1)
{
    TestFixture::test_wnaf_secp256k1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, WnafSecp256k1StaggerOutOfRangeFails)
{
    TestFixture::test_wnaf_secp256k1_stagger_out_of_range_fails();
}
TYPED_TEST(stdlibBiggroupSecp256k1, WnafSecp256k1LargeScalarRegression1)
{
    TestFixture::test_wnaf_secp256k1_scalar_exceeding_modulus_regression_1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, WnafSecp256k1LargeScalarRegression2)
{
    TestFixture::test_wnaf_secp256k1_scalar_exceeding_modulus_regression_2();
}
TYPED_TEST(stdlibBiggroupSecp256k1, Wnaf8bitSecp256k1)
{
    TestFixture::test_wnaf_8bit_secp256k1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, EcdsaMulSecp256k1)
{
    TestFixture::test_ecdsa_mul_secp256k1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, EcdsaMulSecp256k1SkewHandlingRegression)
{
    TestFixture::test_secp256k1_ecdsa_mul_skew_handling_regression();
}
TYPED_TEST(stdlibBiggroupSecp256k1, EcdsaMulSecp256k1StaggerRegression)
{
    TestFixture::test_secp256k1_ecdsa_mul_stagger_regression();
}

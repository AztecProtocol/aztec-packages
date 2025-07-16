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

    // Add the necessary utility methods used in tests
    static void test_wnaf_secp256k1()
    {
        Builder builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fr scalar_a(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct::template compute_secp256k1_endo_wnaf<4, 0, 3>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<4, 1, 2>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<4, 2, 1>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<4, 3, 0>(x_a);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_8bit_secp256k1()
    {
        Builder builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fr scalar_a(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct::template compute_secp256k1_endo_wnaf<8, 0, 3>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<8, 1, 2>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<8, 2, 1>(x_a);
            element_ct::template compute_secp256k1_endo_wnaf<8, 3, 0>(x_a);
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
};

// Then define the test types
using Secp256k1TestTypes =
    testing::Types<stdlib::secp256k1<bb::UltraCircuitBuilder>, stdlib::secp256k1<bb::MegaCircuitBuilder>>;

// Now register the test suite with the types
TYPED_TEST_SUITE(stdlibBiggroupSecp256k1, Secp256k1TestTypes);

// Define the individual tests
TYPED_TEST(stdlibBiggroupSecp256k1, WnafSecp256k1)
{
    TestFixture::test_wnaf_secp256k1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, Wnaf8bitSecp256k1)
{
    TestFixture::test_wnaf_8bit_secp256k1();
}
TYPED_TEST(stdlibBiggroupSecp256k1, EcdsaMulSecp256k1)
{
    TestFixture::test_ecdsa_mul_secp256k1();
}

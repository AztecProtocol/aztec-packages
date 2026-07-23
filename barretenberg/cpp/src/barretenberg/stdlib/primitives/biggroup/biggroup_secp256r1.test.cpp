#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../bool/bool.hpp"
#include "../field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "gtest/gtest.h"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class stdlibBiggroupSecp256r1 : public testing::Test {
  public:
    using element_ct = typename Curve::Group;
    using scalar_ct = typename Curve::ScalarField;

    using fr = typename Curve::ScalarFieldNative;
    using g1 = typename Curve::GroupNative;
    using affine_element = typename g1::affine_element;

    using Builder = typename Curve::Builder;

    static constexpr auto EXPECT_CIRCUIT_CORRECTNESS = [](Builder& builder, bool expected_result = true) {
        Builder copy = builder;
        copy.finalize_circuit();
        const size_t num_gates = copy.get_num_finalized_gates();
        const size_t tables_size = copy.get_tables_size();
        info("num gates = ", num_gates, ", tables_size = ", tables_size, ", max = ", std::max(num_gates, tables_size));
        EXPECT_EQ(CircuitChecker::check(builder), expected_result);
    };

    static void test_fixed_base_mul_secp256r1()
    {
        Builder builder = Builder();
        const size_t num_repetitions = 4;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fr scalar(fr::random_element(&engine));
            scalar_ct u = scalar_ct::from_witness(&builder, scalar);

            auto output = element_ct::secp256r1_fixed_base_mul(u);

            auto expected = affine_element(g1::one * scalar);
            EXPECT_EQ(output.x().get_value().lo, uint256_t(expected.x));
            EXPECT_EQ(output.y().get_value().lo, uint256_t(expected.y));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_fixed_base_mul_secp256r1_single_call_gate_count()
    {
        Builder builder = Builder();
        fr scalar(fr::random_element(&engine));
        scalar_ct u = scalar_ct::from_witness(&builder, scalar);

        auto output = element_ct::secp256r1_fixed_base_mul(u);
        auto expected = affine_element(g1::one * scalar);
        EXPECT_EQ(output.x().get_value().lo, uint256_t(expected.x));
        EXPECT_EQ(output.y().get_value().lo, uint256_t(expected.y));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_ecdsa_mul_secp256r1_gate_count()
    {
        Builder builder = Builder();
        fr scalar_a(fr::random_element(&engine));
        fr scalar_b(fr::random_element(&engine));
        fr scalar_c(fr::random_element(&engine));
        element_ct P_a = element_ct::from_witness(&builder, g1::one * scalar_c);
        scalar_ct u1 = scalar_ct::from_witness(&builder, scalar_a);
        scalar_ct u2 = scalar_ct::from_witness(&builder, scalar_b);

        auto output = element_ct::secp256r1_ecdsa_mul(P_a, u1, u2);

        auto expected = affine_element(g1::one * (scalar_c * scalar_b) + g1::one * scalar_a);
        EXPECT_EQ(output.result.x().get_value().lo, uint256_t(expected.x));
        EXPECT_EQ(output.result.y().get_value().lo, uint256_t(expected.y));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_ecdsa_mul_secp256r1_u1_zero()
    {
        Builder builder = Builder();
        fr scalar_b(fr::random_element(&engine));
        fr scalar_c(fr::random_element(&engine));
        element_ct P_a = element_ct::from_witness(&builder, g1::one * scalar_c);
        scalar_ct u1 = scalar_ct::from_witness(&builder, fr::zero());
        scalar_ct u2 = scalar_ct::from_witness(&builder, scalar_b);

        auto output = element_ct::secp256r1_ecdsa_mul(P_a, u1, u2);

        // u₁·G + u₂·Q = 0 + scalar_c·scalar_b·G
        auto expected = affine_element(g1::one * (scalar_c * scalar_b));
        EXPECT_EQ(output.result.x().get_value().lo, uint256_t(expected.x));
        EXPECT_EQ(output.result.y().get_value().lo, uint256_t(expected.y));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
};

using Secp256r1TestTypes =
    testing::Types<stdlib::secp256r1<bb::UltraCircuitBuilder>, stdlib::secp256r1<bb::MegaCircuitBuilder>>;

TYPED_TEST_SUITE(stdlibBiggroupSecp256r1, Secp256r1TestTypes);

TYPED_TEST(stdlibBiggroupSecp256r1, FixedBaseMul)
{
    TestFixture::test_fixed_base_mul_secp256r1();
}

TYPED_TEST(stdlibBiggroupSecp256r1, FixedBaseMulSingleCallGateCount)
{
    TestFixture::test_fixed_base_mul_secp256r1_single_call_gate_count();
}

TYPED_TEST(stdlibBiggroupSecp256r1, EcdsaMulGateCount)
{
    TestFixture::test_ecdsa_mul_secp256r1_gate_count();
}

TYPED_TEST(stdlibBiggroupSecp256r1, EcdsaMulU1Zero)
{
    TestFixture::test_ecdsa_mul_secp256r1_u1_zero();
}

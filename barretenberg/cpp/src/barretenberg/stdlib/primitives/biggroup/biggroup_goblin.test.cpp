#include "barretenberg/common/test.hpp"
#include <type_traits>

#include "../biggroup/biggroup.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

#include "barretenberg/numeric/random/engine.hpp"
#include <memory>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class stdlib_biggroup_goblin : public testing::Test {
    using element_ct = typename Curve::Element;
    using scalar_ct = typename Curve::ScalarField;

    using fq = typename Curve::BaseFieldNative;
    using fr = typename Curve::ScalarFieldNative;
    using g1 = typename Curve::GroupNative;
    using affine_element = typename g1::affine_element;
    using element = typename g1::element;

    using Builder = typename Curve::Builder;

    static constexpr auto EXPECT_CIRCUIT_CORRECTNESS = [](Builder& builder, bool expected_result = true) {
        info("builder gates = ", builder.get_num_finalized_gates_inefficient());
        EXPECT_EQ(CircuitChecker::check(builder), expected_result);
    };

  public:
    /**
     * @brief Test goblin-style batch mul
     * @details Check that 1) Goblin-style batch mul returns correct value, and 2) resulting circuit is correct
     *
     */
    static void test_goblin_style_batch_mul()
    {
        const size_t num_points = 5;
        const size_t edge_case_points = 3;
        Builder builder;

        std::vector<affine_element> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }
        points.push_back(g1::affine_point_at_infinity);
        scalars.push_back(fr::random_element());
        points.push_back(g1::affine_point_at_infinity);
        scalars.push_back(0);
        points.push_back(element::random_element());
        scalars.push_back(0);

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < num_points + edge_case_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points + edge_case_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x().get_value().lo);
        fq result_y(result_point.y().get_value().lo);

        EXPECT_EQ(result_x, expected_point.x);
        EXPECT_EQ(result_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_goblin_style_batch_mul_to_zero()
    {
        const size_t num_points = 5;
        Builder builder;

        std::vector<affine_element> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(points[i]);
            scalars.push_back(-scalars[i]);
        }
        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < num_points * 2; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars);

        EXPECT_EQ(result_point.get_value(), g1::affine_point_at_infinity);
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    /**
     * @brief Test goblin-style sub
     * @details Check that 1) Goblin-style batch sub returns correct value (esp. when infinities involved), and 2)
     * resulting circuit is correct
     */
    static void test_goblin_style_sub()
    {
        Builder builder;

        for (size_t i = 0; i < 100; ++i) {

            affine_element lhs(element::random_element());
            affine_element rhs(element::random_element());

            affine_element expected = affine_element(element(lhs) - element(rhs));

            element_ct lhs_ct = element_ct::from_witness(&builder, lhs);
            element_ct lhs2_ct = element_ct::from_witness(&builder, lhs);

            element_ct rhs_ct = element_ct::from_witness(&builder, rhs);
            element_ct out_ct = lhs_ct - rhs_ct;
            EXPECT_EQ(out_ct.get_value(), expected);

            element_ct zero_ct = lhs_ct - lhs_ct;
            EXPECT_TRUE(zero_ct.get_value().is_point_at_infinity());

            element_ct zero_ct2 = lhs_ct - lhs2_ct;
            EXPECT_TRUE(zero_ct2.get_value().is_point_at_infinity());

            element_ct out2_ct = element_ct::constant_infinity(&builder) - rhs_ct;
            EXPECT_EQ(out2_ct.get_value(), -rhs);

            element_ct out3_ct = lhs_ct - element_ct::constant_infinity(&builder);
            EXPECT_EQ(out3_ct.get_value(), lhs);

            auto lhs_infinity_ct = element_ct::constant_infinity(&builder);
            auto rhs_infinity_ct = element_ct::constant_infinity(&builder);
            element_ct out4_ct = lhs_infinity_ct - rhs_infinity_ct;
            EXPECT_TRUE(out4_ct.get_value().is_point_at_infinity());
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    /**
     * @brief Regression test: negative-k2 edge-case scalar through the stdlib biggroup path.
     * @details The naive GLV endomorphism splitting can produce a negative k2 for ~2^{-64} of inputs.
     * Before the fix in split_into_endomorphism_scalars, this caused the op queue to store garbage
     * z1/z2 values (254-bit instead of 128-bit). The stdlib biggroup `batch_mul` adds the constraint
     * `scalar.assert_equal(z_1 - z_2 * beta)`, which catches the mismatch at the Mega circuit level.
     *
     * See ecc/fields/endomorphism_scalars.py for an analysis.
     */
    static void test_endomorphism_negative_k2_regression()
    {
        // clang-format off
        // Boundary scalars k = ceil(m * 2^256 / endo_g2) from endomorphism_scalars.py.
        // These are the smallest scalars where c1 ticks up, making k2 negative.
        const std::array<std::array<uint64_t, 4>, 3> boundary_cases = {{
            {{ 0x01624731e1195570, 0x3ba491482db4da14, 0x59e26bcea0d48bac, 0x0 }}, // m=1
            {{ 0x02c48e63c232aadf, 0x774922905b69b428, 0xb3c4d79d41a91758, 0x0 }}, // m=2
            {{ 0x0426d595a34c004e, 0xb2edb3d8891e8e3c, 0x0da7436be27da304, 0x1 }}, // m=3
        }};
        // clang-format on

        for (const auto& limbs : boundary_cases) {
            fr base_scalar(uint256_t{ limbs[0], limbs[1], limbs[2], limbs[3] });

            // The negative-k2 band extends ~2^{123}-2^{126} above each boundary scalar.
            // A random 122-bit positive perturbation lands inside this band, where the
            // original (unfixed) k2 is still negative. We therefore test two scalars: the original boundary case and a
            // 122-bit perturbation.
            uint256_t rand_bits(fr::random_element());
            uint256_t offset = rand_bits & ((uint256_t(1) << 122) - 1);
            std::array<fr, 2> scalars = { base_scalar, base_scalar + fr(offset) };

            // Test via batch_mul
            for (const auto& scalar : scalars) {
                Builder builder;
                element_ct pt = element_ct::from_witness(&builder, affine_element::one());
                scalar_ct sc = scalar_ct::from_witness(&builder, scalar);
                element_ct result = element_ct::batch_mul({ pt }, { sc });
                (void)result;
                EXPECT_CIRCUIT_CORRECTNESS(builder);
            }

            // Test via operator* (delegates to batch_mul)
            for (const auto& scalar : scalars) {
                Builder builder;
                element_ct pt = element_ct::from_witness(&builder, affine_element::one());
                scalar_ct sc = scalar_ct::from_witness(&builder, scalar);
                element_ct result = pt * sc;
                (void)result;
                EXPECT_CIRCUIT_CORRECTNESS(builder);
            }
        }
    }

    /**
     * @brief Check goblin-style negate works as intended, including with points at infinity
     */
    static void test_goblin_style_neg()
    {
        Builder builder;
        affine_element lhs(element::random_element());

        affine_element expected = -lhs;

        element_ct lhs_ct = element_ct::from_witness(&builder, lhs);

        element_ct result_ct = -lhs_ct;
        EXPECT_EQ(result_ct.get_value(), expected);

        element_ct infinity = element_ct::constant_infinity(&builder);
        element_ct result2_ct = -infinity;
        EXPECT_EQ(result2_ct.get_value(), g1::affine_point_at_infinity);
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
};

using TestTypes = testing::Types<stdlib::bn254<bb::MegaCircuitBuilder>>;

TYPED_TEST_SUITE(stdlib_biggroup_goblin, TestTypes);

TYPED_TEST(stdlib_biggroup_goblin, batch_mul)
{
    TestFixture::test_goblin_style_batch_mul();
}

TYPED_TEST(stdlib_biggroup_goblin, batch_mul_equals_zero)
{
    TestFixture::test_goblin_style_batch_mul_to_zero();
}

TYPED_TEST(stdlib_biggroup_goblin, sub)
{
    TestFixture::test_goblin_style_sub();
}

TYPED_TEST(stdlib_biggroup_goblin, neg)
{
    TestFixture::test_goblin_style_neg();
}

TYPED_TEST(stdlib_biggroup_goblin, endomorphism_negative_k2_regression)
{
    TestFixture::test_endomorphism_negative_k2_regression();
}

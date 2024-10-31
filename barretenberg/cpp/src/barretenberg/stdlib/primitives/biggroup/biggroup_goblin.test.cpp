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
        info("builder gates = ", builder.get_estimated_num_finalized_gates());
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
        fq result_x(result_point.x.get_value().lo);
        fq result_y(result_point.y.get_value().lo);

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

            element_ct out2_ct = element_ct::point_at_infinity(&builder) - rhs_ct;
            EXPECT_EQ(out2_ct.get_value(), -rhs);

            element_ct out3_ct = lhs_ct - element_ct::point_at_infinity(&builder);
            EXPECT_EQ(out3_ct.get_value(), lhs);

            auto lhs_infinity_ct = element_ct::point_at_infinity(&builder);
            auto rhs_infinity_ct = element_ct::point_at_infinity(&builder);
            element_ct out4_ct = lhs_infinity_ct - rhs_infinity_ct;
            EXPECT_TRUE(out4_ct.get_value().is_point_at_infinity());
            EXPECT_TRUE(out4_ct.is_point_at_infinity().get_value());
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
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

        element_ct infinity = element_ct::point_at_infinity(&builder);
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

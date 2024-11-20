#include "../biggroup/biggroup.hpp"
#include "../bigfield/bigfield.hpp"
#include "../bool/bool.hpp"
#include "../field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename T>
concept HasGoblinBuilder = IsMegaBuilder<typename T::Curve::Builder>;

// One can only define a TYPED_TEST with a single template paramter.
// Our workaround is to pass parameters of the following type.
template <typename _Curve, bool _use_bigfield = false> struct TestType {
  public:
    using Curve = _Curve;
    static const bool use_bigfield = _use_bigfield;
    using element_ct =
        typename std::conditional<_use_bigfield, typename Curve::g1_bigfr_ct, typename Curve::Group>::type;
    // the field of scalars acting on element_ct
    using scalar_ct =
        typename std::conditional<_use_bigfield, typename Curve::bigfr_ct, typename Curve::ScalarField>::type;
};

STANDARD_TESTING_TAGS
template <typename TestType> class stdlib_biggroup : public testing::Test {
    using Curve = typename TestType::Curve;
    using element_ct = typename TestType::element_ct;
    using scalar_ct = typename TestType::scalar_ct;

    using fq = typename Curve::BaseFieldNative;
    using fr = typename Curve::ScalarFieldNative;
    using g1 = typename Curve::GroupNative;
    using affine_element = typename g1::affine_element;
    using element = typename g1::element;

    using Builder = typename Curve::Builder;
    using witness_ct = stdlib::witness_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;

    static constexpr auto EXPECT_CIRCUIT_CORRECTNESS = [](Builder& builder, bool expected_result = true) {
        info("num gates = ", builder.get_estimated_num_finalized_gates());
        EXPECT_EQ(CircuitChecker::check(builder), expected_result);
    };

  public:
    static void test_add()
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set different tags in a and b
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            uint64_t before = builder.get_estimated_num_finalized_gates();
            element_ct c = a + b;
            uint64_t after = builder.get_estimated_num_finalized_gates();

            // Check that the resulting tag is the union of inputs' tgs
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            if (i == num_repetitions - 1) {
                std::cout << "num gates per add = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Biggroup", "ADD", "Gate Count", after - before);
            }

            affine_element c_expected(element(input_a) + element(input_b));

            uint256_t c_x_u256 = c.x.get_value().lo;
            uint256_t c_y_u256 = c.y.get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_add_points_at_infinity()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            input_b.self_set_infinity();
            element_ct a = element_ct::from_witness(&builder, input_a);
            // create copy of a with different witness
            element_ct a_alternate = element_ct::from_witness(&builder, input_a);
            element_ct a_negated = element_ct::from_witness(&builder, -input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set different tags on all elements
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            a_alternate.set_origin_tag(next_challenge_tag);
            // We can't use next_submitted_value tag here or it will break, so construct a tag manually
            const auto second_round_challenge_tag =
                OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/false);
            a_negated.set_origin_tag(second_round_challenge_tag);

            element_ct c = a + b;
            element_ct d = b + a;
            element_ct e = b + b;
            element_ct f = a + a;
            element_ct g = a + a_alternate;
            element_ct h = a + a_negated;

            // Check the resulting tags are correct unions of input tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);
            EXPECT_EQ(e.get_origin_tag(), challenge_origin_tag);
            EXPECT_EQ(f.get_origin_tag(), submitted_value_origin_tag);
            EXPECT_EQ(g.get_origin_tag(), first_and_third_merged_tag);
            EXPECT_EQ(h.get_origin_tag(), OriginTag(submitted_value_origin_tag, second_round_challenge_tag));

            affine_element c_expected = affine_element(element(input_a) + element(input_b));
            affine_element d_expected = affine_element(element(input_b) + element(input_a));
            affine_element e_expected = affine_element(element(input_b) + element(input_b));
            affine_element f_expected = affine_element(element(input_a) + element(input_a));
            affine_element g_expected = affine_element(element(input_a) + element(input_a));
            affine_element h_expected = affine_element(element(input_a) + element(-input_a));

            EXPECT_EQ(c.get_value(), c_expected);
            EXPECT_EQ(d.get_value(), d_expected);
            EXPECT_EQ(e.get_value(), e_expected);
            EXPECT_EQ(f.get_value(), f_expected);
            EXPECT_EQ(g.get_value(), g_expected);
            EXPECT_EQ(h.get_value(), h_expected);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
    /**
     * @brief Check that converting a point at infinity into standard form ensures the coordinates are zeroes
     *
     */
    static void test_standard_form_of_point_at_infinity()
    {
        Builder builder;
        size_t num_repetitions = 5;
        for (size_t i = 0; i < num_repetitions; ++i) {
            // Check both constant and witness case
            element_ct input_a(element::random_element());
            element_ct input_b = element_ct::from_witness(&builder, element::random_element());
            input_a.set_point_at_infinity(true);
            input_b.set_point_at_infinity(true);

            // Set tags
            input_a.set_origin_tag(submitted_value_origin_tag);
            input_b.set_origin_tag(challenge_origin_tag);

            auto standard_a = input_a.get_standard_form();
            auto standard_b = input_b.get_standard_form();

            // Check that tags are preserved

            EXPECT_EQ(standard_a.get_origin_tag(), submitted_value_origin_tag);
            EXPECT_EQ(standard_b.get_origin_tag(), challenge_origin_tag);

            EXPECT_EQ(standard_a.is_point_at_infinity().get_value(), true);
            EXPECT_EQ(standard_b.is_point_at_infinity().get_value(), true);

            fq standard_a_x = standard_a.x.get_value().lo;
            fq standard_a_y = standard_a.y.get_value().lo;

            fq standard_b_x = standard_b.x.get_value().lo;
            fq standard_b_y = standard_b.y.get_value().lo;

            EXPECT_EQ(standard_a_x, 0);
            EXPECT_EQ(standard_a_y, 0);
            EXPECT_EQ(standard_b_x, 0);
            EXPECT_EQ(standard_b_y, 0);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
    static void test_sub()
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set tags
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            element_ct c = a - b;

            // Check tags have merged
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            affine_element c_expected(element(input_a) - element(input_b));

            uint256_t c_x_u256 = c.x.get_value().lo;
            uint256_t c_y_u256 = c.y.get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_sub_points_at_infinity()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            input_b.self_set_infinity();
            element_ct a = element_ct::from_witness(&builder, input_a);
            // create copy of a with different witness
            element_ct a_alternate = element_ct::from_witness(&builder, input_a);
            element_ct a_negated = element_ct::from_witness(&builder, -input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set different tags on all elements
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            a_alternate.set_origin_tag(next_challenge_tag);
            // We can't use next_submitted_value tag here or it will break, so construct a tag manually
            const auto second_round_challenge_tag =
                OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/false);
            a_negated.set_origin_tag(second_round_challenge_tag);

            element_ct c = a - b;
            element_ct d = b - a;
            element_ct e = b - b;
            element_ct f = a - a;
            element_ct g = a - a_alternate;
            element_ct h = a - a_negated;

            // Check the resulting tags are correct unions of input tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);
            EXPECT_EQ(e.get_origin_tag(), challenge_origin_tag);
            EXPECT_EQ(f.get_origin_tag(), submitted_value_origin_tag);
            EXPECT_EQ(g.get_origin_tag(), first_and_third_merged_tag);
            EXPECT_EQ(h.get_origin_tag(), OriginTag(submitted_value_origin_tag, second_round_challenge_tag));

            affine_element c_expected = affine_element(element(input_a) - element(input_b));
            affine_element d_expected = affine_element(element(input_b) - element(input_a));
            affine_element e_expected = affine_element(element(input_b) - element(input_b));
            affine_element f_expected = affine_element(element(input_a) - element(input_a));
            affine_element g_expected = affine_element(element(input_a) - element(input_a));
            affine_element h_expected = affine_element(element(input_a) - element(-input_a));

            EXPECT_EQ(c.get_value(), c_expected);
            EXPECT_EQ(d.get_value(), d_expected);
            EXPECT_EQ(e.get_value(), e_expected);
            EXPECT_EQ(f.get_value(), f_expected);
            EXPECT_EQ(g.get_value(), g_expected);
            EXPECT_EQ(h.get_value(), h_expected);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_dbl()
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);

            a.set_origin_tag(submitted_value_origin_tag);

            element_ct c = a.dbl();

            // Check that the tag is preserved
            EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);

            affine_element c_expected(element(input_a).dbl());

            uint256_t c_x_u256 = c.x.get_value().lo;
            uint256_t c_y_u256 = c.y.get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_montgomery_ladder()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set tags
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            element_ct c = a.montgomery_ladder(b);

            // Check that the resulting tag is a union of tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            affine_element c_expected(element(input_a).dbl() + element(input_b));

            uint256_t c_x_u256 = c.x.get_value().lo;
            uint256_t c_y_u256 = c.y.get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_mul()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input(element::random_element());
            fr scalar(fr::random_element());
            if (uint256_t(scalar).get_bit(0)) {
                scalar -= fr(1); // make sure to add skew
            }

            element_ct P = element_ct::from_witness(&builder, input);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            // Set input tags
            x.set_origin_tag(challenge_origin_tag);
            P.set_origin_tag(submitted_value_origin_tag);

            std::cerr << "gates before mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            element_ct c = P * x;
            std::cerr << "builder aftr mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            affine_element c_expected(element(input) * scalar);

            // Check the result of the multiplication has a tag that's the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_twin_mul()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            fr scalar_a(fr::random_element());
            fr scalar_b(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            if ((uint256_t(scalar_b).get_bit(0) & 1) == 0) {
                scalar_b += fr(1); // skew bit is 0
            }
            element_ct P_a = element_ct::from_witness(&builder, input_a);
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct P_b = element_ct::from_witness(&builder, input_b);
            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);

            // Set tags
            P_a.set_origin_tag(submitted_value_origin_tag);
            x_a.set_origin_tag(challenge_origin_tag);
            P_b.set_origin_tag(next_submitted_value_origin_tag);
            x_b.set_origin_tag(next_challenge_tag);

            element_ct c = element_ct::batch_mul({ P_a, P_b }, { x_a, x_b });

            // Check that the resulting tag is a union of all tags
            EXPECT_EQ(c.get_origin_tag(), first_to_fourth_merged_tag);
            element input_c = (element(input_a) * scalar_a);
            element input_d = (element(input_b) * scalar_b);
            affine_element expected(input_c + input_d);
            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_triple_mul()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            affine_element input_c(element::random_element());
            fr scalar_a(fr::random_element());
            fr scalar_b(fr::random_element());
            fr scalar_c(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            if ((uint256_t(scalar_b).get_bit(0) & 1) == 0) {
                scalar_b += fr(1); // skew bit is 0
            }
            OriginTag tag_union{};

            element_ct P_a = element_ct::from_witness(&builder, input_a);
            // Set all element tags to submitted tags from sequential rounds
            P_a.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/0, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_a.get_origin_tag());

            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            // Set all scalar tags to challenge tags from sequential rounds
            x_a.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/0, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_a.get_origin_tag());

            element_ct P_b = element_ct::from_witness(&builder, input_b);
            P_b.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/1, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_b.get_origin_tag());

            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);
            x_b.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/1, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_b.get_origin_tag());

            element_ct P_c = element_ct::from_witness(&builder, input_c);
            P_c.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_c.get_origin_tag());

            scalar_ct x_c = scalar_ct::from_witness(&builder, scalar_c);
            x_c.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_c.get_origin_tag());

            element_ct c = element_ct::batch_mul({ P_a, P_b, P_c }, { x_a, x_b, x_c });
            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), tag_union);
            element input_e = (element(input_a) * scalar_a);
            element input_f = (element(input_b) * scalar_b);
            element input_g = (element(input_c) * scalar_c);

            affine_element expected(input_e + input_f + input_g);
            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_quad_mul()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            affine_element input_c(element::random_element());
            affine_element input_d(element::random_element());
            fr scalar_a(fr::random_element());
            fr scalar_b(fr::random_element());
            fr scalar_c(fr::random_element());
            fr scalar_d(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            if ((uint256_t(scalar_b).get_bit(0) & 1) == 0) {
                scalar_b += fr(1); // skew bit is 0
            }
            OriginTag tag_union{};

            element_ct P_a = element_ct::from_witness(&builder, input_a);

            // Set element tags to sequential submitted tags
            P_a.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/0, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_a.get_origin_tag());

            // Set element tags to sequential challenge tags
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            x_a.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/0, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_a.get_origin_tag());

            element_ct P_b = element_ct::from_witness(&builder, input_b);
            P_b.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/1, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_b.get_origin_tag());

            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);
            x_b.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/1, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_b.get_origin_tag());

            element_ct P_c = element_ct::from_witness(&builder, input_c);
            P_c.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_c.get_origin_tag());

            scalar_ct x_c = scalar_ct::from_witness(&builder, scalar_c);
            x_c.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/2, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_c.get_origin_tag());

            element_ct P_d = element_ct::from_witness(&builder, input_d);
            P_d.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/3, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, P_d.get_origin_tag());

            scalar_ct x_d = scalar_ct::from_witness(&builder, scalar_d);
            x_d.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/3, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, x_d.get_origin_tag());

            element_ct c = element_ct::batch_mul({ P_a, P_b, P_c, P_d }, { x_a, x_b, x_c, x_d });

            // Check that the tag of the batched product is the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), tag_union);
            element input_e = (element(input_a) * scalar_a);
            element input_f = (element(input_b) * scalar_b);
            element input_g = (element(input_c) * scalar_c);
            element input_h = (element(input_d) * scalar_d);

            affine_element expected(input_e + input_f + input_g + input_h);
            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_one()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fr scalar_a(fr::random_element());
            if ((uint256_t(scalar_a).get_bit(0) & 1) == 1) {
                scalar_a -= fr(1); // skew bit is 1
            }
            element_ct P_a = element_ct::one(&builder);

            // Set origin tag for element to submitted value in round 0
            P_a.set_origin_tag(submitted_value_origin_tag);
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);

            // Set origin tag for scalar to challenge in round 0
            x_a.set_origin_tag(challenge_origin_tag);
            element_ct c = P_a * x_a;

            // Check that the resulting tag is a union
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            affine_element expected(g1::one * scalar_a);
            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_batch_mul()
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1043): this test will fail with num_points is 1
        // (and this case gets hit sometimes when handling points at infinity).
        const size_t num_points = 5;
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        OriginTag tag_union{};
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));

            // Set tag to submitted value tag at round i
            circuit_points[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));

            // Set tag to challenge tag at round i
            circuit_scalars[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
        }

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars);

        // Check the resulting tag is a union of inputs' tags
        EXPECT_EQ(result_point.get_origin_tag(), tag_union);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x.get_value().lo);
        fq result_y(result_point.y.get_value().lo);

        EXPECT_EQ(result_x, expected_point.x);
        EXPECT_EQ(result_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_batch_mul_edgecase_equivalence()
    {
        const size_t num_points = 5;
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        OriginTag tag_union{};
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));

            // Set tag to submitted value tag at round i
            circuit_points[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));

            // Set tag to challenge tag at round i
            circuit_scalars[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
        }

        element_ct result_point2 =
            element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

        // Check that the result tag is a union of inputs' tags
        EXPECT_EQ(result_point2.get_origin_tag(), tag_union);
        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();

        fq result2_x(result_point2.x.get_value().lo);
        fq result2_y(result_point2.y.get_value().lo);

        EXPECT_EQ(result2_x, expected_point.x);
        EXPECT_EQ(result2_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_batch_mul_edge_case_set1()
    {
        const auto test_repeated_points = [](const uint32_t num_points) {
            // batch P + ... + P = m*P
            info("num points: ", num_points);
            std::vector<affine_element> points;
            std::vector<fr> scalars;
            for (size_t idx = 0; idx < num_points; idx++) {
                points.push_back(affine_element::one());
                scalars.push_back(1);
            }

            Builder builder;
            ASSERT(points.size() == scalars.size());

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;

            OriginTag tag_union{};
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));

                // Set tag to submitted value tag at round i
                circuit_points[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
                tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));

                // Set tag to challenge tag at round i
                circuit_scalars[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
                tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
            }

            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(result_point.get_origin_tag(), tag_union);

            auto expected_point = element::infinity();
            for (const auto& point : points) {
                expected_point += point;
            }
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        };
        test_repeated_points(2);
        test_repeated_points(3);
        test_repeated_points(4);
        test_repeated_points(5);
        test_repeated_points(6);
        test_repeated_points(7);
    }
    static void test_batch_mul_edge_case_set2()
    {
        {
            // batch oo + P = P
            std::vector<affine_element> points;
            points.push_back(affine_element::infinity());
            points.push_back(affine_element(element::random_element()));
            std::vector<fr> scalars;
            scalars.push_back(1);
            scalars.push_back(1);

            Builder builder;
            ASSERT(points.size() == scalars.size());
            const size_t num_points = points.size();

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;

            OriginTag tag_union{};
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));

                // Set tag to submitted value tag at round i
                circuit_points[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
                tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));

                // Set tag to challenge tag at round i
                circuit_scalars[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
                tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
            }

            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(result_point.get_origin_tag(), tag_union);

            element expected_point = points[1];
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        {
            // batch 0 * P1 + P2 = P2
            std::vector<affine_element> points;
            points.push_back(affine_element(element::random_element()));
            points.push_back(affine_element(element::random_element()));
            std::vector<fr> scalars;
            scalars.push_back(0);
            scalars.push_back(1);

            Builder builder;
            ASSERT(points.size() == scalars.size());
            const size_t num_points = points.size();

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;

            OriginTag tag_union{};
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));

                // Set tag to submitted value tag at round i
                circuit_points[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
                tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));

                // Set tag to challenge tag at round i
                circuit_scalars[i].set_origin_tag(
                    OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
                tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
            }

            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(result_point.get_origin_tag(), tag_union);

            element expected_point = points[1];
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
    }

    static void test_chain_add()
    {
        Builder builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            affine_element input_c(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);
            element_ct c = element_ct::from_witness(&builder, input_c);

            auto acc = element_ct::chain_add_start(a, b);
            auto acc_out = element_ct::chain_add(c, acc);

            auto lambda_prev = (input_b.y - input_a.y) / (input_b.x - input_a.x);
            auto x3_prev = lambda_prev * lambda_prev - input_b.x - input_a.x;
            auto y3_prev = lambda_prev * (input_a.x - x3_prev) - input_a.y;
            auto lambda = (y3_prev - input_c.y) / (x3_prev - input_c.x);
            auto x3 = lambda * lambda - x3_prev - input_c.x;

            uint256_t x3_u256 = acc_out.x3_prev.get_value().lo;
            uint256_t lambda_u256 = acc_out.lambda_prev.get_value().lo;

            fq x3_result(x3_u256);
            fq lambda_result(lambda_u256);

            EXPECT_EQ(x3_result, x3);
            EXPECT_EQ(lambda_result, lambda);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_multiple_montgomery_ladder()
    {
        Builder builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element acc_small(element::random_element());
            element_ct acc_big = element_ct::from_witness(&builder, acc_small);

            std::vector<typename element_ct::chain_add_accumulator> to_add;
            for (size_t j = 0; j < i; ++j) {
                affine_element add_1_small_0(element::random_element());
                element_ct add_1_big_0 = element_ct::from_witness(&builder, add_1_small_0);
                affine_element add_2_small_0(element::random_element());
                element_ct add_2_big_0 = element_ct::from_witness(&builder, add_2_small_0);
                typename element_ct::chain_add_accumulator add_1 =
                    element_ct::chain_add_start(add_1_big_0, add_2_big_0);
                to_add.emplace_back(add_1);
            }
            acc_big.multiple_montgomery_ladder(to_add);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_compute_naf()
    {
        Builder builder = Builder();
        size_t num_repetitions(32);
        for (size_t i = 0; i < num_repetitions; i++) {
            fr scalar_val = fr::random_element();
            scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);
            // Set tag for scalar
            scalar.set_origin_tag(submitted_value_origin_tag);
            auto naf = element_ct::compute_naf(scalar);

            for (const auto& bit : naf) {
                // Check that the tag is propagated to bits
                EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
            }
            // scalar = -naf[254] + \sum_{i=0}^{253}(1-2*naf[i]) 2^{253-i}
            fr reconstructed_val(0);
            for (size_t i = 0; i < 254; i++) {
                reconstructed_val += (fr(1) - fr(2) * fr(naf[i].witness_bool)) * fr(uint256_t(1) << (253 - i));
            };
            reconstructed_val -= fr(naf[254].witness_bool);
            EXPECT_EQ(scalar_val, reconstructed_val);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_compute_wnaf()
    {
        Builder builder = Builder();

        fr scalar_val = fr::random_element();
        scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);
        // Assign origin tag to scalar
        scalar.set_origin_tag(submitted_value_origin_tag);

        const auto result = element_ct::compute_wnaf(scalar);
        // Check that wnaf entries propagate tag
        for (const auto& wnaf_entry : result) {
            EXPECT_EQ(wnaf_entry.get_origin_tag(), submitted_value_origin_tag);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_batch_mul()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input(element::random_element());
            fr scalar(fr::random_element());
            if ((uint256_t(scalar).get_bit(0) & 1) == 1) {
                scalar -= fr(1); // make sure to add skew
            }
            element_ct P = element_ct::from_witness(&builder, input);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            // Set 2 different origin tags
            P.set_origin_tag(submitted_value_origin_tag);
            x.set_origin_tag(challenge_origin_tag);

            std::cerr << "gates before mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            element_ct c = element_ct::wnaf_batch_mul({ P }, { x });

            // Check that the final tag is a union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            std::cerr << "builder aftr mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            affine_element c_expected(element(input) * scalar);

            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_batch_mul_edge_cases()
    {
        {
            // batch P + P = 2P
            std::vector<affine_element> points;
            points.push_back(affine_element::one());
            points.push_back(affine_element::one());
            std::vector<fr> scalars;
            scalars.push_back(1);
            scalars.push_back(1);

            Builder builder;
            ASSERT(points.size() == scalars.size());
            const size_t num_points = points.size();

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }
            element_ct result_point = element_ct::wnaf_batch_mul(circuit_points, circuit_scalars);

            element expected_point = points[0] + points[1];
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        {
            // batch oo + P = P
            std::vector<affine_element> points;
            points.push_back(affine_element::infinity());
            points.push_back(affine_element(element::random_element()));
            std::vector<fr> scalars;
            scalars.push_back(1);
            scalars.push_back(1);

            Builder builder;
            ASSERT(points.size() == scalars.size());
            const size_t num_points = points.size();

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }
            element_ct result_point = element_ct::wnaf_batch_mul(circuit_points, circuit_scalars);

            element expected_point = points[1];
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        {
            // batch 0 * P1 + P2 = P2
            std::vector<affine_element> points;
            points.push_back(affine_element(element::random_element()));
            points.push_back(affine_element(element::random_element()));
            std::vector<fr> scalars;
            scalars.push_back(0);
            scalars.push_back(1);

            Builder builder;
            ASSERT(points.size() == scalars.size());
            const size_t num_points = points.size();

            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }

            element_ct result_point = element_ct::wnaf_batch_mul(circuit_points, circuit_scalars);

            element expected_point = points[1];
            expected_point = expected_point.normalize();

            fq result_x(result_point.x.get_value().lo);
            fq result_y(result_point.y.get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
    }

    static void test_batch_mul_short_scalars()
    {
        const size_t num_points = 11;
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            uint256_t scalar_raw = fr::random_element();
            scalar_raw.data[2] = 0ULL;
            scalar_raw.data[3] = 0ULL;
            scalars.push_back(fr(scalar_raw));
        }
        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars, 128);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x.get_value().lo);
        fq result_y(result_point.y.get_value().lo);

        EXPECT_EQ(result_x, expected_point.x);
        EXPECT_EQ(result_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_batch_mul_128_bit()
    {
        Builder builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input(element::random_element());
            uint256_t scalar_u256(0, 0, 0, 0);
            scalar_u256.data[0] = engine.get_random_uint64();
            scalar_u256.data[1] = engine.get_random_uint64();
            fr scalar(scalar_u256);
            if ((uint256_t(scalar).get_bit(0) & 1) == 1) {
                scalar -= fr(1); // make sure to add skew
            }
            element_ct P = element_ct::from_witness(&builder, input);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            std::cerr << "gates before mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            // Note: need >136 bits to complete this when working over bigfield
            element_ct c = element_ct::template wnaf_batch_mul<128>({ P }, { x });
            std::cerr << "builder aftr mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            affine_element c_expected(element(input) * scalar);

            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_wnaf_batch_4()
    {
        Builder builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            const auto get_128_bit_scalar = []() {
                uint256_t scalar_u256(0, 0, 0, 0);
                scalar_u256.data[0] = engine.get_random_uint64();
                scalar_u256.data[1] = engine.get_random_uint64();
                fr scalar(scalar_u256);
                return scalar;
            };
            affine_element input1(element::random_element());
            affine_element input2(element::random_element());
            affine_element input3(element::random_element());
            affine_element input4(element::random_element());

            element_ct P1 = element_ct::from_witness(&builder, input1);
            element_ct P2 = element_ct::from_witness(&builder, input2);
            element_ct P3 = element_ct::from_witness(&builder, input3);
            element_ct P4 = element_ct::from_witness(&builder, input4);

            fr scalar1 = get_128_bit_scalar();
            fr scalar2 = get_128_bit_scalar();
            fr scalar3 = get_128_bit_scalar();
            fr scalar4 = get_128_bit_scalar();
            scalar_ct x1 = scalar_ct::from_witness(&builder, scalar1);
            scalar_ct x2 = scalar_ct::from_witness(&builder, scalar2);
            scalar_ct x3 = scalar_ct::from_witness(&builder, scalar3);
            scalar_ct x4 = scalar_ct::from_witness(&builder, scalar4);

            std::cerr << "gates before mul " << builder.get_estimated_num_finalized_gates() << std::endl;
            element_ct c = element_ct::batch_mul({ P1, P2, P3, P4 }, { x1, x2, x3, x4 }, 128);
            std::cerr << "builder aftr mul " << builder.get_estimated_num_finalized_gates() << std::endl;

            element out = input1 * scalar1;
            out += (input2 * scalar2);
            out += (input3 * scalar3);
            out += (input4 * scalar4);
            affine_element c_expected(out);

            fq c_x_result(c.x.get_value().lo);
            fq c_y_result(c.y.get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_bn254_endo_batch_mul()
    {
        const size_t num_big_points = 2;
        const size_t num_small_points = 1;
        Builder builder;
        std::vector<affine_element> big_points;
        std::vector<fr> big_scalars;
        std::vector<affine_element> small_points;
        std::vector<fr> small_scalars;

        for (size_t i = 0; i < num_big_points; ++i) {
            big_points.push_back(affine_element(element::random_element()));
            big_scalars.push_back(fr::random_element());
        }
        for (size_t i = 0; i < num_small_points; ++i) {
            small_points.push_back(affine_element(element::random_element()));
            uint256_t scalar_raw = fr::random_element();
            scalar_raw.data[2] = 0ULL;
            scalar_raw.data[3] = 0ULL;
            small_scalars.push_back(fr(scalar_raw));
        }

        std::vector<element_ct> big_circuit_points;
        std::vector<scalar_ct> big_circuit_scalars;
        std::vector<element_ct> small_circuit_points;
        std::vector<scalar_ct> small_circuit_scalars;
        for (size_t i = 0; i < num_big_points; ++i) {
            big_circuit_points.push_back(element_ct::from_witness(&builder, big_points[i]));
            big_circuit_scalars.push_back(scalar_ct::from_witness(&builder, big_scalars[i]));
        }
        for (size_t i = 0; i < num_small_points; ++i) {
            small_circuit_points.push_back(element_ct::from_witness(&builder, small_points[i]));
            small_circuit_scalars.push_back(scalar_ct::from_witness(&builder, small_scalars[i]));
        }

        element_ct result_point = element_ct::bn254_endo_batch_mul(
            big_circuit_points, big_circuit_scalars, small_circuit_points, small_circuit_scalars, 128);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_big_points; ++i) {
            expected_point += (element(big_points[i]) * big_scalars[i]);
        }
        for (size_t i = 0; i < num_small_points; ++i) {
            expected_point += (element(small_points[i]) * small_scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x.get_value().lo);
        fq result_y(result_point.y.get_value().lo);

        EXPECT_EQ(result_x, expected_point.x);
        EXPECT_EQ(result_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_mixed_mul_bn254_endo()
    {
        Builder builder;
        size_t num_repetitions = 1;

        const auto get_small_scalar = []() {
            fr t1 = fr::random_element();
            t1 = t1.from_montgomery_form();
            t1.data[2] = 0;
            t1.data[3] = 0;
            return t1.to_montgomery_form();
        };
        for (size_t i = 0; i < num_repetitions; ++i) {
            std::vector<element_ct> small_points(25);
            std::vector<element_ct> big_points(5);
            std::vector<element_ct> double_points(11);
            std::vector<scalar_ct> small_scalars(25);
            std::vector<scalar_ct> big_scalars(5);
            std::vector<scalar_ct> double_scalars(11);

            std::vector<affine_element> small_points_w(25);
            std::vector<affine_element> big_points_w(5);
            std::vector<affine_element> double_points_w(11);
            std::vector<fr> small_scalars_w(25);
            std::vector<fr> big_scalars_w(5);
            std::vector<fr> double_scalars_w(11);

            for (size_t i = 0; i < 25; ++i) {
                small_points_w[i] = affine_element(element::random_element());
                small_scalars_w[i] = get_small_scalar();
                small_points[i] = element_ct::from_witness(&builder, small_points_w[i]);
                small_scalars[i] = scalar_ct::from_witness(&builder, small_scalars_w[i]);
            }
            for (size_t i = 0; i < 5; ++i) {
                big_points_w[i] = affine_element(element::random_element());
                big_scalars_w[i] = fr::random_element();
                big_points[i] = element_ct::from_witness(&builder, big_points_w[i]);
                big_scalars[i] = scalar_ct::from_witness(&builder, big_scalars_w[i]);
            }
            for (size_t i = 0; i < 11; ++i) {
                double_points_w[i] = affine_element(element::random_element());
                double_scalars_w[i] = get_small_scalar();
                double_points[i] = element_ct::from_witness(&builder, double_points_w[i]);
                double_scalars[i] = scalar_ct::from_witness(&builder, double_scalars_w[i]);
            }

            fr omega = get_small_scalar();

            const auto double_opening_result = element_ct::batch_mul(double_points, double_scalars, 128);
            small_points.push_back(double_opening_result);
            small_scalars.push_back(scalar_ct::from_witness(&builder, omega));

            auto opening_result =
                element_ct::bn254_endo_batch_mul(big_points, big_scalars, small_points, small_scalars, 128);

            opening_result = opening_result + double_opening_result;
            opening_result = opening_result.normalize();

            element expected = g1::one;
            expected.self_set_infinity();
            for (size_t i = 0; i < 11; ++i) {
                expected += (double_points_w[i] * double_scalars_w[i]);
            }
            expected *= (omega + 1);
            for (size_t i = 0; i < 25; ++i) {
                expected += (small_points_w[i] * small_scalars_w[i]);
            }
            for (size_t i = 0; i < 5; ++i) {
                expected += (big_points_w[i] * big_scalars_w[i]);
            }
            expected = expected.normalize();

            fq result_x(opening_result.x.get_value().lo);
            fq result_y(opening_result.y.get_value().lo);

            EXPECT_EQ(result_x, expected.x);
            EXPECT_EQ(result_y, expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    };

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

enum UseBigfield { No, Yes };
using TestTypes = testing::Types<TestType<stdlib::bn254<bb::StandardCircuitBuilder>, UseBigfield::No>,
                                 TestType<stdlib::bn254<bb::UltraCircuitBuilder>, UseBigfield::Yes>,
                                 TestType<stdlib::bn254<bb::MegaCircuitBuilder>, UseBigfield::No>,
                                 TestType<stdlib::bn254<bb::CircuitSimulatorBN254>, UseBigfield::No>>;

TYPED_TEST_SUITE(stdlib_biggroup, TestTypes);

TYPED_TEST(stdlib_biggroup, add)
{

    TestFixture::test_add();
}
TYPED_TEST(stdlib_biggroup, add_points_at_infinity)
{
    TestFixture::test_add_points_at_infinity();
}
TYPED_TEST(stdlib_biggroup, standard_form_of_point_at_infinity)
{
    TestFixture::test_standard_form_of_point_at_infinity();
}
TYPED_TEST(stdlib_biggroup, sub)
{
    TestFixture::test_sub();
}
TYPED_TEST(stdlib_biggroup, sub_points_at_infinity)
{

    TestFixture::test_sub_points_at_infinity();
}
TYPED_TEST(stdlib_biggroup, dbl)
{
    TestFixture::test_dbl();
}
TYPED_TEST(stdlib_biggroup, montgomery_ladder)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_montgomery_ladder();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul)
{
    TestFixture::test_mul();
}
HEAVY_TYPED_TEST(stdlib_biggroup, twin_mul)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_twin_mul();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, triple_mul)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_triple_mul();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, quad_mul)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_quad_mul();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, one)
{
    TestFixture::test_one();
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul)
{
    TestFixture::test_batch_mul();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_edgecase_equivalence)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP();
    } else {
        TestFixture::test_batch_mul_edgecase_equivalence();
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_edge_case_set1)
{
    TestFixture::test_batch_mul_edge_case_set1();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_edge_case_set2)
{
    TestFixture::test_batch_mul_edge_case_set2();
}
HEAVY_TYPED_TEST(stdlib_biggroup, chain_add)
{

    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_chain_add();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, multiple_montgomery_ladder)
{

    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/707";
    } else {
        TestFixture::test_multiple_montgomery_ladder();
    };
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf)
{
    // ULTRATODO: make this work for secp curves
    if constexpr ((TypeParam::Curve::type == CurveType::BN254) && !HasGoblinBuilder<TypeParam>) {
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; i++) {
            TestFixture::test_compute_naf();
        }
    } else {
        GTEST_SKIP();
    }
}

/* These tests only work for Ultra Circuit Constructor */
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_batch_mul)
{
    if constexpr (HasPlookup<typename TypeParam::Curve::Builder>) {
        if constexpr (TypeParam::Curve::type == CurveType::BN254 && HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_compute_wnaf();
        };
    } else {
        GTEST_SKIP();
    }
}

/* These tests only work for Ultra Circuit Constructor */
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_batch_mul_edge_cases)
{
    if constexpr (HasPlookup<typename TypeParam::Curve::Builder>) {
        if constexpr (TypeParam::Curve::type == CurveType::BN254 && HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_compute_wnaf();
        };
    } else {
        GTEST_SKIP();
    }
}

/* the following test was only developed as a test of Ultra Circuit Constructor. It fails for Standard in the
   case where Fr is a bigfield. */
HEAVY_TYPED_TEST(stdlib_biggroup, compute_wnaf)
{
    if constexpr ((!HasPlookup<typename TypeParam::Curve::Builder> && TypeParam::use_bigfield) ||
                  (TypeParam::Curve::type == CurveType::BN254 && HasGoblinBuilder<TypeParam>)) {
        GTEST_SKIP();
    } else {
        TestFixture::test_compute_wnaf();
    }
}

/* batch_mul with specified value of max_num_bits does not work for a biggroup formed over a big scalar field.
   We skip such cases in the next group of tests. */
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_short_scalars)
{
    if constexpr (TypeParam::use_bigfield) {
        GTEST_SKIP();
    } else {
        if constexpr (TypeParam::Curve::type == CurveType::BN254 && HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_batch_mul_short_scalars();
        };
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_batch_mul_128_bit)
{
    if constexpr (TypeParam::use_bigfield) {
        GTEST_SKIP();
    } else {
        if constexpr (TypeParam::Curve::type == CurveType::BN254 && HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_wnaf_batch_mul_128_bit();
        };
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_batch_4)
{
    if constexpr (TypeParam::use_bigfield) {
        GTEST_SKIP();
    } else {
        TestFixture::test_wnaf_batch_4();
    }
}

/* The following tests are specific to BN254 and don't work when Fr is a bigfield */
HEAVY_TYPED_TEST(stdlib_biggroup, bn254_endo_batch_mul)
{
    if constexpr (TypeParam::Curve::type == CurveType::BN254 && !TypeParam::use_bigfield) {
        if constexpr (HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_bn254_endo_batch_mul();
        };
    } else {
        GTEST_SKIP();
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, mixed_mul_bn254_endo)
{
    if constexpr (TypeParam::Curve::type == CurveType::BN254 && !TypeParam::use_bigfield) {
        if constexpr (HasGoblinBuilder<TypeParam>) {
            GTEST_SKIP();
        } else {
            TestFixture::test_mixed_mul_bn254_endo();
        };
    } else {
        GTEST_SKIP();
    }
}

/* The following tests are specific to SECP256k1 */
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_secp256k1)
{
    if constexpr (TypeParam::Curve::type == CurveType::SECP256K1) {
        TestFixture::test_wnaf_secp256k1();
    } else {
        GTEST_SKIP();
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, wnaf_8bit_secp256k1)
{
    if constexpr (TypeParam::Curve::type == CurveType::SECP256K1) {
        TestFixture::test_wnaf_8bit_secp256k1();
    } else {
        GTEST_SKIP();
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, ecdsa_mul_secp256k1)
{
    if constexpr (TypeParam::Curve::type == CurveType::SECP256K1) {
        TestFixture::test_ecdsa_mul_secp256k1();
    } else {
        GTEST_SKIP();
    }
}
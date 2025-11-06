#include "../biggroup/biggroup.hpp"
#include "../bigfield/bigfield.hpp"
#include "../bool/bool.hpp"
#include "../field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <vector>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

enum struct InputType {
    WITNESS,
    CONSTANT,
};

constexpr InputType operator!(InputType type)
{
    return (type == InputType::WITNESS) ? InputType::CONSTANT : InputType::WITNESS;
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
    using field_ct = stdlib::field_t<Builder>;

    static constexpr auto EXPECT_CIRCUIT_CORRECTNESS = [](Builder& builder, bool expected_result = true) {
        info("num gates = ", builder.get_num_finalized_gates_inefficient());
        EXPECT_EQ(CircuitChecker::check(builder), expected_result);
    };

    // Create a random point as a witness
    static std::pair<affine_element, element_ct> get_random_witness_point(Builder* builder)
    {
        affine_element point_native(element::random_element());
        element_ct point_ct = element_ct::from_witness(builder, point_native);
        return std::make_pair(point_native, point_ct);
    }

    // Create a random point as a constant
    static std::pair<affine_element, element_ct> get_random_constant_point([[maybe_unused]] Builder* builder)
    {
        affine_element point_native(element::random_element());
        element_ct point_ct(point_native);
        return std::make_pair(point_native, point_ct);
    }

    // Create a random point based on InputType
    static std::pair<affine_element, element_ct> get_random_point(Builder* builder, InputType type)
    {
        if (type == InputType::WITNESS) {
            return get_random_witness_point(builder);
        }
        return get_random_constant_point(builder);
    }

    // Create a random scalar as a witness
    static std::pair<fr, scalar_ct> get_random_witness_scalar(Builder* builder, bool even = false)
    {
        fr scalar_native = fr::random_element();
        if (even && uint256_t(scalar_native).get_bit(0)) {
            scalar_native -= fr(1); // make it even if it's odd
        }
        scalar_ct scalar_ct_val = scalar_ct::from_witness(builder, scalar_native);
        return std::make_pair(scalar_native, scalar_ct_val);
    }

    // Create a random scalar as a constant
    static std::pair<fr, scalar_ct> get_random_constant_scalar(Builder* builder, bool even = false)
    {
        fr scalar_native = fr::random_element();
        if (even && uint256_t(scalar_native).get_bit(0)) {
            scalar_native -= fr(1); // make it even if it's odd
        }
        scalar_ct scalar_ct_val = scalar_ct(builder, scalar_native);
        return std::make_pair(scalar_native, scalar_ct_val);
    }

    // Create a random scalar based on InputType
    static std::pair<fr, scalar_ct> get_random_scalar(Builder* builder, InputType type, bool even = false)
    {
        if (type == InputType::WITNESS) {
            return get_random_witness_scalar(builder, even);
        }
        return get_random_constant_scalar(builder, even);
    }

    static std::pair<fr, scalar_ct> get_random_short_scalar(Builder* builder, InputType type, size_t num_bits)
    {
        uint256_t scalar_u256 = engine.get_random_uint256();
        scalar_u256 = scalar_u256 >> (256 - num_bits); // keep only the lower num_bits bits

        fr scalar_native(scalar_u256);
        scalar_ct scalar_ct_val;
        if (type == InputType::WITNESS) {
            scalar_ct_val = scalar_ct::from_witness(builder, scalar_native);
        } else {
            scalar_ct_val = scalar_ct(builder, scalar_native);
        }
        return std::make_pair(scalar_native, scalar_ct_val);
    }

  public:
    static void test_basic_tag_logic()
    {
        Builder builder;
        affine_element input_a(element::random_element());

        element_ct a = element_ct::from_witness(&builder, input_a);
        a.set_origin_tag(next_submitted_value_origin_tag);
        // Tag is preserved after being set
        EXPECT_EQ(a.get_origin_tag(), next_submitted_value_origin_tag);

        // Tags from members are merged
        // Create field elements with specific tags before constructing the biggroup element
        affine_element input_c(element::random_element());
        auto x = element_ct::BaseField::from_witness(&builder, input_c.x);
        auto y = element_ct::BaseField::from_witness(&builder, input_c.y);
        auto pif = bool_ct(witness_ct(&builder, false));

        // Set tags on the individual field elements
        x.set_origin_tag(submitted_value_origin_tag);
        y.set_origin_tag(challenge_origin_tag);
        pif.set_origin_tag(next_challenge_tag);

        // Construct biggroup element from pre-tagged field elements
        element_ct c(x, y, pif);

        // The tag of the biggroup element should be the union of all 3 member tags
        EXPECT_EQ(c.get_origin_tag(), first_second_third_merged_tag);

#ifndef NDEBUG
        // Test that instant_death_tag on x coordinate propagates correctly
        affine_element input_b(element::random_element());
        auto x_death = element_ct::BaseField::from_witness(&builder, input_b.x);
        auto y_normal = element_ct::BaseField::from_witness(&builder, input_b.y);
        auto pif_normal = bool_ct(witness_ct(&builder, false));

        x_death.set_origin_tag(instant_death_tag);

        element_ct b(x_death, y_normal, pif_normal);
        // Working with instant death tagged element causes an exception
        EXPECT_THROW(b + b, std::runtime_error);
#endif
    }

    static void test_assert_coordinates_in_field()
    {
        // Only test for non-goblin builders (goblin elements don't have assert_coordinates_in_field
        // because coordinate checks are done in the ECCVM circuit)
        if constexpr (!HasGoblinBuilder<TestType>) {
            // Test 1: Valid coordinates should pass
            {
                Builder builder;

                // Test multiple random points to ensure assert_coordinates_in_field works correctly
                for (size_t i = 0; i < 3; ++i) {
                    affine_element valid_point(element::random_element());
                    element_ct point = element_ct::from_witness(&builder, valid_point);

                    // This should not fail - coordinates are in field
                    point.assert_coordinates_in_field();
                }

                // Verify the circuit is correct
                EXPECT_CIRCUIT_CORRECTNESS(builder);
            }

            // Test 2: Invalid x coordinate should cause circuit to fail
            {
                Builder builder;
                affine_element valid_point(element::random_element());

                // Create a bigfield element with x coordinate that will be out of range
                // We do this by creating a valid witness but then manipulating the limb values
                // to make them represent a value >= the modulus
                auto x_coord = element_ct::BaseField::from_witness(&builder, valid_point.x);
                auto y_coord = element_ct::BaseField::from_witness(&builder, valid_point.y);

                // Manipulate the limbs to create an invalid value
                // Set the highest limb to a very large value that would make the total >= modulus
                x_coord.binary_basis_limbs[3].element = field_ct::from_witness(&builder, fr(uint256_t(1) << 68));
                x_coord.binary_basis_limbs[3].maximum_value = uint256_t(1) << 68;

                element_ct point(x_coord, y_coord, bool_ct(witness_ct(&builder, false)));
                point.assert_coordinates_in_field();

                // Circuit should fail because x coordinate is out of field
                EXPECT_CIRCUIT_CORRECTNESS(builder, false);
            }

            // Test 3: Invalid y coordinate should cause circuit to fail
            {
                Builder builder;
                affine_element valid_point(element::random_element());

                auto x_coord = element_ct::BaseField::from_witness(&builder, valid_point.x);
                auto y_coord = element_ct::BaseField::from_witness(&builder, valid_point.y);

                // Manipulate the limbs to create an invalid value
                // Set the highest limb to a very large value that would make the total >= modulus
                y_coord.binary_basis_limbs[3].element = field_ct::from_witness(&builder, fr(uint256_t(1) << 68));
                y_coord.binary_basis_limbs[3].maximum_value = uint256_t(1) << 68;

                element_ct point(x_coord, y_coord, bool_ct(witness_ct(&builder, false)));
                point.assert_coordinates_in_field();

                // Circuit should fail because y coordinate is out of field
                EXPECT_CIRCUIT_CORRECTNESS(builder, false);
            }
        }
    }

    static void test_add(InputType a_type = InputType::WITNESS, InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            // Set different tags in a and b
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            uint64_t before = builder.get_num_finalized_gates_inefficient();
            element_ct c = a + b;
            uint64_t after = builder.get_num_finalized_gates_inefficient();

            // Check that the resulting tag is the union of inputs' tgs
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            if (i == num_repetitions - 1) {
                benchmark_info(Builder::NAME_STRING, "Biggroup", "ADD", "Gate Count", after - before);
            }

            affine_element c_expected(element(input_a) + element(input_b));

            uint256_t c_x_u256 = c.x().get_value().lo;
            uint256_t c_y_u256 = c.y().get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_add_assign(InputType a_type = InputType::WITNESS, InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            element_ct original_a = a;
            a += b;

            affine_element expected(element(input_a) + element(input_b));
            uint256_t result_x = a.x().get_value().lo;
            uint256_t result_y = a.y().get_value().lo;

            EXPECT_EQ(fq(result_x), expected.x);
            EXPECT_EQ(fq(result_y), expected.y);
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

            fq standard_a_x = standard_a.x().get_value().lo;
            fq standard_a_y = standard_a.y().get_value().lo;

            fq standard_b_x = standard_b.x().get_value().lo;
            fq standard_b_y = standard_b.y().get_value().lo;

            EXPECT_EQ(standard_a_x, 0);
            EXPECT_EQ(standard_a_y, 0);
            EXPECT_EQ(standard_b_x, 0);
            EXPECT_EQ(standard_b_y, 0);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_sub(InputType a_type = InputType::WITNESS, InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            // Set tags
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            element_ct c = a - b;

            // Check tags have merged
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            affine_element c_expected(element(input_a) - element(input_b));

            uint256_t c_x_u256 = c.x().get_value().lo;
            uint256_t c_y_u256 = c.y().get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_sub_assign(InputType a_type = InputType::WITNESS, InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            a -= b;

            affine_element expected(element(input_a) - element(input_b));
            uint256_t result_x = a.x().get_value().lo;
            uint256_t result_y = a.y().get_value().lo;

            EXPECT_EQ(fq(result_x), expected.x);
            EXPECT_EQ(fq(result_y), expected.y);
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

    static void test_checked_unconditional_add(InputType a_type = InputType::WITNESS,
                                               InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            element_ct result = a.checked_unconditional_add(b);

            affine_element expected(element(input_a) + element(input_b));
            uint256_t result_x = result.x().get_value().lo;
            uint256_t result_y = result.y().get_value().lo;

            EXPECT_EQ(fq(result_x), expected.x);
            EXPECT_EQ(fq(result_y), expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_checked_unconditional_subtract(InputType a_type = InputType::WITNESS,
                                                    InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            element_ct result = a.checked_unconditional_subtract(b);

            affine_element expected(element(input_a) - element(input_b));
            uint256_t result_x = result.x().get_value().lo;
            uint256_t result_y = result.y().get_value().lo;

            EXPECT_EQ(fq(result_x), expected.x);
            EXPECT_EQ(fq(result_y), expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_checked_unconditional_add_sub(InputType a_type = InputType::WITNESS,
                                                   InputType b_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            const auto [input_a, a] = get_random_point(&builder, a_type);
            const auto [input_b, b] = get_random_point(&builder, b_type);

            // Since unchecked_unconditional_add_sub is private in biggroup, we test it via the element_test_accessor
            auto [sum, diff] = stdlib::element_default::element_test_accessor::checked_unconditional_add_sub(a, b);

            affine_element expected_sum(element(input_a) + element(input_b));
            affine_element expected_diff(element(input_a) - element(input_b));

            uint256_t sum_x = sum.x().get_value().lo;
            uint256_t sum_y = sum.y().get_value().lo;
            uint256_t diff_x = diff.x().get_value().lo;
            uint256_t diff_y = diff.y().get_value().lo;

            EXPECT_EQ(fq(sum_x), expected_sum.x);
            EXPECT_EQ(fq(sum_y), expected_sum.y);
            EXPECT_EQ(fq(diff_x), expected_diff.x);
            EXPECT_EQ(fq(diff_y), expected_diff.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_dbl(InputType a_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);

            a.set_origin_tag(submitted_value_origin_tag);

            element_ct c = a.dbl();

            // Check that the tag is preserved
            EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);

            affine_element c_expected(element(input_a).dbl());

            uint256_t c_x_u256 = c.x().get_value().lo;
            uint256_t c_y_u256 = c.y().get_value().lo;

            fq c_x_result(c_x_u256);
            fq c_y_result(c_y_u256);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_chain_add(InputType a_type = InputType::WITNESS,
                               InputType b_type = InputType::WITNESS,
                               InputType c_type = InputType::WITNESS)
    {
        Builder builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);
            auto [input_c, c] = get_random_point(&builder, c_type);

            auto acc = element_ct::chain_add_start(a, b);
            auto acc_out = element_ct::chain_add(c, acc);
            element_ct result = element_ct::chain_add_end(acc_out);

            // Verify result
            affine_element expected(element(input_a) + element(input_b) + element(input_c));
            uint256_t result_x = result.x().get_value().lo;
            uint256_t result_y = result.y().get_value().lo;
            EXPECT_EQ(fq(result_x), expected.x);
            EXPECT_EQ(fq(result_y), expected.y);

            // Check intermediate values
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

    static void test_normalize(InputType point_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, point_type);

            element_ct normalized = a.normalize();

            // Normalized should equal the original
            uint256_t x_before = a.x().get_value().lo;
            uint256_t y_before = a.y().get_value().lo;
            uint256_t x_after = normalized.x().get_value().lo;
            uint256_t y_after = normalized.y().get_value().lo;

            EXPECT_EQ(fq(x_before), fq(x_after));
            EXPECT_EQ(fq(y_before), fq(y_after));
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_reduce(InputType point_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, point_type);

            element_ct reduced = a.reduce();

            // Reduced should equal the original
            uint256_t x_before = a.x().get_value().lo;
            uint256_t y_before = a.y().get_value().lo;
            uint256_t x_after = reduced.x().get_value().lo;
            uint256_t y_after = reduced.y().get_value().lo;

            EXPECT_EQ(fq(x_before), fq(x_after));
            EXPECT_EQ(fq(y_before), fq(y_after));
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_unary_negate(InputType a_type = InputType::WITNESS)
    {
        Builder builder;
        auto [input_a, a] = get_random_point(&builder, a_type);

        element_ct neg_a = -a;

        affine_element expected = affine_element(-element(input_a));
        uint256_t neg_x = neg_a.x().get_value().lo;
        uint256_t neg_y = neg_a.y().get_value().lo;

        EXPECT_EQ(fq(neg_x), expected.x);
        EXPECT_EQ(fq(neg_y), expected.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_conditional_negate(InputType point_type = InputType::WITNESS,
                                        InputType predicate_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            // Get random point
            auto [input_a, a] = get_random_point(&builder, point_type);
            a.set_origin_tag(submitted_value_origin_tag);

            // Get random predicate
            bool predicate_value = (engine.get_random_uint8() % 2) != 0;
            bool_ct predicate = (predicate_type == InputType::WITNESS) ? bool_ct(witness_ct(&builder, predicate_value))
                                                                       : bool_ct(predicate_value);
            predicate.set_origin_tag(challenge_origin_tag);

            element_ct c = a.conditional_negate(predicate);

            // Check the resulting tag is preserved
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            affine_element c_expected = predicate_value ? affine_element(-element(input_a)) : input_a;
            EXPECT_EQ(c.get_value(), c_expected);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_conditional_select(InputType a_type = InputType::WITNESS,
                                        InputType b_type = InputType::WITNESS,
                                        InputType predicate_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, a_type);
            auto [input_b, b] = get_random_point(&builder, b_type);

            bool predicate_value = (engine.get_random_uint8() % 2) != 0;
            bool_ct predicate = (predicate_type == InputType::WITNESS) ? bool_ct(witness_ct(&builder, predicate_value))
                                                                       : bool_ct(predicate_value);

            // Set different tags in a and b and the predicate
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            predicate.set_origin_tag(next_challenge_tag);

            element_ct c = a.conditional_select(b, predicate);

            // Check that the resulting tag is the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_second_third_merged_tag);

            affine_element c_expected = predicate_value ? input_b : input_a;
            EXPECT_EQ(c.get_value(), c_expected);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_incomplete_assert_equal()
    {
        // Case 1: Should pass because the points are identical
        {
            Builder builder;
            size_t num_repetitions = 10;
            for (size_t i = 0; i < num_repetitions; ++i) {
                affine_element input_a(element::random_element());
                element_ct a = element_ct::from_witness(&builder, input_a);
                element_ct b = element_ct::from_witness(&builder, input_a);

                // Set different tags in a and b
                a.set_origin_tag(submitted_value_origin_tag);
                b.set_origin_tag(challenge_origin_tag);

                a.incomplete_assert_equal(b, "elements don't match");
            }
            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        // Case 2: Should pass because the points are identical and at infinity
        {
            Builder builder;
            size_t num_repetitions = 10;
            for (size_t i = 0; i < num_repetitions; ++i) {
                affine_element input_a(element::random_element());
                element_ct a = element_ct::from_witness(&builder, input_a);
                element_ct b = element_ct::from_witness(&builder, input_a);

                // Set different tags in a and b
                a.set_origin_tag(submitted_value_origin_tag);
                b.set_origin_tag(challenge_origin_tag);

                a.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));
                b.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));

                a.incomplete_assert_equal(b, "elements don't match");
            }
            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        // Case 3: Self-assertion (point equals itself)
        {
            Builder builder;
            affine_element input(element::random_element());
            element_ct a = element_ct::from_witness(&builder, input);

            a.incomplete_assert_equal(a, "self assertion test");

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
    }

    static void test_incomplete_assert_equal_failure()
    {
        // Case 1: Should fail because the points are different
        {
            Builder builder;
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            // Ensure inputs are different
            while (input_a == input_b) {
                input_b = element::random_element();
            }
            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set different tags in a and b
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            a.incomplete_assert_equal(b, "elements don't match");

            // Circuit should fail (Circuit checker doesn't fail because it doesn't actually check copy constraints,
            // it only checks gate constraints)
            EXPECT_EQ(builder.failed(), true);
            EXPECT_EQ(builder.err(), "elements don't match (x coordinate)");
        }
        // Case 2: Should fail because the points have same x but different y
        {
            Builder builder;
            affine_element input_a(element::random_element());

            // Create a point with the same x coordinate but different y
            // For an elliptic curve y^2 = x^3 + ax + b, if (x, y) is on the curve, then (x, -y) is also on the curve
            affine_element input_b = input_a;
            input_b.y = -input_a.y; // Negate y to get a different point with same x

            // Construct the circuit elements with same x but different y
            auto x_coord = element_ct::BaseField::from_witness(&builder, input_a.x);
            auto y_coord_a = element_ct::BaseField::from_witness(&builder, input_a.y);
            auto y_coord_b = element_ct::BaseField::from_witness(&builder, input_b.y);

            element_ct a(x_coord, y_coord_a, bool_ct(witness_ct(&builder, false)));
            element_ct b(x_coord, y_coord_b, bool_ct(witness_ct(&builder, false)));

            // Set different tags in a and b
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            a.incomplete_assert_equal(b, "elements don't match");

            // Circuit should fail with y coordinate error
            EXPECT_EQ(builder.failed(), true);
            EXPECT_EQ(builder.err(), "elements don't match (y coordinate)");
        }
        // Case 3: Infinity flag mismatch (one point at infinity, one not)
        {
            Builder builder;
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());

            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            // Set only one point at infinity
            a.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));  // at infinity
            b.set_point_at_infinity(bool_ct(witness_ct(&builder, false))); // not at infinity

            a.incomplete_assert_equal(b, "infinity flag mismatch test");

            EXPECT_EQ(builder.failed(), true);
            EXPECT_EQ(builder.err(), "infinity flag mismatch test (infinity flag)");
        }
    }

    static void test_incomplete_assert_equal_edge_cases()
    {
        Builder builder;
        // Check that two points at infinity with different x,y coords fail the equality check
        affine_element input_a(element::random_element());
        affine_element input_b(element::random_element());

        // Ensure inputs are different
        while (input_a == input_b) {
            input_b = element::random_element();
        }
        element_ct a = element_ct::from_witness(&builder, input_a);
        element_ct b = element_ct::from_witness(&builder, input_b);

        const bool_ct is_infinity = bool_ct(witness_ct(&builder, 1));
        a.set_point_at_infinity(is_infinity);
        b.set_point_at_infinity(is_infinity);

        // Set different tags in a and b
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        a.incomplete_assert_equal(b, "points at infinity with different x,y should not be equal");

        // Circuit should fail
        EXPECT_EQ(builder.failed(), true);
        EXPECT_EQ(builder.err(), "points at infinity with different x,y should not be equal (x coordinate)");
    }

    static void test_compute_naf()
    {
        Builder builder = Builder();
        size_t max_num_bits = 254;
        for (size_t length = 2; length < max_num_bits; length += 1) {

            fr scalar_val;

            uint256_t scalar_raw = engine.get_random_uint256();
            scalar_raw = scalar_raw >> (256 - length);

            scalar_val = fr(scalar_raw);

            // We test non-zero scalars here
            if (scalar_val == fr(0)) {
                scalar_val += 1;
            };
            scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);
            // Set tag for scalar
            scalar.set_origin_tag(submitted_value_origin_tag);
            auto naf = element_ct::compute_naf(scalar, length);

            for (const auto& bit : naf) {
                // Check that the tag is propagated to bits
                EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
            }
            // scalar = -naf[L] + \sum_{i=0}^{L-1}(1-2*naf[i]) 2^{L-1-i}
            fr reconstructed_val(0);
            for (size_t i = 0; i < length; i++) {
                reconstructed_val += (fr(1) - fr(2) * fr(naf[i].get_value())) * fr(uint256_t(1) << (length - 1 - i));
            };
            reconstructed_val -= fr(naf[length].get_value());
            EXPECT_EQ(scalar_val, reconstructed_val);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_compute_naf_zero()
    {
        Builder builder = Builder();
        size_t length = 254;

        // Our algorithm for input 0 outputs the NAF representation of r (the field modulus)
        fr scalar_val(0);

        scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);

        // Set tag for scalar
        scalar.set_origin_tag(submitted_value_origin_tag);
        auto naf = element_ct::compute_naf(scalar, length);

        for (const auto& bit : naf) {
            // Check that the tag is propagated to bits
            EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
        }

        // scalar = -naf[L] + \sum_{i=0}^{L-1}(1-2*naf[i]) 2^{L-1-i}
        fr reconstructed_val(0);
        uint256_t reconstructed_u256(0);
        for (size_t i = 0; i < length; i++) {
            reconstructed_val += (fr(1) - fr(2) * fr(naf[i].get_value())) * fr(uint256_t(1) << (length - 1 - i));
            reconstructed_u256 +=
                (uint256_t(1) - uint256_t(2) * uint256_t(naf[i].get_value())) * (uint256_t(1) << (length - 1 - i));
        };
        reconstructed_val -= fr(naf[length].get_value());
        EXPECT_EQ(scalar_val, reconstructed_val);
        EXPECT_EQ(reconstructed_u256, uint256_t(fr::modulus));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_mul(InputType scalar_type = InputType::WITNESS, InputType point_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input, P] = get_random_point(&builder, point_type);
            auto [scalar, x] = get_random_scalar(&builder, scalar_type, /*even*/ true);

            // Set input tags
            x.set_origin_tag(challenge_origin_tag);
            P.set_origin_tag(submitted_value_origin_tag);

            std::cerr << "gates before mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            element_ct c = P * x;
            std::cerr << "builder aftr mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            affine_element c_expected(element(input) * scalar);

            // Check the result of the multiplication has a tag that's the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);
            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_mul_edge_cases(InputType scalar_type = InputType::WITNESS,
                                    InputType point_type = InputType::WITNESS)
    {
        Builder builder;

        const auto run_mul_and_check = [&](element_ct& P, scalar_ct& x) {
            // Set input tags
            x.set_origin_tag(challenge_origin_tag);
            P.set_origin_tag(submitted_value_origin_tag);

            // Perform multiplication
            element_ct c = P * x;

            // Check the result of the multiplication has a tag that's the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            // Result must be a point at infinity
            EXPECT_EQ(c.is_point_at_infinity().get_value(), true);
        };

        // Case 1: P * 0
        {
            auto [input, P] = get_random_point(&builder, point_type);
            scalar_ct x = (scalar_type == InputType::WITNESS) ? scalar_ct::from_witness(&builder, fr(0))
                                                              : scalar_ct(&builder, fr(0));
            run_mul_and_check(P, x);
        }
        // Case 2: (∞) * k
        {
            auto [input, P] = get_random_point(&builder, point_type);
            if (point_type == InputType::CONSTANT) {
                P.set_point_at_infinity(bool_ct(true));
            } else {
                P.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));
            }
            auto [scalar, x] = get_random_scalar(&builder, scalar_type, /*even*/ true);
            run_mul_and_check(P, x);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test short scalar mul with variable bit lengths.
    static void test_short_scalar_mul_with_bit_lengths()
    {
        Builder builder;

        std::vector<size_t> test_lengths = { 2, 3, 10, 11, 31, 32, 63, 64, 127, 128, 252, 253 };

        for (size_t i : test_lengths) {
            affine_element input(element::random_element());
            // Get a random 256 integer
            uint256_t scalar_raw = engine.get_random_uint256();
            // Produce a length =< i scalar.
            scalar_raw = scalar_raw >> (256 - i);
            fr scalar = fr(scalar_raw);

            // Avoid multiplication by 0 that may occur when `i` is small
            if (scalar == fr(0)) {
                scalar += 1;
            };

            element_ct P = element_ct::from_witness(&builder, input);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            // Set input tags
            x.set_origin_tag(challenge_origin_tag);
            P.set_origin_tag(submitted_value_origin_tag);

            std::cerr << "gates before mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            // Multiply using specified scalar length
            element_ct c = P.scalar_mul(x, i);
            std::cerr << "builder aftr mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            affine_element c_expected(element(input) * scalar);

            // Check the result of the multiplication has a tag that's the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);

            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_short_scalar_mul_infinity()
    {
        // We check that a point at infinity preserves `is_point_at_infinity()` flag after being multiplied against a
        // short scalar and also check that the number of gates in this case is more than the number of gates spent on a
        // finite point.

        // Populate test points.
        std::vector<element> points(2);

        points[0] = element::infinity();
        points[1] = element::random_element();
        // Containter for gate counts.
        std::vector<size_t> gates(2);

        // We initialize this flag as `true`, because the first result is expected to be the point at infinity.
        bool expect_infinity = true;

        for (auto [point, num_gates] : zip_view(points, gates)) {
            Builder builder;

            const size_t max_num_bits = 128;
            // Get a random 256-bit integer
            uint256_t scalar_raw = engine.get_random_uint256();
            // Produce a length =< max_num_bits scalar.
            scalar_raw = scalar_raw >> (256 - max_num_bits);
            fr scalar = fr(scalar_raw);

            element_ct P = element_ct::from_witness(&builder, point);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            // Set input tags
            x.set_origin_tag(challenge_origin_tag);
            P.set_origin_tag(submitted_value_origin_tag);

            std::cerr << "gates before mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            element_ct c = P.scalar_mul(x, max_num_bits);
            std::cerr << "builder aftr mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            num_gates = builder.get_num_finalized_gates_inefficient();
            // Check the result of the multiplication has a tag that's the union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            EXPECT_EQ(c.is_point_at_infinity().get_value(), expect_infinity);
            EXPECT_CIRCUIT_CORRECTNESS(builder);
            // The second point is finite, hence we flip the flag
            expect_infinity = false;
        }
        // Check that the numbers of gates are greater when multiplying by point at infinity,
        // because we transform (s * ∞) into (0 * G), and NAF representation of 0 ≡ NAF(r) which is 254 bits long.
        EXPECT_GT(gates[0], gates[1]);
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
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_twin_mul_with_infinity()
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            input_b.self_set_infinity();

            // Get two 128-bit scalars
            const size_t max_num_bits = 128;
            uint256_t scalar_raw_a = engine.get_random_uint256();
            scalar_raw_a = scalar_raw_a >> (256 - max_num_bits);
            fr scalar_a = fr(scalar_raw_a);

            uint256_t scalar_raw_b = engine.get_random_uint256();
            scalar_raw_b = scalar_raw_b >> (256 - max_num_bits);
            fr scalar_b = fr(scalar_raw_b);

            element_ct P_a = element_ct::from_witness(&builder, input_a); // A
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);  // s_1 (128 bits)
            element_ct P_b = element_ct::from_witness(&builder, input_b); // ∞
            scalar_ct x_b = scalar_ct::from_witness(&builder, scalar_b);  // s_2 (128 bits)

            // Set tags
            P_a.set_origin_tag(submitted_value_origin_tag);
            x_a.set_origin_tag(challenge_origin_tag);
            P_b.set_origin_tag(next_submitted_value_origin_tag);
            x_b.set_origin_tag(next_challenge_tag);

            element_ct c = element_ct::batch_mul({ P_a, P_b }, { x_a, x_b }, 128);

            // Check that the resulting tag is a union of all tags
            EXPECT_EQ(c.get_origin_tag(), first_to_fourth_merged_tag);
            element input_c = (element(input_a) * scalar_a);
            element input_d = (element(input_b) * scalar_b);
            affine_element expected(input_c + input_d);
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_batch_mul_linearly_dependent_generators()
    {
        Builder builder;
        affine_element input_P(element::random_element());

        affine_element input_P_a = affine_element(element(input_P) + element(input_P));     // 2P
        affine_element input_P_b = affine_element(element(input_P_a) + element(input_P));   // 3P
        affine_element input_P_c = affine_element(element(input_P_a) + element(input_P_b)); // 5P
        std::vector<affine_element> input_points = { input_P_a, input_P_b, input_P_c };

        // Choose scalars such that their NAF representations are:
        //    skew msd          lsd
        // a: 0    [+1, +1, -1, +1] = -0 + 2^3 + 2^2 - 2^1 + 2^0 = 11
        // b: 1    [+1, +1, +1, +1] = -1 + 2^3 + 2^2 + 2^1 + 2^0 = 14
        // c: 1    [+1, -1, +1, +1] = -1 + 2^3 - 2^2 + 2^1 + 2^0 = 6
        fr scalar_a(11);
        fr scalar_b(14);
        fr scalar_c(6);
        std::vector<fr> input_scalars = { scalar_a, scalar_b, scalar_c };

        OriginTag tag_union{};
        std::vector<scalar_ct> scalars;
        std::vector<element_ct> points;
        for (size_t i = 0; i < 3; ++i) {
            const element_ct point = element_ct::from_witness(&builder, input_points[i]);
            point.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, point.get_origin_tag());

            const scalar_ct scalar = scalar_ct::from_witness(&builder, input_scalars[i]);
            scalar.set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, scalar.get_origin_tag());

            scalars.emplace_back(scalar);
            points.emplace_back(point);
        }

        {
            // If with_edgecases = true, should handle linearly dependent points correctly
            // Define masking scalar (128 bits)
            const auto get_128_bit_scalar = []() {
                uint256_t scalar_u256(0, 0, 0, 0);
                scalar_u256.data[0] = engine.get_random_uint64();
                scalar_u256.data[1] = engine.get_random_uint64();
                fr scalar(scalar_u256);
                return scalar;
            };
            fr masking_scalar = get_128_bit_scalar();
            scalar_ct masking_scalar_ct = scalar_ct::from_witness(&builder, masking_scalar);
            element_ct c = element_ct::batch_mul(points,
                                                 scalars,
                                                 /*max_num_bits*/ 128,
                                                 /*with_edgecases*/ true,
                                                 /*masking_scalar*/ masking_scalar_ct);

            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), tag_union);
            element input_e = (element(input_P_a) * scalar_a);
            element input_f = (element(input_P_b) * scalar_b);
            element input_g = (element(input_P_c) * scalar_c);

            affine_element expected(input_e + input_f + input_g);
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        {
            // If with_edgecases = false, the lookup table cannot be created as we encounter
            // a point at infinity during the table construction.
            element_ct c = element_ct::batch_mul(points, scalars, /*max_num_bits*/ 4, /*with_edgecases*/ false);

            // Check that the result tag is a union of inputs' tags
            EXPECT_EQ(c.get_origin_tag(), tag_union);

            EXPECT_CIRCUIT_CORRECTNESS(builder, false);
            EXPECT_EQ(builder.err(), "bigfield: prime limb diff is zero, but expected non-zero");
        }
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
            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, expected.x);
            EXPECT_EQ(c_y_result, expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Overload: defaults to all WITNESS types for given num_points
    static void test_helper_batch_mul(size_t num_points,
                                      const bool short_scalars = false,
                                      const bool with_edgecases = false)
    {
        std::vector<InputType> point_types(num_points, InputType::WITNESS);
        std::vector<InputType> scalar_types(num_points, InputType::WITNESS);
        test_helper_batch_mul(point_types, scalar_types, short_scalars, with_edgecases);
    }

    static void test_helper_batch_mul(std::vector<InputType> point_types,
                                      std::vector<InputType> scalar_types,
                                      const bool short_scalars = false,
                                      const bool with_edgecases = false)
    {
        Builder builder;

        const size_t num_points = point_types.size();
        std::vector<affine_element> points;
        std::vector<fr> scalars;
        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < num_points; ++i) {
            // Generate scalars
            if (short_scalars) {
                auto [input_scalar, x] = get_random_short_scalar(&builder, scalar_types[i], /*num_bits*/ 128);
                scalars.push_back(input_scalar);
                circuit_scalars.push_back(x);
            } else {
                auto [input_scalar, x] = get_random_scalar(&builder, scalar_types[i], /*even*/ true);
                scalars.push_back(input_scalar);
                circuit_scalars.push_back(x);
            }

            // Generate points
            auto [input_point, P] = get_random_point(&builder, point_types[i]);
            points.push_back(input_point);
            circuit_points.push_back(P);
        }

        OriginTag tag_union{};
        for (size_t i = 0; i < num_points; ++i) {
            // Set tag to submitted value tag at round i
            circuit_points[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/true));
            tag_union = OriginTag(tag_union, circuit_points[i].get_origin_tag());

            // Set tag to challenge tag at round i
            circuit_scalars[i].set_origin_tag(OriginTag(/*parent_index=*/0, /*child_index=*/i, /*is_submitted=*/false));
            tag_union = OriginTag(tag_union, circuit_scalars[i].get_origin_tag());
        }

        // Define masking scalar (128 bits) if with_edgecases is true
        const auto get_128_bit_scalar = []() {
            uint256_t scalar_u256(0, 0, 0, 0);
            scalar_u256.data[0] = engine.get_random_uint64();
            scalar_u256.data[1] = engine.get_random_uint64();
            fr scalar(scalar_u256);
            return scalar;
        };
        fr masking_scalar = with_edgecases ? get_128_bit_scalar() : fr(1);
        scalar_ct masking_scalar_ct =
            with_edgecases ? scalar_ct::from_witness(&builder, masking_scalar) : scalar_ct(&builder, fr(1));

        element_ct result_point = element_ct::batch_mul(
            circuit_points, circuit_scalars, /*max_num_bits=*/0, with_edgecases, masking_scalar_ct);

        // Check the resulting tag is a union of inputs' tags
        EXPECT_EQ(result_point.get_origin_tag(), tag_union);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x().get_value().lo);
        fq result_y(result_point.y().get_value().lo);

        EXPECT_EQ(result_x, expected_point.x);
        EXPECT_EQ(result_y, expected_point.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_batch_mul()
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

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars);

        // Check the resulting tag is a union of inputs' tags
        EXPECT_EQ(result_point.get_origin_tag(), tag_union);

        element expected_point = g1::one;
        expected_point.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            expected_point += (element(points[i]) * scalars[i]);
        }

        expected_point = expected_point.normalize();
        fq result_x(result_point.x().get_value().lo);
        fq result_y(result_point.y().get_value().lo);

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

        fq result2_x(result_point2.x().get_value().lo);
        fq result2_y(result_point2.y().get_value().lo);

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
            ASSERT_EQ(points.size(), scalars.size());

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

            fq result_x(result_point.x().get_value().lo);
            fq result_y(result_point.y().get_value().lo);

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
            ASSERT_EQ(points.size(), scalars.size());
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

            fq result_x(result_point.x().get_value().lo);
            fq result_y(result_point.y().get_value().lo);

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
            ASSERT_EQ(points.size(), scalars.size());
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

            fq result_x(result_point.x().get_value().lo);
            fq result_y(result_point.y().get_value().lo);

            EXPECT_EQ(result_x, expected_point.x);
            EXPECT_EQ(result_y, expected_point.y);

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
    }

    // Test batch_mul with all points at infinity
    static void test_batch_mul_all_infinity()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;

        for (size_t i = 0; i < 5; ++i) {
            points.push_back(affine_element::infinity());
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars, 0, true);

        // Result should be point at infinity
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with all zero scalars
    static void test_batch_mul_all_zero_scalars()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;

        for (size_t i = 0; i < 5; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::zero());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars, 0, true);

        // Result should be point at infinity
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with mixed zero and non-zero scalars
    static void test_batch_mul_mixed_zero_scalars()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;

        for (size_t i = 0; i < 6; ++i) {
            points.push_back(affine_element(element::random_element()));
            // Alternate between zero and non-zero scalars
            scalars.push_back((i % 2 == 0) ? fr::zero() : fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars, 0, true);

        // Compute expected result
        element expected = element::infinity();
        for (size_t i = 0; i < points.size(); ++i) {
            expected += (element(points[i]) * scalars[i]);
        }
        affine_element expected_affine = affine_element(expected);

        uint256_t result_x = result.x().get_value().lo;
        uint256_t result_y = result.y().get_value().lo;

        EXPECT_EQ(fq(result_x), expected_affine.x);
        EXPECT_EQ(fq(result_y), expected_affine.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with mixed infinity and valid points
    static void test_batch_mul_mixed_infinity()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;

        for (size_t i = 0; i < 6; ++i) {
            // Alternate between infinity and valid points
            points.push_back((i % 2 == 0) ? affine_element::infinity() : affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars, 0, true);

        // Compute expected result
        element expected = element::infinity();
        for (size_t i = 0; i < points.size(); ++i) {
            if (!points[i].is_point_at_infinity()) {
                expected += (element(points[i]) * scalars[i]);
            }
        }
        affine_element expected_affine = affine_element(expected);

        uint256_t result_x = result.x().get_value().lo;
        uint256_t result_y = result.y().get_value().lo;

        EXPECT_EQ(fq(result_x), expected_affine.x);
        EXPECT_EQ(fq(result_y), expected_affine.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with points that cancel out
    static void test_batch_mul_cancellation()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;

        // Add P and -P with same scalar
        affine_element P(element::random_element());
        affine_element neg_P = affine_element(-element(P));
        fr scalar = fr::random_element();

        points.push_back(P);
        scalars.push_back(scalar);
        points.push_back(neg_P);
        scalars.push_back(scalar);

        // Add some other points to make it non-trivial
        for (size_t i = 0; i < 3; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars, 0, true);

        // Compute expected result
        element expected = element::infinity();
        for (size_t i = 0; i < points.size(); ++i) {
            expected += (element(points[i]) * scalars[i]);
        }
        affine_element expected_affine = affine_element(expected);

        uint256_t result_x = result.x().get_value().lo;
        uint256_t result_y = result.y().get_value().lo;

        EXPECT_EQ(fq(result_x), expected_affine.x);
        EXPECT_EQ(fq(result_y), expected_affine.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with constant and witness points mixed
    static void test_batch_mul_mixed_constant_witness()
    {
        Builder builder;
        std::vector<affine_element> points_native;
        std::vector<fr> scalars_native;
        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        // Add constant-constant points
        for (size_t i = 0; i < 3; ++i) {
            const auto [point, point_ct] = get_random_point(&builder, InputType::CONSTANT);
            const auto [scalar, scalar_ct] = get_random_scalar(&builder, InputType::CONSTANT);
            points_native.push_back(point);
            scalars_native.push_back(scalar);
            circuit_points.push_back(point_ct);   // Constant
            circuit_scalars.push_back(scalar_ct); // Constant
        }

        // Add witness-witness points
        for (size_t i = 0; i < 3; ++i) {
            const auto [point, point_ct] = get_random_point(&builder, InputType::WITNESS);
            const auto [scalar, scalar_ct] = get_random_scalar(&builder, InputType::WITNESS);
            points_native.push_back(point);
            scalars_native.push_back(scalar);
            circuit_points.push_back(point_ct);   // Witness
            circuit_scalars.push_back(scalar_ct); // Witness
        }

        // Add constant-witness points
        for (size_t i = 0; i < 4; ++i) {
            const auto [point, point_ct] = get_random_point(&builder, InputType::CONSTANT);
            const auto [scalar, scalar_ct] = get_random_scalar(&builder, InputType::WITNESS);
            points_native.push_back(point);
            scalars_native.push_back(scalar);
            circuit_points.push_back(element_ct(point));                          // Constant
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalar)); // Witness
        }

        // Add witness-constant points
        for (size_t i = 0; i < 4; ++i) {
            const auto [point, point_ct] = get_random_point(&builder, InputType::WITNESS);
            const auto [scalar, scalar_ct] = get_random_scalar(&builder, InputType::CONSTANT);
            points_native.push_back(point);
            scalars_native.push_back(scalar);
            circuit_points.push_back(point_ct);   // Witness
            circuit_scalars.push_back(scalar_ct); // Constant
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars);

        // Compute expected result
        element expected = element::infinity();
        for (size_t i = 0; i < points_native.size(); ++i) {
            expected += (element(points_native[i]) * scalars_native[i]);
        }
        affine_element expected_affine = affine_element(expected);

        uint256_t result_x = result.x().get_value().lo;
        uint256_t result_y = result.y().get_value().lo;

        EXPECT_EQ(fq(result_x), expected_affine.x);
        EXPECT_EQ(fq(result_y), expected_affine.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul with large number of points (stress test)
    static void test_batch_mul_large_number_of_points()
    {
        Builder builder;
        std::vector<affine_element> points;
        std::vector<fr> scalars;
        constexpr size_t num_points = 20;

        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element(element::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;

        for (size_t i = 0; i < points.size(); ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars);

        // Compute expected result
        element expected = element::infinity();
        for (size_t i = 0; i < points.size(); ++i) {
            expected += (element(points[i]) * scalars[i]);
        }
        affine_element expected_affine = affine_element(expected);

        uint256_t result_x = result.x().get_value().lo;
        uint256_t result_y = result.y().get_value().lo;

        EXPECT_EQ(fq(result_x), expected_affine.x);
        EXPECT_EQ(fq(result_y), expected_affine.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
};

enum UseBigfield { No, Yes };
using TestTypes = testing::Types<TestType<stdlib::bn254<bb::UltraCircuitBuilder>, UseBigfield::Yes>,
                                 TestType<stdlib::bn254<bb::MegaCircuitBuilder>, UseBigfield::No>>;

TYPED_TEST_SUITE(stdlib_biggroup, TestTypes);

TYPED_TEST(stdlib_biggroup, basic_tag_logic)
{
    TestFixture::test_basic_tag_logic();
}

TYPED_TEST(stdlib_biggroup, assert_coordinates_in_field)
{
    TestFixture::test_assert_coordinates_in_field();
}

// Addition tests
TYPED_TEST(stdlib_biggroup, add)
{

    TestFixture::test_add();
}
TYPED_TEST(stdlib_biggroup, add_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_add(InputType::WITNESS, InputType::CONSTANT);  // w + c
        TestFixture::test_add(InputType::CONSTANT, InputType::WITNESS);  // c + w
        TestFixture::test_add(InputType::CONSTANT, InputType::CONSTANT); // c + c
    }
}
TYPED_TEST(stdlib_biggroup, add_points_at_infinity)
{
    TestFixture::test_add_points_at_infinity();
}
TYPED_TEST(stdlib_biggroup, standard_form_of_point_at_infinity)
{
    TestFixture::test_standard_form_of_point_at_infinity();
}

// Subtraction tests
TYPED_TEST(stdlib_biggroup, sub)
{
    TestFixture::test_sub();
}
TYPED_TEST(stdlib_biggroup, sub_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_sub(InputType::WITNESS, InputType::CONSTANT);  // w - c
        TestFixture::test_sub(InputType::CONSTANT, InputType::WITNESS);  // c - w
        TestFixture::test_sub(InputType::CONSTANT, InputType::CONSTANT); // c - c
    }
}
TYPED_TEST(stdlib_biggroup, sub_points_at_infinity)
{

    TestFixture::test_sub_points_at_infinity();
}
TYPED_TEST(stdlib_biggroup, dbl)
{
    TestFixture::test_dbl();
}
TYPED_TEST(stdlib_biggroup, dbl_with_constant)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_dbl(InputType::CONSTANT); // dbl(c)
    }
}

// Test chain_add
HEAVY_TYPED_TEST(stdlib_biggroup, chain_add)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/1290";
    } else {
        TestFixture::test_chain_add();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, chain_add_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_chain_add(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // w, w, c
        TestFixture::test_chain_add(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // w, c, w
        TestFixture::test_chain_add(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // w, c, c
        TestFixture::test_chain_add(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);   // c, w, w
        TestFixture::test_chain_add(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);  // c, w, c
        TestFixture::test_chain_add(InputType::CONSTANT, InputType::CONSTANT, InputType::WITNESS);  // c, c, w
        TestFixture::test_chain_add(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // c, c, c
    }
}

// Test multiple_montgomery_ladder
HEAVY_TYPED_TEST(stdlib_biggroup, multiple_montgomery_ladder)
{

    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/1290";
    } else {
        TestFixture::test_multiple_montgomery_ladder();
    };
}

// Test normalize
TYPED_TEST(stdlib_biggroup, normalize)
{
    TestFixture::test_normalize();
}
TYPED_TEST(stdlib_biggroup, normalize_constant)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_normalize(InputType::CONSTANT);
    }
}

// Test reduce
TYPED_TEST(stdlib_biggroup, reduce)
{
    TestFixture::test_reduce();
}
TYPED_TEST(stdlib_biggroup, reduce_constant)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_reduce(InputType::CONSTANT);
    }
}

// Test unary negation
TYPED_TEST(stdlib_biggroup, unary_negate)
{
    TestFixture::test_unary_negate(InputType::WITNESS);
}

TYPED_TEST(stdlib_biggroup, unary_negate_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_unary_negate(InputType::CONSTANT);
    }
}

// Test operator+=
TYPED_TEST(stdlib_biggroup, add_assign)
{
    TestFixture::test_add_assign(InputType::WITNESS, InputType::WITNESS);
}

TYPED_TEST(stdlib_biggroup, add_assign_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_add_assign(InputType::WITNESS, InputType::CONSTANT); // w += c
        TestFixture::test_add_assign(InputType::CONSTANT, InputType::WITNESS); // c += w
    }
}

// Test operator-=
TYPED_TEST(stdlib_biggroup, sub_assign)
{
    TestFixture::test_sub_assign(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, sub_assign_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_sub_assign(InputType::WITNESS, InputType::CONSTANT); // w -= c
        TestFixture::test_sub_assign(InputType::CONSTANT, InputType::WITNESS); // c -= w
    }
}
// Test checked_unconditional_add
TYPED_TEST(stdlib_biggroup, checked_unconditional_add)
{
    TestFixture::test_checked_unconditional_add(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_checked_unconditional_add(InputType::WITNESS, InputType::CONSTANT);  // w + c
        TestFixture::test_checked_unconditional_add(InputType::CONSTANT, InputType::WITNESS);  // c + w
        TestFixture::test_checked_unconditional_add(InputType::CONSTANT, InputType::CONSTANT); // c + c
    }
}
// Test checked_unconditional_subtract
TYPED_TEST(stdlib_biggroup, checked_unconditional_subtract)
{
    TestFixture::test_checked_unconditional_subtract(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_subtract_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_checked_unconditional_subtract(InputType::WITNESS, InputType::CONSTANT); // w - c
        TestFixture::test_checked_unconditional_subtract(InputType::CONSTANT, InputType::WITNESS); // c - w
        TestFixture::test_checked_unconditional_subtract(InputType::CONSTANT,
                                                         InputType::CONSTANT); // c - c
    }
}
// Test checked_unconditional_add_sub
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_sub)
{
    TestFixture::test_checked_unconditional_add_sub();
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_sub_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_checked_unconditional_add_sub(InputType::WITNESS, InputType::CONSTANT);  // w, c
        TestFixture::test_checked_unconditional_add_sub(InputType::CONSTANT, InputType::WITNESS);  // c, w
        TestFixture::test_checked_unconditional_add_sub(InputType::CONSTANT, InputType::CONSTANT); // c, c
    }
}
// Test conditional_negate
TYPED_TEST(stdlib_biggroup, conditional_negate)
{
    TestFixture::test_conditional_negate();
}
TYPED_TEST(stdlib_biggroup, conditional_negate_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_conditional_negate(InputType::WITNESS, InputType::CONSTANT);  // w, c
        TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::WITNESS);  // c, w
        TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::CONSTANT); // c, c
    }
}
// Test conditional_select
TYPED_TEST(stdlib_biggroup, conditional_select)
{
    TestFixture::test_conditional_select();
}
TYPED_TEST(stdlib_biggroup, conditional_select_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_conditional_select(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // w, w, c
        TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // w, c, w
        TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // w, c, c
        TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);   // c, w, w
        TestFixture::test_conditional_select(InputType::CONSTANT, InputType::CONSTANT, InputType::WITNESS);  // c, c, w
        TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);  // c, w, c
        TestFixture::test_conditional_select(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // c, c, c
    }
}
TYPED_TEST(stdlib_biggroup, incomplete_assert_equal)
{
    TestFixture::test_incomplete_assert_equal();
}
TYPED_TEST(stdlib_biggroup, incomplete_assert_equal_fails)
{
    TestFixture::test_incomplete_assert_equal_failure();
}
TYPED_TEST(stdlib_biggroup, incomplete_assert_equal_edge_cases)
{
    TestFixture::test_incomplete_assert_equal_edge_cases();
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; i++) {
            TestFixture::test_compute_naf();
        }
    } else {
        GTEST_SKIP();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf_zero)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        TestFixture::test_compute_naf_zero();
    } else {
        GTEST_SKIP();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, mul)
{
    TestFixture::test_mul();
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_mul(InputType::WITNESS, InputType::CONSTANT);  // w * c
        TestFixture::test_mul(InputType::CONSTANT, InputType::WITNESS);  // c * w
        TestFixture::test_mul(InputType::CONSTANT, InputType::CONSTANT); // c * c
    }
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_edge_cases)
{
    TestFixture::test_mul_edge_cases();
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_edge_cases_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_mul_edge_cases(InputType::WITNESS, InputType::CONSTANT);  // w * c
        TestFixture::test_mul_edge_cases(InputType::CONSTANT, InputType::WITNESS);  // c * w
        TestFixture::test_mul_edge_cases(InputType::CONSTANT, InputType::CONSTANT); // c * c
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, short_scalar_mul_with_bit_lengths)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP();
    } else {
        TestFixture::test_short_scalar_mul_with_bit_lengths();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, short_scalar_mul_infinity)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP();
    } else {
        TestFixture::test_short_scalar_mul_infinity();
    }
}

// Batch multiplication tests
// 1 point - Base case only
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_singleton)
{
    TestFixture::test_helper_batch_mul(1);
}

// 2 points - Base case + flag variations + one constant mix
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_twin)
{
    TestFixture::test_helper_batch_mul(2);
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_twin_short_scalars)
{
    TestFixture::test_helper_batch_mul(2, true); // short_scalars
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_twin_with_edgecases)
{
    TestFixture::test_helper_batch_mul(2, false, true); // short_scalars, with_edgecases
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_twin_short_scalars_with_edgecases)
{
    TestFixture::test_helper_batch_mul(2, true, true); // short_scalars, with_edgecases
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_twin_mixed_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_helper_batch_mul({ InputType::WITNESS, InputType::CONSTANT },
                                           { InputType::CONSTANT, InputType::WITNESS });
    }
}

// 3 points - Base case only
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_triple)
{
    TestFixture::test_helper_batch_mul(3);
}

// 4 points - Base case only
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_quad)
{
    TestFixture::test_helper_batch_mul(4);
}

// 5 points - Base case + edge case + short scalar + mixed constant
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_five)
{
    TestFixture::test_helper_batch_mul(5);
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_five_with_edgecases)
{
    TestFixture::test_helper_batch_mul(5, false, true); // short_scalars, with_edgecases
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_five_short_scalars)
{
    TestFixture::test_helper_batch_mul(5, true); // short_scalars
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_five_short_scalars_with_edgecases)
{
    TestFixture::test_helper_batch_mul(5, true, true); // short_scalars, with_edgecases
}
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_five_mixed_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support operations with constant elements";
    } else {
        TestFixture::test_helper_batch_mul(
            { InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT },
            { InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT });
    }
}

// 6 points - Base case only
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_six)
{
    TestFixture::test_helper_batch_mul(6);
}

HEAVY_TYPED_TEST(stdlib_biggroup, twin_mul)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/1290";
    } else {
        TestFixture::test_twin_mul();
    };
}

HEAVY_TYPED_TEST(stdlib_biggroup, twin_mul_with_infinity)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/1290";
    } else {
        TestFixture::test_twin_mul_with_infinity();
    };
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_linearly_dependent_generators)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "https://github.com/AztecProtocol/barretenberg/issues/1290";
    } else {
        TestFixture::test_batch_mul_linearly_dependent_generators();
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

// Batch mul edge case tests
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_all_infinity)
{
    TestFixture::test_batch_mul_all_infinity();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_all_zero_scalars)
{
    TestFixture::test_batch_mul_all_zero_scalars();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_mixed_zero_scalars)
{
    TestFixture::test_batch_mul_mixed_zero_scalars();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_mixed_infinity)
{
    TestFixture::test_batch_mul_mixed_infinity();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_cancellation)
{
    TestFixture::test_batch_mul_cancellation();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_mixed_constant_witness)
{
    // Skip for goblin case - causes segfault with mixed constant/witness points
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP();
    } else {
        TestFixture::test_batch_mul_mixed_constant_witness();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_large_number_of_points)
{
    TestFixture::test_batch_mul_large_number_of_points();
}

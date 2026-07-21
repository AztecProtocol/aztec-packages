#include "../biggroup/biggroup.hpp"
#include "../bigfield/bigfield.hpp"
#include "../bool/bool.hpp"
#include "../field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
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
template <typename Curve_, typename ScalarField_, bool use_bigfield> struct TestType {
  public:
    using Curve = Curve_;
    // The base field is always a bigfield, so we only have to select the scalar field type
    using bigfield_element = bb::stdlib::
        element<typename Curve::Builder, typename Curve::BaseField, ScalarField_, typename Curve::GroupNative>;
    using element_ct = std::conditional_t<use_bigfield, bigfield_element, typename Curve::Group>;
    // the field of scalars acting on element_ct
    using scalar_ct = ScalarField_;
};

STANDARD_TESTING_TAGS
template <typename TestType> class stdlib_biggroup : public testing::Test {
  public:
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
        EXPECT_EQ(builder.failed(), !expected_result);
    };

    // Helper to check the infinity status of a circuit element.
    // Ultra: reads the in-circuit is_point_at_infinity flag.
    // Goblin/Mega: derives infinity from native (0,0) coordinates (no circuit flag exists).
    static bool is_infinity(const element_ct& e)
    {
        if constexpr (HasGoblinBuilder<TestType>) {
            return e.get_value().is_point_at_infinity();
        } else {
            return e.is_point_at_infinity().get_value();
        }
    }

    // Create a random point as a witness
    static std::pair<affine_element, element_ct> get_random_witness_point(Builder* builder)
    {
        affine_element point_native(element::random_element());
        element_ct point_ct = element_ct::from_witness(builder, point_native);
        return std::make_pair(point_native, point_ct);
    }

    // Create a random point as a constant
    static std::pair<affine_element, element_ct> get_random_constant_point(Builder* builder)
    {
        affine_element point_native(element::random_element());
        // Create constant coordinates with builder context
        using Fq = typename element_ct::BaseField;
        Fq x_const(builder, uint256_t(point_native.x));
        Fq y_const(builder, uint256_t(point_native.y));
        element_ct point_ct(x_const, y_const);
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
    // Smoke tests for origin tag propagation across all basic operations
    static void test_basic_tag_logic()
    {
        Builder builder;
        STANDARD_TESTING_TAGS;

        // Setup: two points with different tags
        auto [input_a, a] = get_random_point(&builder, InputType::WITNESS);
        auto [input_b, b] = get_random_point(&builder, InputType::WITNESS);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        // Tag is preserved after being set
        EXPECT_EQ(a.get_origin_tag(), submitted_value_origin_tag);
        EXPECT_EQ(b.get_origin_tag(), challenge_origin_tag);

        // Binary operations merge tags
        EXPECT_EQ((a + b).get_origin_tag(), first_two_merged_tag);
        EXPECT_EQ((a - b).get_origin_tag(), first_two_merged_tag);

        // Unary operations preserve tags
        EXPECT_EQ(a.dbl().get_origin_tag(), submitted_value_origin_tag);
        EXPECT_EQ((-a).get_origin_tag(), submitted_value_origin_tag);

        // Scalar multiplication merges tags
        auto scalar = scalar_ct::from_witness(&builder, fr::random_element());
        scalar.set_origin_tag(challenge_origin_tag);
        EXPECT_EQ((a * scalar).get_origin_tag(), first_two_merged_tag);

        // Conditional operations merge tags
        auto predicate = bool_ct(witness_ct(&builder, true));
        predicate.set_origin_tag(challenge_origin_tag);
        EXPECT_EQ(a.conditional_negate(predicate).get_origin_tag(), first_two_merged_tag);

        // conditional_select merges all three input tags
        predicate.set_origin_tag(next_challenge_tag);
        EXPECT_EQ(a.conditional_select(b, predicate).get_origin_tag(), first_second_third_merged_tag);

        // Construction from tagged field elements merges member tags
        affine_element input_c(element::random_element());
        auto x = element_ct::BaseField::from_witness(&builder, input_c.x);
        auto y = element_ct::BaseField::from_witness(&builder, input_c.y);

        // Set tags on the individual field elements
        x.set_origin_tag(submitted_value_origin_tag);
        y.set_origin_tag(challenge_origin_tag);

        // Construct biggroup element from pre-tagged field elements
        // The is_infinity flag is auto-detected from coordinates and won't have a user-set tag
        element_ct c(x, y);

        // The tag of the biggroup element should be the union of x and y member tags
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

        // compute_naf propagates tag to output bits (not available on goblin elements)
        if constexpr (!HasGoblinBuilder<TestType>) {
            auto naf_scalar = scalar_ct::from_witness(&builder, fr(12345));
            naf_scalar.set_origin_tag(submitted_value_origin_tag);
            auto naf = element_ct::compute_naf(naf_scalar, 16);
            for (const auto& bit : naf) {
                EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
            }
        }

#ifndef NDEBUG
        // Instant death tag causes exception on use.
        // NOTE: We construct the element BEFORE poisoning its x coordinate.
        // The 2-argument element_ct constructor sums the x limbs to detect the point at infinity,
        // which would trigger the instant_death check if the tag were already set.
        affine_element input_death(element::random_element());
        auto x_death = element_ct::BaseField::from_witness(&builder, input_death.x);
        auto y_normal = element_ct::BaseField::from_witness(&builder, input_death.y);
        y_normal.set_origin_tag(constant_tag);
        element_ct death_point(x_death, y_normal, /*assert_on_curve=*/false);
        // Poison the x coordinate after construction so the throw happens inside operator+
        death_point.x().set_origin_tag(instant_death_tag);
        EXPECT_THROW(death_point + death_point, std::runtime_error);

        // AUDITTODO: incomplete_assert_equal has inconsistent instant_death behavior between builders. (this was simply
        // untested before).
        //
        // Design intent: assert_equal methods explicitly disable tag checking to allow comparing
        // values from different transcript sources. So instant_death should NOT be triggered.
        //
        // Current behavior:
        // - bigfield: instant_death IS triggered because bigfield::get_origin_tag()
        //   merges 5 limb tags, which invokes the OriginTag merge constructor that checks for
        //   instant_death. This happens BEFORE tags are cleared.
        // - goblin_field: instant_death is NOT triggered because goblin_field::assert_equal
        //   delegates to field_t::assert_equal on each limb, which saves tags individually without
        //   merging.
        //
        // Potential fix: In bigfield::assert_equal, save/restore tags at the limb level instead of
        // calling get_origin_tag() which merges tags.
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
                stdlib::bigfield_test_access::set_limb_element(
                    x_coord, 3, field_ct::from_witness(&builder, bb::fr(uint256_t(1) << 68)));
                x_coord.set_limb_max(3, uint256_t(1) << 68);

                // Skip curve check since we're intentionally creating an invalid point
                // Note: is_infinity is auto-detected as false since coords are non-zero
                element_ct point(x_coord, y_coord, /*assert_on_curve=*/false);
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
                stdlib::bigfield_test_access::set_limb_element(
                    y_coord, 3, field_ct::from_witness(&builder, bb::fr(uint256_t(1) << 68)));
                y_coord.set_limb_max(3, uint256_t(1) << 68);

                // Skip curve check since we're intentionally creating an invalid point
                // Note: is_infinity is auto-detected as false since coords are non-zero
                element_ct point(x_coord, y_coord, /*assert_on_curve=*/false);
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

            uint64_t before = builder.get_num_finalized_gates_inefficient();
            element_ct c = a + b;
            uint64_t after = builder.get_num_finalized_gates_inefficient();

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
            element_ct a_alternate = element_ct::from_witness(&builder, input_a);
            element_ct a_negated = element_ct::from_witness(&builder, -input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            element_ct c = a + b;
            element_ct d = b + a;
            element_ct e = b + b;
            element_ct f = a + a;
            element_ct g = a + a_alternate;
            element_ct h = a + a_negated;

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
            // Create canonical point at infinity (constant and witness cases)
            element_ct input_a = element_ct::constant_infinity(&builder);
            element_ct input_b = element_ct::from_witness(&builder, affine_element::infinity());

            auto standard_a = input_a.get_standard_form();
            auto standard_b = input_b.get_standard_form();

            EXPECT_EQ(is_infinity(standard_a), true);
            EXPECT_EQ(is_infinity(standard_b), true);

            fq standard_a_x = standard_a.x().get_value().lo;
            fq standard_a_y = standard_a.y().get_value().lo;

            fq standard_b_x = standard_b.x().get_value().lo;
            fq standard_b_y = standard_b.y().get_value().lo;

            // Canonical infinity points should maintain (0, 0) coordinates
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

            element_ct c = a - b;

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
            element_ct a_alternate = element_ct::from_witness(&builder, input_a);
            element_ct a_negated = element_ct::from_witness(&builder, -input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            element_ct c = a - b;
            element_ct d = b - a;
            element_ct e = b - b;
            element_ct f = a - a;
            element_ct g = a - a_alternate;
            element_ct h = a - a_negated;

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

            element_ct c = a.dbl();

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

    static void test_dbl_with_infinity()
    {
        Builder builder;
        {
            // Case 1: Doubling point at infinity should return point at infinity
            affine_element input_infinity(element::random_element());
            input_infinity.self_set_infinity();
            element_ct a_infinity = element_ct::from_witness(&builder, input_infinity);

            element_ct result_infinity = a_infinity.dbl();

            // Result should be point at infinity
            EXPECT_TRUE(is_infinity(result_infinity));
        }
        {
            // Case 2: Doubling a normal point should not result in infinity
            affine_element input_normal(element::random_element());
            element_ct a_normal = element_ct::from_witness(&builder, input_normal);

            element_ct result_normal = a_normal.dbl();

            // Result should not be point at infinity (with overwhelming probability)
            EXPECT_FALSE(is_infinity(result_normal));

            // Verify correctness
            affine_element expected_normal(element(input_normal).dbl());
            uint256_t result_x = result_normal.x().get_value().lo;
            uint256_t result_y = result_normal.y().get_value().lo;
            fq expected_x(result_x);
            fq expected_y(result_y);
            EXPECT_EQ(expected_x, expected_normal.x);
            EXPECT_EQ(expected_y, expected_normal.y);
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_dbl_with_y_zero()
    {
        Builder builder;

        // For bn254 curve: y^2 = x^3 + 3
        // We need a point where y = 0, which means x^3 = -3
        // For most curves, there may not be a rational point with y = 0
        // So we test the logic by creating a witness point with y = 0 explicitly
        // Even if it's not on the curve, we can test the doubling logic
        affine_element test_point(element::random_element());

        // Create a point with y = 0 (may not be on curve, but tests the edge case)
        auto x_coord = element_ct::BaseField::from_witness(&builder, test_point.x);
        auto y_coord = element_ct::BaseField::from_witness(&builder, fq(0));
        // Skip curve check since we're intentionally creating an invalid point to test edge case
        // Note: is_infinity is auto-detected as false since x coordinate is non-zero
        element_ct a(x_coord, y_coord, /*assert_on_curve=*/false);

        // With the new assertion, attempting to double a point with y = 0 should throw
        // because for valid curves like bn254, y = 0 cannot occur on the curve
        EXPECT_THROW_WITH_MESSAGE(a.dbl(), "Attempting to dbl a point with y = 0, not allowed.");
    }

    static void test_add_equals_dbl()
    {
        // Test that P + P equals P.dbl()
        Builder builder;
        size_t num_repetitions = 5;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, InputType::WITNESS);

            element_ct sum = a + a;
            element_ct doubled = a.dbl();

            // Results should match
            uint256_t sum_x = sum.x().get_value().lo;
            uint256_t sum_y = sum.y().get_value().lo;
            uint256_t dbl_x = doubled.x().get_value().lo;
            uint256_t dbl_y = doubled.y().get_value().lo;

            EXPECT_EQ(fq(sum_x), fq(dbl_x));
            EXPECT_EQ(fq(sum_y), fq(dbl_y));
            EXPECT_EQ(is_infinity(sum), is_infinity(doubled));
        }
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_sub_neg_equals_double()
    {
        // Test that P - (-P) equals 2P
        Builder builder;
        size_t num_repetitions = 5;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input_a, a] = get_random_point(&builder, InputType::WITNESS);

            element_ct neg_a = -a;
            element_ct result = a - neg_a;
            element_ct expected = a.dbl();

            // P - (-P) = P + P = 2P
            uint256_t result_x = result.x().get_value().lo;
            uint256_t result_y = result.y().get_value().lo;
            uint256_t expected_x = expected.x().get_value().lo;
            uint256_t expected_y = expected.y().get_value().lo;

            EXPECT_EQ(fq(result_x), fq(expected_x));
            EXPECT_EQ(fq(result_y), fq(expected_y));
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
        uint512_t neg_x_u512 = uint512_t(neg_a.x().get_value()) % uint512_t(fq::modulus);
        uint512_t neg_y_u512 = uint512_t(neg_a.y().get_value()) % uint512_t(fq::modulus);
        uint256_t neg_x = neg_x_u512.lo;
        uint256_t neg_y = neg_y_u512.lo;

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

            // Get random predicate
            bool predicate_value = (engine.get_random_uint8() % 2) != 0;
            bool_ct predicate = (predicate_type == InputType::WITNESS) ? bool_ct(witness_ct(&builder, predicate_value))
                                                                       : bool_ct(predicate_value);

            element_ct c = a.conditional_negate(predicate);

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

            element_ct c = a.conditional_select(b, predicate);

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

                a.incomplete_assert_equal(b, "elements don't match");
            }
            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
        // Case 2: Should pass because the points are identical and at infinity (canonical representation)
        {
            Builder builder;
            size_t num_repetitions = 10;
            for (size_t i = 0; i < num_repetitions; ++i) {
                affine_element input_a(element::random_element());
                input_a.self_set_infinity();
                element_ct a = element_ct::from_witness(&builder, input_a);
                element_ct b = element_ct::from_witness(&builder, input_a);

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
            // For an elliptic curve y^2 = x^3 + ax + b, if (x, y) is on the curve, then (x, -y) is also on the
            // curve
            affine_element input_b = input_a;
            input_b.y = -input_a.y; // Negate y to get a different point with same x

            // Construct the circuit elements with same x but different y
            auto x_coord = element_ct::BaseField::from_witness(&builder, input_a.x);
            auto y_coord_a = element_ct::BaseField::from_witness(&builder, input_a.y);
            auto y_coord_b = element_ct::BaseField::from_witness(&builder, input_b.y);

            // Note: is_infinity is auto-detected as false since coordinates are non-zero
            element_ct a(x_coord, y_coord_a);
            element_ct b(x_coord, y_coord_b);

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

            input_a.self_set_infinity();
            element_ct a = element_ct::from_witness(&builder, input_a); // at infinity
            element_ct b = element_ct::from_witness(&builder, input_b); // not at infinity

            a.incomplete_assert_equal(b, "infinity flag mismatch test");

            EXPECT_EQ(builder.failed(), true);
            if constexpr (HasGoblinBuilder<TestType>) {
                // Goblin has no infinity flag; (0,0) coords differ from b's coords
                EXPECT_EQ(builder.err(), "infinity flag mismatch test (x coordinate)");
            } else {
                EXPECT_EQ(builder.err(), "infinity flag mismatch test (infinity flag)");
            }
        }
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
            auto naf = element_ct::compute_naf(scalar, length);

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
        for (size_t max_num_bits : { 0UL, 1UL, 2UL, 64UL, 128UL }) {
            Builder builder = Builder();

            scalar_ct scalar = scalar_ct::from_witness(&builder, fr(0));
            auto naf = element_ct::compute_naf(scalar, max_num_bits);
            ASSERT_FALSE(naf.empty());

            // For scalar = 0, the canonical NAF encoding is [MSB=0, 1, ..., 1, skew=1] (bool semantics: 0 ⟶ +1, 1 ⟶ −1)
            const size_t length = naf.size() - 1;
            EXPECT_FALSE(naf[0].get_value());     // msm 0
            EXPECT_TRUE(naf[length].get_value()); // lsb 1
            for (size_t k = 1; k < length; ++k) { //
                EXPECT_TRUE(naf[k].get_value());  // rest all bits 1
            }

            // Field reconstruction: scalar = -naf[L] + Σ_{i=0..L-1} (1 - 2·naf[i]) · 2^{L-1-i}.
            fr reconstructed(0);
            for (size_t i = 0; i < length; ++i) {
                reconstructed += (fr(1) - fr(2) * fr(naf[i].get_value())) * fr(uint256_t(1) << (length - 1 - i));
            }
            reconstructed -= fr(naf[length].get_value());
            EXPECT_EQ(reconstructed, fr(0));

            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }
    }

    static void test_compute_naf_overflow_lower_half()
    {
        Builder builder = Builder();

        // Create a scalar that is even (skew=1) and has least-significant 2L bits all 0 (L=68, 2L=136)
        // This causes overflow in negative_lo = skew + sum_{i=0}^{135} a'_{i+1} * 2^i = 1 + (2^136 - 1) = 2^136
        //
        // Scalar chosen such that least significant 136 bits are zero:
        fr scalar_native = fr::random_element();
        uint256_t scalar_raw = uint256_t(scalar_native);
        scalar_raw = (scalar_raw >> 136) << 136;
        fr scalar_val = fr(scalar_raw);
        scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);
        scalar.set_origin_tag(submitted_value_origin_tag);

        // Compute NAF with full field size
        const size_t length = fr::modulus.get_msb() + 1;

        // This should not overflow with the fix in place
        auto naf = element_ct::compute_naf(scalar, length);

        // Verify NAF correctness
        for (const auto& bit : naf) {
            EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
        }

        // Reconstruct scalar from NAF: scalar = -naf[L] + \sum_{i=0}^{L-1}(1-2*naf[i]) 2^{L-1-i}
        fr reconstructed_val(0);
        for (size_t i = 0; i < length; i++) {
            reconstructed_val += (fr(1) - fr(2) * fr(naf[i].get_value())) * fr(uint256_t(1) << (length - 1 - i));
        }
        reconstructed_val -= fr(naf[length].get_value());

        EXPECT_EQ(scalar_val, reconstructed_val);
        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Regression test: overwrite the naf witnesses with the malicious top-bit-flipped
    // assignment (plus the `field_t::accumulate` intermediates that keep the big_add_gate chain
    // satisfied) and check the circuit is rejected.
    static void test_compute_naf_top_bit_rejects_malicious_witness()
    {
        if constexpr (scalar_ct::is_composite) {
            GTEST_SKIP() << "composite-Fr reconstruction uses a different witness layout";
        } else {
            // `is_write_vk_mode = true` permits witness mutation via `set_variable`.
            Builder builder(/*is_write_vk_mode=*/true);
            const size_t num_rounds = fr::modulus.get_msb() + 1;
            const uint256_t top_pow = uint256_t(1) << (num_rounds - 1);
            const uint256_t range_size = uint256_t(1) << num_rounds;

            fr scalar_val = fr::random_element();
            while (scalar_val == fr::zero()) {
                scalar_val = fr::random_element();
            }

            // Create a scalar witness
            scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_val);
            auto naf = element_ct::compute_naf(scalar, num_rounds);
            EXPECT_TRUE(CircuitChecker::check(builder)) << "honest circuit must verify before mutation";

            // Rebalance: with `naf[0] = 1`, the integer reconstruction needs
            // `lower_bits + skew ≡ scalar (mod r)`. Let `shifted_scalar ≡ (scalar + top_pow) (mod r)`
            // reduced into `[0, range_size - 1]`; pick `skew` for parity, then
            // `lower_bits_int = (range_size - 1 - shifted_scalar - skew) / 2` gives
            // `naf[k] = bit_{num_rounds-1-k}(lower_bits_int)` for k ∈ [1, num_rounds - 1].
            const uint256_t target_int = static_cast<uint256_t>(scalar_val + fr(top_pow));
            const uint256_t shifted_scalar =
                (target_int < top_pow) ? target_int + top_pow : target_int + top_pow - fr::modulus;
            const uint64_t skew = shifted_scalar.get_bit(0) ? 0 : 1;
            const uint256_t lower_bits_int = (range_size - 1 - shifted_scalar - skew) / 2;

            // Overwrite naf witnesses with the malicious assignment.
            builder.set_variable(naf[0].get_witness_index(), fr(1));
            builder.set_variable(naf[num_rounds].get_witness_index(), fr(skew));
            for (size_t k = 1; k < num_rounds; ++k) {
                builder.set_variable(naf[k].get_witness_index(),
                                     fr(lower_bits_int.get_bit(num_rounds - 1 - k) ? 1 : 0));
            }

            // Recompute the intermediate accumulator witnesses from the malicious naf bits.
            const size_t num_inputs = num_rounds + 1;
            const size_t num_gates = (num_inputs + 2) / 3;
            const size_t padded_size = num_gates * 3;
            const uint32_t accumulate_start_idx = naf[0].get_witness_index() + 1;

            std::vector<fr> summands(padded_size, fr(0));
            for (size_t i = 0; i < num_rounds; ++i) {
                const fr naf_bit = builder.get_variable(naf[num_rounds - 1 - i].get_witness_index());
                summands[i] = (fr(1) - fr(2) * naf_bit) * fr(uint256_t(1) << i);
            }
            summands[num_rounds] = -builder.get_variable(naf[num_rounds].get_witness_index());

            fr accumulator = std::accumulate(summands.begin(), summands.end(), fr(0));
            EXPECT_EQ(accumulator, scalar_val) << "rebalance arithmetic should give a field-equivalent reconstruction";
            builder.set_variable(accumulate_start_idx, accumulator);
            for (size_t gate_idx = 0; gate_idx + 1 < num_gates; ++gate_idx) {
                accumulator -= summands[3 * gate_idx] + summands[(3 * gate_idx) + 1] + summands[(3 * gate_idx) + 2];
                builder.set_variable(accumulate_start_idx + 1 + static_cast<uint32_t>(gate_idx), accumulator);
            }

            EXPECT_FALSE(CircuitChecker::check(builder))
                << "compute_naf must reject the malicious top-bit-flipped NAF assignment";
        }
    }

    // Regression test: compute_naf must not depend on witness values for its circuit shape.
    // Previously it did — with `max_num_bits < field_size`, passing a zero-valued scalar witness
    // forced `num_rounds = fr::modulus.get_msb() + 1`, producing more NAF entries
    // (and a larger circuit) than a non-zero scalar with the same `max_num_bits`.
    static void test_compute_naf_witness_value_independence()
    {
        constexpr size_t max_num_bits = 128;
        const std::array<fr, 2> scalar_values{ fr(42), fr::zero() };

        std::array<Builder, 2> builders;
        for (size_t k = 0; k < 2; ++k) {
            Builder& builder = builders[k];
            scalar_ct scalar = scalar_ct::from_witness(&builder, scalar_values[k]);
            (void)element_ct::compute_naf(scalar, max_num_bits);
        }

        EXPECT_EQ(builders[0].blocks, builders[1].blocks);
    }

    static void test_mul(InputType scalar_type = InputType::WITNESS, InputType point_type = InputType::WITNESS)
    {
        Builder builder;
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [input, P] = get_random_point(&builder, point_type);
            auto [scalar, x] = get_random_scalar(&builder, scalar_type, /*even*/ true);

            std::cerr << "gates before mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            element_ct c = P * x;
            std::cerr << "builder after mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            affine_element c_expected(element(input) * scalar);

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

        const auto run_mul_and_check = [&](element_ct& P, scalar_ct& x, const affine_element& expected) {
            // Perform multiplication
            element_ct result = P * x;

            // Check if result is infinity
            bool result_is_inf = is_infinity(result);
            bool expected_is_inf = expected.is_point_at_infinity();

            EXPECT_EQ(result_is_inf, expected_is_inf);

            // If not infinity, check if the coordinates match
            if (!expected_is_inf) {
                uint256_t result_x = result.x().get_value().lo;
                uint256_t result_y = result.y().get_value().lo;

                EXPECT_EQ(fq(result_x), expected.x);
                EXPECT_EQ(fq(result_y), expected.y);
            }
        };

        // Case 1: P * 0 = ∞
        {
            auto [input, P] = get_random_point(&builder, point_type);
            scalar_ct x = (scalar_type == InputType::WITNESS) ? scalar_ct::from_witness(&builder, fr(0))
                                                              : scalar_ct(&builder, fr(0));
            affine_element expected_infinity = affine_element(element::infinity());
            run_mul_and_check(P, x, expected_infinity);
        }
        // Case 2: (∞) * k = ∞
        {
            auto [input, P] = get_random_point(&builder, point_type);
            if (point_type == InputType::CONSTANT) {
                P = element_ct::constant_infinity(&builder);
            } else {
                input.self_set_infinity();
                P = element_ct::from_witness(&builder, input);
            }

            auto [scalar, x] = get_random_scalar(&builder, scalar_type, /*even*/ true);
            affine_element expected_infinity = affine_element(element::infinity());
            run_mul_and_check(P, x, expected_infinity);
        }
        // Case 3: P * 1 = P
        {
            auto [input, P] = get_random_point(&builder, point_type);
            scalar_ct one = (scalar_type == InputType::WITNESS) ? scalar_ct::from_witness(&builder, fr(1))
                                                                : scalar_ct(&builder, fr(1));
            run_mul_and_check(P, one, input);
        }
        // Case 4: P * (-1) = -P
        {
            auto [input, P] = get_random_point(&builder, point_type);
            fr neg_one = -fr(1);
            scalar_ct neg_one_ct = (scalar_type == InputType::WITNESS) ? scalar_ct::from_witness(&builder, neg_one)
                                                                       : scalar_ct(&builder, neg_one);
            affine_element expected = affine_element(-element(input));
            run_mul_and_check(P, neg_one_ct, expected);
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

            std::cerr << "gates before mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            // Multiply using specified scalar length
            element_ct c = P.scalar_mul(x, i);
            std::cerr << "builder after mul " << builder.get_num_finalized_gates_inefficient() << std::endl;
            affine_element c_expected(element(input) * scalar);

            fq c_x_result(c.x().get_value().lo);
            fq c_y_result(c.y().get_value().lo);

            EXPECT_EQ(c_x_result, c_expected.x);

            EXPECT_EQ(c_y_result, c_expected.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    static void test_short_scalar_mul_infinity()
    {
        // A point at infinity must preserve `is_point_at_infinity()` after multiplication by a
        // short scalar. The gate count must also be identical to the finite-point case:
        // `handle_points_at_infinity` rewrites (∞, s) as (G, 0) in-circuit, the small path's
        // `compute_naf` handles the zero scalar at `max_num_bits` width, and `batch_mul_internal`
        // routes by compile-time facts only, so the circuit shape does not depend on whether
        // the input point is infinity.

        std::vector<element> points(2);
        points[0] = element::infinity();
        points[1] = element::random_element();
        std::vector<size_t> gates(2);

        bool expect_infinity = true;
        for (auto [point, num_gates] : zip_view(points, gates)) {
            Builder builder;

            const size_t max_num_bits = 128;
            uint256_t scalar_raw = engine.get_random_uint256() >> (256 - max_num_bits);
            fr scalar = fr(scalar_raw);

            element_ct P = element_ct::from_witness(&builder, point);
            scalar_ct x = scalar_ct::from_witness(&builder, scalar);

            element_ct c = P.scalar_mul(x, max_num_bits);
            num_gates = builder.get_num_finalized_gates_inefficient();

            EXPECT_EQ(is_infinity(c), expect_infinity);
            EXPECT_CIRCUIT_CORRECTNESS(builder);
            expect_infinity = false;
        }
        EXPECT_EQ(gates[0], gates[1]);
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

            element_ct c = element_ct::batch_mul({ P_a, P_b }, { x_a, x_b });

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

            element_ct c = element_ct::batch_mul({ P_a, P_b }, { x_a, x_b }, 128);

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

        std::vector<scalar_ct> scalars;
        std::vector<element_ct> points;
        for (size_t i = 0; i < 3; ++i) {
            const element_ct point = element_ct::from_witness(&builder, input_points[i]);
            const scalar_ct scalar = scalar_ct::from_witness(&builder, input_scalars[i]);
            scalars.emplace_back(scalar);
            points.emplace_back(point);
        }

        // Since with_edgecases = true by default, should handle linearly dependent points correctly
        // (offset generator is now a free witness sampled inside batch_mul)
        element_ct c = element_ct::batch_mul(points,
                                             scalars,
                                             /*max_num_bits*/ 128);
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

    static void test_batch_mul_linearly_dependent_generators_failure()
    {
        Builder builder;
        affine_element input_P(element::random_element());

        affine_element input_P_a = affine_element(element(input_P) + element(input_P));     // 2P
        affine_element input_P_b = affine_element(element(input_P_a) + element(input_P));   // 3P
        affine_element input_P_c = affine_element(element(input_P_a) + element(input_P_b)); // 5P
        std::vector<affine_element> input_points = { input_P_a, input_P_b, input_P_c };

        // Choose scalars similar to the previous test
        fr scalar_a(11);
        fr scalar_b(14);
        fr scalar_c(6);
        std::vector<fr> input_scalars = { scalar_a, scalar_b, scalar_c };

        std::vector<scalar_ct> scalars;
        std::vector<element_ct> points;
        for (size_t i = 0; i < 3; ++i) {
            const element_ct point = element_ct::from_witness(&builder, input_points[i]);
            points.emplace_back(point);

            const scalar_ct scalar = scalar_ct::from_witness(&builder, input_scalars[i]);
            scalars.emplace_back(scalar);
        }

        // with_edgecases = false should fail due to linearly dependent points
        // This will fail only while using ultra builder
        element_ct::batch_mul(points, scalars, /*max_num_bits*/ 4, /*with_edgecases*/ false);

        EXPECT_CIRCUIT_CORRECTNESS(builder, false);
        EXPECT_EQ(builder.err(), "bigfield: prime limb diff is zero, but expected non-zero");
    }

    // Regression test for the offset-generator as point at infinity in `mask_points`.
    static void test_offset_generator_infinity_is_rejected()
    {
        // is_write_vk_mode=true so `set_variable` (used below to poison the offset generator's witness) is
        // permitted; outside VK mode, the builder asserts to prevent accidental witness overwrites.
        Builder builder(/*is_write_vk_mode=*/true);
        using BaseField = typename element_ct::BaseField;

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < 2; ++i) {
            circuit_points.push_back(get_random_point(&builder, InputType::WITNESS).second);
            circuit_scalars.push_back(get_random_scalar(&builder, InputType::WITNESS).second);
        }

        // Call mask_points via the test accessor (it is a private member of element).
        auto [_masked_points, _masked_scalars, offset_G] = stdlib::element_default::element_test_accessor::
            mask_points<Builder, typename element_ct::BaseField, scalar_ct, typename Curve::GroupNative>(
                circuit_points, circuit_scalars);

        // Sanity: with the honest random offset generator, mask_points's non-infinity constraint is satisfied.
        EXPECT_TRUE(CircuitChecker::check(builder));

        // Set offset generator to be a point at infinity: (0, 0) with is_infinity = 1.
        for (size_t i = 0; i < BaseField::NUM_LIMBS; ++i) {
            builder.set_variable(offset_G.x().get_limb(i).element.get_witness_index(), 0);
            builder.set_variable(offset_G.y().get_limb(i).element.get_witness_index(), 0);
        }
        builder.set_variable(offset_G.is_point_at_infinity().get_witness_index(), 1);

        // The non-infinity assertion inside mask_points must catch the malicious witness substitution.
        EXPECT_FALSE(CircuitChecker::check(builder));
    }

    // Regression test for a masked point p_i + 2ⁱ·G being the point at infinity in `mask_points`.
    static void test_masked_point_infinity_is_rejected()
    {
        Builder builder(/*is_write_vk_mode=*/true);
        using BaseField = typename element_ct::BaseField;

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < 2; ++i) {
            circuit_points.push_back(get_random_point(&builder, InputType::WITNESS).second);
            circuit_scalars.push_back(get_random_scalar(&builder, InputType::WITNESS).second);
        }

        auto [masked_points, _masked_scalars, _offset_G] = stdlib::element_default::element_test_accessor::
            mask_points<Builder, typename element_ct::BaseField, scalar_ct, typename Curve::GroupNative>(
                circuit_points, circuit_scalars);

        EXPECT_TRUE(CircuitChecker::check(builder));

        // Set the first masked point to be a point at infinity: (0, 0) with is_infinity = 1.
        for (size_t i = 0; i < BaseField::NUM_LIMBS; ++i) {
            builder.set_variable(masked_points[0].x().get_limb(i).element.get_witness_index(), 0);
            builder.set_variable(masked_points[0].y().get_limb(i).element.get_witness_index(), 0);
        }
        builder.set_variable(masked_points[0].is_point_at_infinity().get_witness_index(), 1);

        EXPECT_FALSE(CircuitChecker::check(builder));
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
            scalar_ct x_a = scalar_ct::from_witness(&builder, scalar_a);
            element_ct c = P_a * x_a;

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

        element_ct result_point =
            element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, with_edgecases);

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
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result_point = element_ct::batch_mul(circuit_points, circuit_scalars);

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
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
        }

        element_ct result_point2 =
            element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

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
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }
            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

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
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }

            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

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
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalars[i]));
            }

            element_ct result_point =
                element_ct::batch_mul(circuit_points, circuit_scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

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
        EXPECT_TRUE(is_infinity(result));
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
        EXPECT_TRUE(is_infinity(result));
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

    // Regression test: the batch_mul partition must not depend on witness values. Build the
    // same source program with two scalar assignments (all non-zero vs. alternating zeros) and
    // assert the resulting execution-trace blocks (selectors + wire indices) are identical.
    static void test_batch_mul_short_scalars_witness_value_independence()
    {
        constexpr size_t max_num_bits = 128;
        constexpr size_t num_points = 4;

        std::vector<affine_element> input_points;
        std::array<std::vector<fr>, 2> scalar_assignments;
        for (size_t i = 0; i < num_points; ++i) {
            input_points.push_back(affine_element(element::random_element()));
            const uint256_t s_raw = engine.get_random_uint256() >> (256 - max_num_bits);
            scalar_assignments[0].push_back(fr(s_raw));
            scalar_assignments[1].push_back((i % 2 == 0) ? fr::zero() : fr(s_raw));
        }

        std::array<Builder, 2> builders;
        for (size_t k = 0; k < 2; ++k) {
            Builder& builder = builders[k];
            std::vector<element_ct> circuit_points;
            std::vector<scalar_ct> circuit_scalars;
            for (size_t i = 0; i < num_points; ++i) {
                circuit_points.push_back(element_ct::from_witness(&builder, input_points[i]));
                circuit_scalars.push_back(scalar_ct::from_witness(&builder, scalar_assignments[k][i]));
            }

            element_ct circuit_result =
                element_ct::batch_mul(circuit_points, circuit_scalars, max_num_bits, /*with_edgecases=*/false);

            element expected = element::infinity();
            for (size_t i = 0; i < num_points; ++i) {
                expected += (element(input_points[i]) * scalar_assignments[k][i]);
            }
            affine_element expected_affine = affine_element(expected);
            if (expected_affine.is_point_at_infinity()) {
                EXPECT_TRUE(is_infinity(circuit_result));
            } else {
                const uint256_t result_x = circuit_result.x().get_value().lo;
                const uint256_t result_y = circuit_result.y().get_value().lo;
                EXPECT_EQ(fq(result_x), expected_affine.x);
                EXPECT_EQ(fq(result_y), expected_affine.y);
            }
            EXPECT_CIRCUIT_CORRECTNESS(builder);
        }

        // Ensure the blocks are equal for both builders
        EXPECT_EQ(builders[0].blocks, builders[1].blocks);
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
            circuit_points.push_back(element_ct(point.x, point.y));               // Constant
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

    // Test that infinity representation is canonical (x=0, y=0) after all operations
    static void test_infinity_canonical_representation()
    {
        Builder builder;

        // Case 1: constant_infinity() returns canonical form
        {
            element_ct inf = element_ct::constant_infinity(&builder);
            EXPECT_TRUE(is_infinity(inf));
            // Verify coordinates are (0, 0)
            EXPECT_EQ(fq(inf.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(inf.y().get_value().lo), fq(0));
        }

        // Case 2: P + (-P) = infinity with canonical coords
        {
            affine_element input(element::random_element());
            element_ct P = element_ct::from_witness(&builder, input);
            element_ct neg_P = -P;
            element_ct result = P + neg_P;

            EXPECT_TRUE(is_infinity(result));
            // After standardization, coordinates should be (0, 0)
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Case 3: P - P = infinity with canonical coords
        {
            affine_element input(element::random_element());
            element_ct P = element_ct::from_witness(&builder, input);
            element_ct result = P - P;

            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Case 4: infinity + infinity = infinity with canonical coords
        {
            element_ct inf1 = element_ct::constant_infinity(&builder);
            element_ct inf2 = element_ct::constant_infinity(&builder);
            element_ct result = inf1 + inf2;

            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Case 5: 2 * infinity = infinity with canonical coords
        {
            element_ct inf = element_ct::constant_infinity(&builder);
            element_ct result = inf.dbl();

            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test chained operations involving infinity
    static void test_infinity_chained_operations()
    {
        Builder builder;

        // (a + infinity) - a = infinity
        {
            affine_element input(element::random_element());
            element_ct a = element_ct::from_witness(&builder, input);
            element_ct inf = element_ct::constant_infinity(&builder);

            element_ct temp = a + inf;
            element_ct result = temp - a;

            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // a + (b - b) = a
        {
            affine_element input_a(element::random_element());
            affine_element input_b(element::random_element());
            element_ct a = element_ct::from_witness(&builder, input_a);
            element_ct b = element_ct::from_witness(&builder, input_b);

            element_ct zero = b - b; // Should be infinity
            element_ct result = a + zero;

            // Result should equal a
            EXPECT_EQ(fq(result.x().get_value().lo), input_a.x);
            EXPECT_EQ(fq(result.y().get_value().lo), input_a.y);
            EXPECT_FALSE(is_infinity(result));
        }

        // (infinity - infinity) + a = a
        {
            affine_element input(element::random_element());
            element_ct a = element_ct::from_witness(&builder, input);
            element_ct inf1 = element_ct::constant_infinity(&builder);
            element_ct inf2 = element_ct::constant_infinity(&builder);

            element_ct zero = inf1 - inf2;
            element_ct result = zero + a;

            EXPECT_EQ(fq(result.x().get_value().lo), input.x);
            EXPECT_EQ(fq(result.y().get_value().lo), input.y);
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test conditional_select with infinity points
    static void test_conditional_select_with_infinity()
    {
        Builder builder;

        affine_element input_a(element::random_element());
        element_ct a = element_ct::from_witness(&builder, input_a);
        element_ct inf = element_ct::constant_infinity(&builder);

        // Case 1: Select finite point when predicate is false
        {
            bool_ct pred(witness_ct(&builder, false));
            element_ct result = a.conditional_select(inf, pred);

            EXPECT_FALSE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), input_a.x);
            EXPECT_EQ(fq(result.y().get_value().lo), input_a.y);
        }

        // Case 2: Select infinity when predicate is true
        {
            bool_ct pred(witness_ct(&builder, true));
            element_ct result = a.conditional_select(inf, pred);

            EXPECT_TRUE(is_infinity(result));
        }

        // Case 3: Select between two infinity points
        {
            element_ct inf2 = element_ct::constant_infinity(&builder);
            bool_ct pred(witness_ct(&builder, true));
            element_ct result = inf.conditional_select(inf2, pred);

            EXPECT_TRUE(is_infinity(result));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test conditional_negate with infinity
    static void test_conditional_negate_with_infinity()
    {
        Builder builder;

        element_ct inf = element_ct::constant_infinity(&builder);

        // Negating infinity should still be infinity
        {
            bool_ct pred(witness_ct(&builder, true));
            element_ct result = inf.conditional_negate(pred);

            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Not negating infinity should still be infinity
        {
            bool_ct pred(witness_ct(&builder, false));
            element_ct result = inf.conditional_negate(pred);

            EXPECT_TRUE(is_infinity(result));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test get_standard_form preserves canonical infinity representation
    static void test_get_standard_form_normalizes_infinity()
    {
        Builder builder;

        // Use constant_infinity() factory to create canonical infinity with (0, 0) coordinates
        // Note: We no longer support non-canonical infinity representations (points with
        // random coords but is_infinity=true) through the public API
        element_ct P = element_ct::constant_infinity(&builder);

        // Canonical infinity has (0, 0) coordinates
        EXPECT_EQ(fq(P.x().get_value().lo), fq(0));
        EXPECT_EQ(fq(P.y().get_value().lo), fq(0));
        EXPECT_TRUE(is_infinity(P));

        // After standardization, coords should still be (0, 0)
        element_ct standardized = P.get_standard_form();
        EXPECT_TRUE(is_infinity(standardized));
        EXPECT_EQ(fq(standardized.x().get_value().lo), fq(0));
        EXPECT_EQ(fq(standardized.y().get_value().lo), fq(0));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test auto-detection of infinity in 2-argument constructor
    static void test_infinity_auto_detection_in_constructor()
    {
        Builder builder;

        // Create element with (0, 0) coordinates - should auto-detect as infinity
        auto x_zero = element_ct::BaseField::from_witness(&builder, fq(0));
        auto y_zero = element_ct::BaseField::from_witness(&builder, fq(0));

        element_ct point(x_zero, y_zero);

        EXPECT_TRUE(is_infinity(point));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test scalar multiplication edge cases with infinity
    static void test_scalar_mul_infinity_edge_cases()
    {
        Builder builder;

        // Case 1: 0 * P = infinity
        {
            affine_element input(element::random_element());
            element_ct P = element_ct::from_witness(&builder, input);
            scalar_ct zero = scalar_ct::from_witness(&builder, fr(0));

            element_ct result = P * zero;
            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Case 2: k * infinity = infinity
        {
            element_ct inf = element_ct::constant_infinity(&builder);
            fr scalar_val = fr::random_element();
            scalar_ct k = scalar_ct::from_witness(&builder, scalar_val);

            element_ct result = inf * k;
            EXPECT_TRUE(is_infinity(result));
            EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
            EXPECT_EQ(fq(result.y().get_value().lo), fq(0));
        }

        // Case 3: 0 * infinity = infinity
        {
            element_ct inf = element_ct::constant_infinity(&builder);
            scalar_ct zero = scalar_ct::from_witness(&builder, fr(0));

            element_ct result = inf * zero;
            EXPECT_TRUE(is_infinity(result));
        }

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test batch_mul where result cancels to infinity
    static void test_batch_mul_complete_cancellation()
    {
        Builder builder;

        // P*a + Q*b + P*(-a) + Q*(-b) = infinity
        affine_element P(element::random_element());
        affine_element Q(element::random_element());
        fr a = fr::random_element();
        fr b = fr::random_element();

        std::vector<element_ct> points = {
            element_ct::from_witness(&builder, P),
            element_ct::from_witness(&builder, Q),
            element_ct::from_witness(&builder, P),
            element_ct::from_witness(&builder, Q),
        };

        std::vector<scalar_ct> scalars = { scalar_ct::from_witness(&builder, a),
                                           scalar_ct::from_witness(&builder, b),
                                           scalar_ct::from_witness(&builder, -a),
                                           scalar_ct::from_witness(&builder, -b) };

        element_ct result = element_ct::batch_mul(points, scalars, 0, true);

        EXPECT_TRUE(is_infinity(result));
        EXPECT_EQ(fq(result.x().get_value().lo), fq(0));
        EXPECT_EQ(fq(result.y().get_value().lo), fq(0));

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test addition with constant infinity
    static void test_add_constant_infinity()
    {
        Builder builder;

        // P + constant_infinity = P
        affine_element input(element::random_element());
        element_ct P = element_ct::from_witness(&builder, input);
        element_ct const_inf = element_ct::constant_infinity(&builder); // This is a constant

        element_ct result = P + const_inf;

        EXPECT_FALSE(is_infinity(result));
        EXPECT_EQ(fq(result.x().get_value().lo), input.x);
        EXPECT_EQ(fq(result.y().get_value().lo), input.y);

        // constant_infinity + P = P
        element_ct result2 = const_inf + P;
        EXPECT_FALSE(is_infinity(result2));
        EXPECT_EQ(fq(result2.x().get_value().lo), input.x);
        EXPECT_EQ(fq(result2.y().get_value().lo), input.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }

    // Test that witness infinity points (created via operations) work correctly
    static void test_witness_infinity_from_operations()
    {
        Builder builder;

        // Create infinity as P - P (witness-based infinity)
        affine_element input(element::random_element());
        element_ct P = element_ct::from_witness(&builder, input);
        element_ct witness_inf = P - P;

        // Use this witness infinity in operations
        affine_element input2(element::random_element());
        element_ct Q = element_ct::from_witness(&builder, input2);

        // Q + witness_inf = Q
        element_ct result = Q + witness_inf;
        EXPECT_EQ(fq(result.x().get_value().lo), input2.x);
        EXPECT_EQ(fq(result.y().get_value().lo), input2.y);

        // witness_inf + Q = Q
        element_ct result2 = witness_inf + Q;
        EXPECT_EQ(fq(result2.x().get_value().lo), input2.x);
        EXPECT_EQ(fq(result2.y().get_value().lo), input2.y);

        EXPECT_CIRCUIT_CORRECTNESS(builder);
    }
};

// bn254 with ultra arithmetisation where scalar field is native field, base field is non-native field (bigfield)
using bn254_with_ultra =
    TestType<stdlib::bn254<bb::UltraCircuitBuilder>, stdlib::bn254<bb::UltraCircuitBuilder>::ScalarField, false>;

// bn254 with ultra arithmetisation where both scalar and base fields are non-native fields
using bn254_with_ultra_scalar_bigfield = TestType<stdlib::bn254<bb::UltraCircuitBuilder>,
                                                  bb::stdlib::bigfield<bb::UltraCircuitBuilder, bb::Bn254FrParams>,
                                                  true>;

// bn254 with mega arithmetisation where scalar field is native field, base field is non-native field
using bn254_with_mega =
    TestType<stdlib::bn254<bb::MegaCircuitBuilder>, stdlib::bn254<bb::MegaCircuitBuilder>::ScalarField, false>;

// secp256r1 with ultra arithmetisation where both scalar and base fields are (naturally) non-native fields
using secp256r1_with_ultra = TestType<stdlib::secp256r1<bb::UltraCircuitBuilder>,
                                      stdlib::secp256r1<bb::UltraCircuitBuilder>::ScalarField,
                                      false>;

// secp256k1 with ultra arithmetisation where both scalar and base fields are (naturally) non-native fields
using secp256k1_with_ultra = TestType<stdlib::secp256k1<bb::UltraCircuitBuilder>,
                                      stdlib::secp256k1<bb::UltraCircuitBuilder>::ScalarField,
                                      false>;

using TestTypes = testing::Types<bn254_with_ultra,
                                 bn254_with_ultra_scalar_bigfield,
                                 bn254_with_mega,
                                 secp256r1_with_ultra,
                                 secp256k1_with_ultra>;

TYPED_TEST_SUITE(stdlib_biggroup, TestTypes);

TYPED_TEST(stdlib_biggroup, validate_on_curve)
{
    BB_DISABLE_ASSERTS();
    // Goblin points do not implement validate on curve
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        using Builder = TestFixture::Builder;
        using element_ct = TestFixture::element_ct;
        using Fq = TestFixture::Curve::BaseField;
        using FqNative = TestFixture::Curve::BaseFieldNative;
        using GroupNative = TestFixture::Curve::GroupNative;

        Builder builder;
        auto [native_point, witness_point] = TestFixture::get_random_witness_point(&builder);

        // Valid point
        Fq expected_zero = witness_point.validate_on_curve("biggroup::validate_on_curve", false);
        expected_zero.assert_equal(Fq::zero());
        EXPECT_EQ(expected_zero.get_value(), static_cast<uint512_t>(FqNative::zero()));

        // Invalid point
        Fq random_x = Fq::from_witness(&builder, FqNative::random_element());
        Fq random_y = Fq::from_witness(&builder, FqNative::random_element());
        element_ct invalid_point(random_x, random_y, /*assert_on_curve*/ false);
        Fq expected_non_zero = invalid_point.validate_on_curve("biggroup::validate_on_curve", false);
        Fq expected_value = -random_y.sqr() + random_x.pow(3) + Fq(uint256_t(GroupNative::curve_b));
        if constexpr (GroupNative::has_a) {
            expected_value += random_x * Fq(uint256_t(GroupNative::curve_a));
        }
        expected_non_zero.assert_equal(expected_value);

        // Reduce the value to remove constants
        expected_non_zero.self_reduce();
        expected_value.self_reduce();
        EXPECT_EQ(expected_non_zero.get_value(), expected_value.get_value());

        TestFixture::EXPECT_CIRCUIT_CORRECTNESS(builder);

        // Check that the circuit fails if validate_on_curve is called with default parameters
        [[maybe_unused]] Fq _ = invalid_point.validate_on_curve();
        TestFixture::EXPECT_CIRCUIT_CORRECTNESS(builder, false);
    }
}

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
    TestFixture::test_add(InputType::WITNESS, InputType::CONSTANT);  // w + c
    TestFixture::test_add(InputType::CONSTANT, InputType::WITNESS);  // c + w
    TestFixture::test_add(InputType::CONSTANT, InputType::CONSTANT); // c + c
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
    TestFixture::test_sub(InputType::WITNESS, InputType::CONSTANT);  // w - c
    TestFixture::test_sub(InputType::CONSTANT, InputType::WITNESS);  // c - w
    TestFixture::test_sub(InputType::CONSTANT, InputType::CONSTANT); // c - c
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
    TestFixture::test_dbl(InputType::CONSTANT); // dbl(c)
}
TYPED_TEST(stdlib_biggroup, dbl_with_infinity)
{
    TestFixture::test_dbl_with_infinity();
}
TYPED_TEST(stdlib_biggroup, dbl_with_y_zero)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not support this edge case";
    } else {
        TestFixture::test_dbl_with_y_zero();
    }
}
TYPED_TEST(stdlib_biggroup, add_equals_dbl)
{
    TestFixture::test_add_equals_dbl();
}
TYPED_TEST(stdlib_biggroup, sub_neg_equals_double)
{
    TestFixture::test_sub_neg_equals_double();
}

// Test chain_add
HEAVY_TYPED_TEST(stdlib_biggroup, chain_add)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not implement chain_add function";
    } else {
        TestFixture::test_chain_add();
    };
}
HEAVY_TYPED_TEST(stdlib_biggroup, chain_add_with_constants)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not implement chain_add function";
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
        GTEST_SKIP() << "mega builder does not implement multiple_montgomery_ladder function";
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
    TestFixture::test_normalize(InputType::CONSTANT);
}

// Test reduce
TYPED_TEST(stdlib_biggroup, reduce)
{
    TestFixture::test_reduce();
}
TYPED_TEST(stdlib_biggroup, reduce_constant)
{
    TestFixture::test_reduce(InputType::CONSTANT);
}

// Test unary negation
TYPED_TEST(stdlib_biggroup, unary_negate)
{
    TestFixture::test_unary_negate(InputType::WITNESS);
}

TYPED_TEST(stdlib_biggroup, unary_negate_with_constants)
{
    TestFixture::test_unary_negate(InputType::CONSTANT);
}

// Test operator+=
TYPED_TEST(stdlib_biggroup, add_assign)
{
    TestFixture::test_add_assign(InputType::WITNESS, InputType::WITNESS);
}

TYPED_TEST(stdlib_biggroup, add_assign_with_constants)
{
    TestFixture::test_add_assign(InputType::WITNESS, InputType::CONSTANT); // w += c
    TestFixture::test_add_assign(InputType::CONSTANT, InputType::WITNESS); // c += w
}

// Test operator-=
TYPED_TEST(stdlib_biggroup, sub_assign)
{
    TestFixture::test_sub_assign(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, sub_assign_with_constants)
{
    TestFixture::test_sub_assign(InputType::WITNESS, InputType::CONSTANT); // w -= c
    TestFixture::test_sub_assign(InputType::CONSTANT, InputType::WITNESS); // c -= w
}
// Test checked_unconditional_add
TYPED_TEST(stdlib_biggroup, checked_unconditional_add)
{
    TestFixture::test_checked_unconditional_add(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_with_constants)
{
    TestFixture::test_checked_unconditional_add(InputType::WITNESS, InputType::CONSTANT);  // w + c
    TestFixture::test_checked_unconditional_add(InputType::CONSTANT, InputType::WITNESS);  // c + w
    TestFixture::test_checked_unconditional_add(InputType::CONSTANT, InputType::CONSTANT); // c + c
}
// Test checked_unconditional_subtract
TYPED_TEST(stdlib_biggroup, checked_unconditional_subtract)
{
    TestFixture::test_checked_unconditional_subtract(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_subtract_with_constants)
{
    TestFixture::test_checked_unconditional_subtract(InputType::WITNESS, InputType::CONSTANT);  // w - c
    TestFixture::test_checked_unconditional_subtract(InputType::CONSTANT, InputType::WITNESS);  // c - w
    TestFixture::test_checked_unconditional_subtract(InputType::CONSTANT, InputType::CONSTANT); // c - c
}
// Test checked_unconditional_add_sub
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_sub)
{
    TestFixture::test_checked_unconditional_add_sub();
}
TYPED_TEST(stdlib_biggroup, checked_unconditional_add_sub_with_constants)
{
    TestFixture::test_checked_unconditional_add_sub(InputType::WITNESS, InputType::CONSTANT);  // w, c
    TestFixture::test_checked_unconditional_add_sub(InputType::CONSTANT, InputType::WITNESS);  // c, w
    TestFixture::test_checked_unconditional_add_sub(InputType::CONSTANT, InputType::CONSTANT); // c, c
}
// Test conditional_negate
TYPED_TEST(stdlib_biggroup, conditional_negate)
{
    TestFixture::test_conditional_negate();
}
TYPED_TEST(stdlib_biggroup, conditional_negate_with_constants)
{
    TestFixture::test_conditional_negate(InputType::WITNESS, InputType::CONSTANT);  // w, c
    TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::WITNESS);  // c, w
    TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::CONSTANT); // c, c
}
// Test conditional_select
TYPED_TEST(stdlib_biggroup, conditional_select)
{
    TestFixture::test_conditional_select();
}
TYPED_TEST(stdlib_biggroup, conditional_select_with_constants)
{
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // w, w, c
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // w, c, w
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // w, c, c
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);   // c, w, w
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::CONSTANT, InputType::WITNESS);  // c, c, w
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);  // c, w, c
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // c, c, c
}
TYPED_TEST(stdlib_biggroup, incomplete_assert_equal)
{
    TestFixture::test_incomplete_assert_equal();
}
TYPED_TEST(stdlib_biggroup, incomplete_assert_equal_fails)
{
    TestFixture::test_incomplete_assert_equal_failure();
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; i++) {
            TestFixture::test_compute_naf();
        }
    } else {
        GTEST_SKIP() << "mega builder does not implement compute_naf function";
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf_zero)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        TestFixture::test_compute_naf_zero();
    } else {
        GTEST_SKIP() << "mega builder does not implement compute_naf function";
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf_overflow_lower_half)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        TestFixture::test_compute_naf_overflow_lower_half();
    } else {
        GTEST_SKIP() << "mega builder does not implement compute_naf function";
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf_top_bit_rejects_malicious_witness)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        TestFixture::test_compute_naf_top_bit_rejects_malicious_witness();
    } else {
        GTEST_SKIP() << "mega builder does not implement compute_naf function";
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, compute_naf_witness_value_independence)
{
    if constexpr (!HasGoblinBuilder<TypeParam>) {
        TestFixture::test_compute_naf_witness_value_independence();
    } else {
        GTEST_SKIP() << "mega builder does not implement compute_naf function";
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, mul)
{
    TestFixture::test_mul();
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_with_constants)
{
    TestFixture::test_mul(InputType::WITNESS, InputType::CONSTANT);  // w * c
    TestFixture::test_mul(InputType::CONSTANT, InputType::WITNESS);  // c * w
    TestFixture::test_mul(InputType::CONSTANT, InputType::CONSTANT); // c * c
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_edge_cases)
{
    TestFixture::test_mul_edge_cases();
}
HEAVY_TYPED_TEST(stdlib_biggroup, mul_edge_cases_with_constants)
{
    TestFixture::test_mul_edge_cases(InputType::WITNESS, InputType::CONSTANT);  // w * c
    TestFixture::test_mul_edge_cases(InputType::CONSTANT, InputType::WITNESS);  // c * w
    TestFixture::test_mul_edge_cases(InputType::CONSTANT, InputType::CONSTANT); // c * c
}

HEAVY_TYPED_TEST(stdlib_biggroup, short_scalar_mul_with_bit_lengths)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not implement scalar_mul function";
    } else {
        TestFixture::test_short_scalar_mul_with_bit_lengths();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, short_scalar_mul_infinity)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder does not implement scalar_mul function";
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
    TestFixture::test_helper_batch_mul({ InputType::WITNESS, InputType::CONSTANT },
                                       { InputType::CONSTANT, InputType::WITNESS });
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
    TestFixture::test_helper_batch_mul(
        { InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT },
        { InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT });
}

// 6 points - Base case only
HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_six)
{
    TestFixture::test_helper_batch_mul(6);
}

HEAVY_TYPED_TEST(stdlib_biggroup, twin_mul)
{
    TestFixture::test_twin_mul();
}

HEAVY_TYPED_TEST(stdlib_biggroup, twin_mul_with_infinity)
{
    TestFixture::test_twin_mul_with_infinity();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_linearly_dependent_generators)
{
    TestFixture::test_batch_mul_linearly_dependent_generators();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_linearly_dependent_generators_failure)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "this failure test is designed for ultra builder only";
    } else {
        TestFixture::test_batch_mul_linearly_dependent_generators_failure();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, offset_generator_infinity_is_rejected)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mask_points is only used on the ultra path";
    } else {
        TestFixture::test_offset_generator_infinity_is_rejected();
    }
}

HEAVY_TYPED_TEST(stdlib_biggroup, masked_point_infinity_is_rejected)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mask_points is only used on the ultra path";
    } else {
        TestFixture::test_masked_point_infinity_is_rejected();
    }
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
    TestFixture::test_batch_mul_edgecase_equivalence();
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

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_short_scalars_witness_value_independence)
{
    if constexpr (HasGoblinBuilder<TypeParam>) {
        GTEST_SKIP() << "mega builder uses goblin_element batch_mul; the witness-value partition is in the ultra path";
    } else {
        TestFixture::test_batch_mul_short_scalars_witness_value_independence();
    }
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
    TestFixture::test_batch_mul_mixed_constant_witness();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_large_number_of_points)
{
    TestFixture::test_batch_mul_large_number_of_points();
}

// Point at Infinity Edge Case Tests
TYPED_TEST(stdlib_biggroup, infinity_canonical_representation)
{
    TestFixture::test_infinity_canonical_representation();
}

TYPED_TEST(stdlib_biggroup, infinity_chained_operations)
{
    TestFixture::test_infinity_chained_operations();
}

TYPED_TEST(stdlib_biggroup, conditional_select_with_infinity)
{
    TestFixture::test_conditional_select_with_infinity();
}

TYPED_TEST(stdlib_biggroup, conditional_negate_with_infinity)
{
    TestFixture::test_conditional_negate_with_infinity();
}

TYPED_TEST(stdlib_biggroup, get_standard_form_normalizes_infinity)
{
    TestFixture::test_get_standard_form_normalizes_infinity();
}

TYPED_TEST(stdlib_biggroup, infinity_auto_detection_in_constructor)
{
    TestFixture::test_infinity_auto_detection_in_constructor();
}

HEAVY_TYPED_TEST(stdlib_biggroup, scalar_mul_infinity_edge_cases)
{
    TestFixture::test_scalar_mul_infinity_edge_cases();
}

HEAVY_TYPED_TEST(stdlib_biggroup, batch_mul_complete_cancellation)
{
    TestFixture::test_batch_mul_complete_cancellation();
}

TYPED_TEST(stdlib_biggroup, add_constant_infinity)
{
    TestFixture::test_add_constant_infinity();
}

TYPED_TEST(stdlib_biggroup, witness_infinity_from_operations)
{
    TestFixture::test_witness_infinity_from_operations();
}

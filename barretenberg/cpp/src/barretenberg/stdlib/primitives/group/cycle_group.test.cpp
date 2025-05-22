#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Builder = TypeParam;                                                                                         \
    using cycle_group_ct = stdlib::cycle_group<Builder>;                                                               \
    using Curve = typename stdlib::cycle_group<Builder>::Curve;                                                        \
    using Element = typename Curve::Element;                                                                           \
    using AffineElement = typename Curve::AffineElement;                                                               \
    using Group = typename Curve::Group;                                                                               \
    using bool_ct = stdlib::bool_t<Builder>;                                                                           \
    using witness_ct = stdlib::witness_t<Builder>;                                                                     \
    using cycle_scalar_ct = cycle_group_ct::cycle_scalar;

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-local-typedefs"

template <class Builder> class CycleGroupTest : public ::testing::Test {
  public:
    using Curve = typename stdlib::cycle_group<Builder>::Curve;
    using Group = typename Curve::Group;

    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    static constexpr size_t num_generators = 110;
    static inline std::array<AffineElement, num_generators> generators{};

    static void SetUpTestSuite()
    {

        for (size_t i = 0; i < num_generators; ++i) {
            generators[i] = Group::one * Curve::ScalarField::random_element(&engine);
        }
    };
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;
TYPED_TEST_SUITE(CycleGroupTest, CircuitTypes);

STANDARD_TESTING_TAGS
/**
 * @brief Check basic tag interactions
 *
 */
TYPED_TEST(CycleGroupTest, TestBasicTagLogic)
{
    STDLIB_TYPE_ALIASES
    Builder builder;

    auto lhs = TestFixture::generators[0];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    // Set the whole tag first
    a.set_origin_tag(next_challenge_tag);
    // Set tags of x an y
    a.x.set_origin_tag(submitted_value_origin_tag);
    a.y.set_origin_tag(challenge_origin_tag);

    // The tag of the _is_point_at_infinity member should stay as next_challenge_tag, so the whole thing should be the
    // union of all 3

    EXPECT_EQ(a.get_origin_tag(), first_second_third_merged_tag);

#ifndef NDEBUG
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, TestFixture::generators[1]);
    b.x.set_origin_tag(instant_death_tag);
    // Even requesting the tag of the whole structure can cause instant death
    EXPECT_THROW(b.get_origin_tag(), std::runtime_error);
#endif
}

/**
 * @brief Checks that a point at infinity passes the constant_witness initialization
 *
 */
TYPED_TEST(CycleGroupTest, TestInfConstantWintnessRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0] * 0;
    cycle_group_ct a = cycle_group_ct::from_constant_witness(&builder, lhs);
    (void)a;
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that a point at infinity passes the witness initialization
 *
 */
TYPED_TEST(CycleGroupTest, TestInfWintnessRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0] * 0;
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    (void)a;
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that the result of adding two witness values is not constant
 *
 */
TYPED_TEST(CycleGroupTest, TestWitnessSumRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    cycle_group_ct c = a + b;
    EXPECT_FALSE(c.is_constant());
    c = a - b;
    EXPECT_FALSE(c.is_constant());
}

/**
 * @brief Checks that adding operator-(value) to an existing value does not result into error
 *
 */
TYPED_TEST(CycleGroupTest, TestOperatorNegRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    b = -b;
    cycle_group_ct c = a.unconditional_add(b);
    (void)c;
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Checks the mixup bad behavior found by fuzzer.
 *
 */
TYPED_TEST(CycleGroupTest, TestConstantWitnessMixupRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto c1 = cycle_group_ct(AffineElement::one());
    auto cw8 = cycle_group_ct::from_constant_witness(&builder, AffineElement::one() * 0);
    auto w11 = cycle_group_ct::from_witness(&builder, TestFixture::generators[0]);

    auto w9 = cw8 + c1;  // mixup happens here due to _is_infinity being a constant
    auto w26 = w9 + w11; // and here the circuit checker crashes

    auto w10 = cw8 - c1;
    auto w27 = w10 - w11; // and here
    (void)w26;
    (void)w27;
    EXPECT_NO_THROW(CircuitChecker::check(builder)); // It won't be a throw anyway
}

/**
 * @brief Checks the bad behavior of conditional assign.
 *
 */
TYPED_TEST(CycleGroupTest, TestConditionalAssignRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto c0 = cycle_group_ct(AffineElement::one() * 0);
    auto c1 = cycle_group_ct::conditional_assign(bool_ct(witness_ct(&builder, false)), c0, c0);
    auto w3 = c1.dbl();
    (void)w3;
    EXPECT_NO_THROW(CircuitChecker::check(builder)); // It won't be a throw anyway
}

/**
 * @brief Checks the bad behavior of conditional assign.
 *
 */
TYPED_TEST(CycleGroupTest, TestConditionalAssignSuperMixupRegression)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto c0 = cycle_group_ct(TestFixture::generators[0]);
    auto c1 = cycle_group_ct(-TestFixture::generators[0]);
    auto w2 = cycle_group_ct::conditional_assign(bool_ct(witness_ct(&builder, true)), c0, c1);
    EXPECT_FALSE(w2.x.is_constant());
    EXPECT_FALSE(w2.y.is_constant());
    EXPECT_TRUE(w2.is_point_at_infinity().is_constant());
    auto w3 = w2.dbl();
    (void)w3;
    EXPECT_NO_THROW(CircuitChecker::check(builder)); // It won't be a throw anyway
}

/**
 * @brief Checks that a point on the curve passes the validate_is_on_curve check
 *
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveSucceed)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    a.validate_is_on_curve();
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that a point that is not on the curve but marked as the point at infinity passes the
 * validate_is_on_curve check
 * @details Should pass since marking it with _is_infinity=true makes whatever other point data invalid.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveInfinitySucceed)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/true); // marks this point as the point at infinity
    a.validate_is_on_curve();
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that a point that is not on the curve but *not* marked as the point at infinity fails the
 * validate_is_on_curve check
 * @details (1, 1) is not on the either the Grumpkin curve or the BN254 curve.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveFail)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/false);
    a.validate_is_on_curve();
    EXPECT_TRUE(builder.failed());
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that a point that is not on the curve but *not* marked as the point at infinity fails the
 * validate_is_on_curve check
 * @details (1, 1) is not on the either the Grumpkin curve or the BN254 curve.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveFail2)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/bool_ct(witness_ct(&builder, false)));
    a.validate_is_on_curve();
    EXPECT_TRUE(builder.failed());
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TYPED_TEST(CycleGroupTest, TestStandardForm)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    cycle_group_ct input_a = cycle_group_ct::from_witness(&builder, Element::random_element());
    cycle_group_ct input_b = cycle_group_ct::from_witness(&builder, Element::random_element());
    cycle_group_ct input_c = cycle_group_ct(Element::random_element());
    cycle_group_ct input_d = cycle_group_ct(Element::random_element());

    input_b.set_point_at_infinity(true);
    input_d.set_point_at_infinity(true);

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);
    cycle_group_ct input_e = cycle_group_ct(x, y, true);
    cycle_group_ct input_f = cycle_group_ct(x, y, bool_ct(witness_ct(&builder, true)));

    // Assign different tags to all inputs
    input_a.set_origin_tag(submitted_value_origin_tag);
    input_b.set_origin_tag(challenge_origin_tag);
    input_c.set_origin_tag(next_challenge_tag);
    input_d.set_origin_tag(first_two_merged_tag);

    auto standard_a = input_a.get_standard_form();
    auto standard_b = input_b.get_standard_form();
    auto standard_c = input_c.get_standard_form();
    auto standard_d = input_d.get_standard_form();
    auto standard_e = input_e.get_standard_form();
    auto standard_f = input_f.get_standard_form();

    EXPECT_EQ(standard_a.is_point_at_infinity().get_value(), false);
    EXPECT_EQ(standard_b.is_point_at_infinity().get_value(), true);
    EXPECT_EQ(standard_c.is_point_at_infinity().get_value(), false);
    EXPECT_EQ(standard_d.is_point_at_infinity().get_value(), true);
    EXPECT_EQ(standard_e.is_point_at_infinity().get_value(), true);
    EXPECT_EQ(standard_f.is_point_at_infinity().get_value(), true);

    // Ensure that the tags in the standard form remain the same
    EXPECT_EQ(standard_a.get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(standard_b.get_origin_tag(), challenge_origin_tag);
    EXPECT_EQ(standard_c.get_origin_tag(), next_challenge_tag);
    EXPECT_EQ(standard_d.get_origin_tag(), first_two_merged_tag);

    auto input_a_x = input_a.x.get_value();
    auto input_a_y = input_a.y.get_value();
    auto input_c_x = input_c.x.get_value();
    auto input_c_y = input_c.y.get_value();

    auto standard_a_x = standard_a.x.get_value();
    auto standard_a_y = standard_a.y.get_value();

    auto standard_b_x = standard_b.x.get_value();
    auto standard_b_y = standard_b.y.get_value();

    auto standard_c_x = standard_c.x.get_value();
    auto standard_c_y = standard_c.y.get_value();

    auto standard_d_x = standard_d.x.get_value();
    auto standard_d_y = standard_d.y.get_value();

    auto standard_e_x = standard_e.x.get_value();
    auto standard_e_y = standard_e.y.get_value();

    auto standard_f_x = standard_f.x.get_value();
    auto standard_f_y = standard_f.y.get_value();

    EXPECT_EQ(input_a_x, standard_a_x);
    EXPECT_EQ(input_a_y, standard_a_y);
    EXPECT_EQ(standard_b_x, 0);
    EXPECT_EQ(standard_b_y, 0);
    EXPECT_EQ(input_c_x, standard_c_x);
    EXPECT_EQ(input_c_y, standard_c_y);
    EXPECT_EQ(standard_d_x, 0);
    EXPECT_EQ(standard_d_y, 0);
    EXPECT_EQ(standard_e_x, 0);
    EXPECT_EQ(standard_e_y, 0);
    EXPECT_EQ(standard_f_x, 0);
    EXPECT_EQ(standard_f_y, 0);

    EXPECT_TRUE(CircuitChecker::check(builder));
}
TYPED_TEST(CycleGroupTest, TestDbl)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct(lhs);
    // Assign two different tags
    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);
    cycle_group_ct c;
    cycle_group_ct d;
    std::cout << "pre = " << builder.get_estimated_num_finalized_gates() << std::endl;
    for (size_t i = 0; i < 3; ++i) {
        c = a.dbl();
    }
    std::cout << "post = " << builder.get_estimated_num_finalized_gates() << std::endl;
    d = b.dbl();
    AffineElement expected(Element(lhs).dbl());
    AffineElement result = c.get_value();
    EXPECT_EQ(result, expected);
    EXPECT_EQ(d.get_value(), expected);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);

    // Ensure the tags stay the same after doubling
    EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(d.get_origin_tag(), challenge_origin_tag);
}

TYPED_TEST(CycleGroupTest, TestUnconditionalAdd)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto add =
        [&](const AffineElement& lhs, const AffineElement& rhs, const bool lhs_constant, const bool rhs_constant) {
            cycle_group_ct a = lhs_constant ? cycle_group_ct(lhs) : cycle_group_ct::from_witness(&builder, lhs);
            cycle_group_ct b = rhs_constant ? cycle_group_ct(rhs) : cycle_group_ct::from_witness(&builder, rhs);
            // Assign two different tags
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            cycle_group_ct c = a.unconditional_add(b);
            AffineElement expected(Element(lhs) + Element(rhs));
            AffineElement result = c.get_value();
            EXPECT_EQ(result, expected);
            // Ensure the tags in the result are merged
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
        };

    add(TestFixture::generators[0], TestFixture::generators[1], false, false);
    add(TestFixture::generators[0], TestFixture::generators[1], false, true);
    add(TestFixture::generators[0], TestFixture::generators[1], true, false);
    add(TestFixture::generators[0], TestFixture::generators[1], true, true);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalAddSucceed)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];

    // case 1. valid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    cycle_group_ct c = a.checked_unconditional_add(b);
    AffineElement expected(Element(lhs) + Element(rhs));
    AffineElement result = c.get_value();
    EXPECT_EQ(result, expected);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalAddFail)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[0]; // ruh roh

    // case 2. invalid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    a.checked_unconditional_add(b);

    EXPECT_TRUE(builder.failed());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestAdd)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&builder, rhs);
    point_at_infinity.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));

    // case 1. no edge-cases triggered
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
        // Here and in the following cases we assign two different tags
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);
        cycle_group_ct c = a + b;
        AffineElement expected(Element(lhs) + Element(rhs));
        AffineElement result = c.get_value();
        EXPECT_EQ(result, expected);
        // We expect the tags to be merged in the result
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 2. lhs is point at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a + b;
        AffineElement result = c.get_value();
        EXPECT_EQ(result, rhs);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 3. rhs is point at infinity
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = point_at_infinity;
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a + b;
        AffineElement result = c.get_value();
        EXPECT_EQ(result, lhs);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 4. both points are at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = point_at_infinity;
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a + b;
        EXPECT_TRUE(c.is_point_at_infinity().get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 5. lhs = -rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, -lhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a + b;
        EXPECT_TRUE(c.is_point_at_infinity().get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 6. lhs = rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, lhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a + b;
        AffineElement expected((Element(lhs)).dbl());
        AffineElement result = c.get_value();
        EXPECT_EQ(result, expected);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestUnconditionalSubtract)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto subtract =
        [&](const AffineElement& lhs, const AffineElement& rhs, const bool lhs_constant, const bool rhs_constant) {
            cycle_group_ct a = lhs_constant ? cycle_group_ct(lhs) : cycle_group_ct::from_witness(&builder, lhs);
            cycle_group_ct b = rhs_constant ? cycle_group_ct(rhs) : cycle_group_ct::from_witness(&builder, rhs);
            // Assign two different tags
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);

            cycle_group_ct c = a.unconditional_subtract(b);
            AffineElement expected(Element(lhs) - Element(rhs));
            AffineElement result = c.get_value();
            EXPECT_EQ(result, expected);
            // Expect tags to be merged in the result
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
        };

    subtract(TestFixture::generators[0], TestFixture::generators[1], false, false);
    subtract(TestFixture::generators[0], TestFixture::generators[1], false, true);
    subtract(TestFixture::generators[0], TestFixture::generators[1], true, false);
    subtract(TestFixture::generators[0], TestFixture::generators[1], true, true);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalSubtractSucceed)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];

    // case 1. valid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    cycle_group_ct c = a.checked_unconditional_subtract(b);
    AffineElement expected(Element(lhs) - Element(rhs));
    AffineElement result = c.get_value();
    EXPECT_EQ(result, expected);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalSubtractFail)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[0]; // ruh roh

    // case 2. invalid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
    a.checked_unconditional_subtract(b);

    EXPECT_TRUE(builder.failed());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestSubtract)
{
    STDLIB_TYPE_ALIASES;
    using bool_ct = stdlib::bool_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&builder, rhs);
    point_at_infinity.set_point_at_infinity(bool_ct(witness_ct(&builder, true)));

    // case 1. no edge-cases triggered
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
        // Here and in the following cases we set 2 different tags to a and b
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        AffineElement expected(Element(lhs) - Element(rhs));
        AffineElement result = c.get_value();
        EXPECT_EQ(result, expected);
        // We expect the tag of the result to be the union of a and b tags
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 2. lhs is point at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        AffineElement result = c.get_value();
        EXPECT_EQ(result, -rhs);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 3. rhs is point at infinity
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = point_at_infinity;
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        AffineElement result = c.get_value();
        EXPECT_EQ(result, lhs);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 4. both points are at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = point_at_infinity;
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        EXPECT_TRUE(c.is_point_at_infinity().get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 5. lhs = -rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, -lhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        AffineElement expected((Element(lhs)).dbl());
        AffineElement result = c.get_value();
        EXPECT_EQ(result, expected);
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    // case 6. lhs = rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, lhs);
        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        cycle_group_ct c = a - b;
        EXPECT_TRUE(c.is_point_at_infinity().get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestBatchMul)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    const size_t num_muls = 1;
    /**
     * @brief Assign different tags to all points and scalars and return the union of that tag
     *
     *@details We assign the tags with the same round index to a (point,scalar) pair, but the point is treated as
     *submitted value, while scalar as a challenge. Merging these tags should not run into any edgecases
     */
    auto assign_and_merge_tags = [](auto& points, auto& scalars) {
        OriginTag merged_tag;
        for (size_t i = 0; i < points.size(); i++) {
            const auto point_tag = OriginTag(/*parent_index=*/0, /*round_index=*/i, /*is_submitted=*/true);
            const auto scalar_tag = OriginTag(/*parent_index=*/0, /*round_index=*/i, /*is_submitted=*/false);

            merged_tag = OriginTag(merged_tag, OriginTag(point_tag, scalar_tag));
            points[i].set_origin_tag(point_tag);
            scalars[i].set_origin_tag(scalar_tag);
        }
        return merged_tag;
    };
    // case 1, general MSM with inputs that are combinations of constant and witnesses
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;
        Element expected = Group::point_at_infinity;

        for (size_t i = 0; i < num_muls; ++i) {
            auto element = TestFixture::generators[i];
            typename Group::Fr scalar = Group::Fr::random_element(&engine);

            // 1: add entry where point, scalar are witnesses
            expected += (element * scalar);
            points.emplace_back(cycle_group_ct::from_witness(&builder, element));
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

            // 2: add entry where point is constant, scalar is witness
            expected += (element * scalar);
            points.emplace_back(cycle_group_ct(element));
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

            // 3: add entry where point is witness, scalar is constant
            expected += (element * scalar);
            points.emplace_back(cycle_group_ct::from_witness(&builder, element));
            scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));

            // 4: add entry where point is constant, scalar is constant
            expected += (element * scalar);
            points.emplace_back(cycle_group_ct(element));
            scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));
        }

        // Here and in the following cases assign different tags to points and scalars and get the union of them back
        const auto expected_tag = assign_and_merge_tags(points, scalars);

        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_EQ(result.get_value(), AffineElement(expected));
        // The tag should the union of all tags
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 2, MSM that produces point at infinity
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;

        auto element = TestFixture::generators[0];
        typename Group::Fr scalar = Group::Fr::random_element(&engine);
        points.emplace_back(cycle_group_ct::from_witness(&builder, element));
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

        points.emplace_back(cycle_group_ct::from_witness(&builder, element));
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, -scalar));

        const auto expected_tag = assign_and_merge_tags(points, scalars);

        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_TRUE(result.is_point_at_infinity().get_value());

        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 3. Multiply by zero
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;

        auto element = TestFixture::generators[0];
        typename Group::Fr scalar = 0;
        points.emplace_back(cycle_group_ct::from_witness(&builder, element));
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

        const auto expected_tag = assign_and_merge_tags(points, scalars);
        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 4. Inputs are points at infinity
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;

        auto element = TestFixture::generators[0];
        typename Group::Fr scalar = Group::Fr::random_element(&engine);

        // is_infinity = witness
        {
            cycle_group_ct point = cycle_group_ct::from_witness(&builder, element);
            point.set_point_at_infinity(witness_ct(&builder, true));
            points.emplace_back(point);
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
        }
        // is_infinity = constant
        {
            cycle_group_ct point = cycle_group_ct::from_witness(&builder, element);
            point.set_point_at_infinity(true);
            points.emplace_back(point);
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
        }

        const auto expected_tag = assign_and_merge_tags(points, scalars);
        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 5, fixed-base MSM with inputs that are combinations of constant and witnesses (group elements are in
    // lookup table)
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;
        std::vector<typename Group::Fq> scalars_native;
        Element expected = Group::point_at_infinity;
        for (size_t i = 0; i < num_muls; ++i) {
            auto element = plookup::fixed_base::table::lhs_generator_point();
            typename Group::Fr scalar = Group::Fr::random_element(&engine);

            // 1: add entry where point is constant, scalar is witness
            expected += (element * scalar);
            points.emplace_back(element);
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
            scalars_native.emplace_back(uint256_t(scalar));

            // 2: add entry where point is constant, scalar is constant
            element = plookup::fixed_base::table::rhs_generator_point();
            expected += (element * scalar);
            points.emplace_back(element);
            scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));
            scalars_native.emplace_back(uint256_t(scalar));
        }
        const auto expected_tag = assign_and_merge_tags(points, scalars);
        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_EQ(result.get_value(), AffineElement(expected));
        EXPECT_EQ(result.get_value(), crypto::pedersen_commitment::commit_native(scalars_native));
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 6, fixed-base MSM with inputs that are combinations of constant and witnesses (some group elements are
    // in lookup table)
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;
        std::vector<typename Group::Fr> scalars_native;
        Element expected = Group::point_at_infinity;
        for (size_t i = 0; i < num_muls; ++i) {
            auto element = plookup::fixed_base::table::lhs_generator_point();
            typename Group::Fr scalar = Group::Fr::random_element(&engine);

            // 1: add entry where point is constant, scalar is witness
            expected += (element * scalar);
            points.emplace_back(element);
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
            scalars_native.emplace_back(scalar);

            // 2: add entry where point is constant, scalar is constant
            element = plookup::fixed_base::table::rhs_generator_point();
            expected += (element * scalar);
            points.emplace_back(element);
            scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));
            scalars_native.emplace_back(scalar);

            // // 3: add entry where point is constant, scalar is witness
            scalar = Group::Fr::random_element(&engine);
            element = Group::one * Group::Fr::random_element(&engine);
            expected += (element * scalar);
            points.emplace_back(element);
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
            scalars_native.emplace_back(scalar);
        }
        const auto expected_tag = assign_and_merge_tags(points, scalars);
        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_EQ(result.get_value(), AffineElement(expected));
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    // case 7, Fixed-base MSM where input scalars are 0
    {
        std::vector<cycle_group_ct> points;
        std::vector<typename cycle_group_ct::cycle_scalar> scalars;

        for (size_t i = 0; i < num_muls; ++i) {
            auto element = plookup::fixed_base::table::lhs_generator_point();
            typename Group::Fr scalar = 0;

            // 1: add entry where point is constant, scalar is witness
            points.emplace_back((element));
            scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

            // // 2: add entry where point is constant, scalar is constant
            points.emplace_back((element));
            scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));
        }
        const auto expected_tag = assign_and_merge_tags(points, scalars);
        auto result = cycle_group_ct::batch_mul(points, scalars);
        EXPECT_EQ(result.is_point_at_infinity().get_value(), true);
        EXPECT_EQ(result.get_origin_tag(), expected_tag);
    }

    bool check_result = CircuitChecker::check(builder);
    EXPECT_EQ(check_result, true);
}

TYPED_TEST(CycleGroupTest, TestMul)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    const size_t num_muls = 5;

    // case 1, general MSM with inputs that are combinations of constant and witnesses
    {
        cycle_group_ct point;
        typename cycle_group_ct::cycle_scalar scalar;
        cycle_group_ct result;
        for (size_t i = 0; i < num_muls; ++i) {
            auto element = TestFixture::generators[i];
            typename Group::Fr native_scalar = Group::Fr::random_element(&engine);
            auto expected_result = element * native_scalar;

            // 1: add entry where point, scalar are witnesses
            point = (cycle_group_ct::from_witness(&builder, element));
            scalar = (cycle_group_ct::cycle_scalar::from_witness(&builder, native_scalar));
            point.set_origin_tag(submitted_value_origin_tag);
            scalar.set_origin_tag(challenge_origin_tag);
            result = point * scalar;

            EXPECT_EQ((result).get_value(), (expected_result));

            // 2: add entry where point is constant, scalar is witness
            point = (cycle_group_ct(element));
            scalar = (cycle_group_ct::cycle_scalar::from_witness(&builder, native_scalar));

            EXPECT_EQ((result).get_value(), (expected_result));

            // 3: add entry where point is witness, scalar is constant
            point = (cycle_group_ct::from_witness(&builder, element));
            EXPECT_EQ((result).get_value(), (expected_result));

            // 4: add entry where point is constant, scalar is constant
            point = (cycle_group_ct(element));
            EXPECT_EQ((result).get_value(), (expected_result));
        }
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestOne)
{
    STDLIB_TYPE_ALIASES
    Builder builder;
    cycle_group_ct one = cycle_group_ct::one(&builder);
    auto expected_one_native = Group::one;
    auto one_native = one.get_value();
    EXPECT_EQ(one_native.x, expected_one_native.x);
    EXPECT_EQ(one_native.y, expected_one_native.y);
}

/**
 * @brief Ensures naive conversion from a bigfield representation of bb::fq (Grumpkin::ScalarField) to cycle_scalar
 * preserves the same value until we implement a smarter function.
 *
 */
TYPED_TEST(CycleGroupTest, TestConversionFromBigfield)
{
    STDLIB_TYPE_ALIASES
    using FF = typename Curve::ScalarField;
    using FF_ct = stdlib::bigfield<Builder, typename FF::Params>;

    const auto run_test = [](bool construct_witnesses) {
        Builder builder;
        auto elt = FF::random_element(&engine);
        FF_ct big_elt;
        if (construct_witnesses) {
            big_elt = FF_ct::from_witness(&builder, elt);
        } else {
            big_elt = FF_ct(elt);
        }
        big_elt.set_origin_tag(submitted_value_origin_tag);
        cycle_scalar_ct scalar_from_big_elt(big_elt);
        EXPECT_EQ(elt, scalar_from_big_elt.get_value());
        EXPECT_EQ(scalar_from_big_elt.get_origin_tag(), big_elt.get_origin_tag());
        if (construct_witnesses) {
            EXPECT_FALSE(big_elt.is_constant());
            EXPECT_FALSE(scalar_from_big_elt.is_constant());
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    };
    run_test(/*construct_witnesses=*/true);
    run_test(/*construct_witnesses=*/false);
}

TYPED_TEST(CycleGroupTest, TestBatchMulIsConsistent)
{
    STDLIB_TYPE_ALIASES
    using FF = typename Curve::ScalarField;
    using FF_ct = stdlib::bigfield<Builder, typename FF::Params>;

    const auto run_test = [](bool construct_witnesses) {
        Builder builder;
        auto scalar1 = FF::random_element(&engine);
        auto scalar2 = FF::random_element(&engine);

        FF_ct big_scalar1;
        FF_ct big_scalar2;
        if (construct_witnesses) {
            big_scalar1 = FF_ct::from_witness(&builder, scalar1);
            big_scalar2 = FF_ct::from_witness(&builder, scalar2);
        } else {
            big_scalar1 = FF_ct(scalar1);
            big_scalar2 = FF_ct(scalar2);
        }
        cycle_group_ct result1 = cycle_group_ct::batch_mul({ TestFixture::generators[0], TestFixture::generators[1] },
                                                           { big_scalar1, big_scalar2 });

        cycle_group_ct result2 =
            cycle_group_ct::batch_mul({ TestFixture::generators[0], TestFixture::generators[1] },
                                      { cycle_scalar_ct(big_scalar1), cycle_scalar_ct(big_scalar2) });

        AffineElement result1_native = result1.get_value();
        AffineElement result2_native = result2.get_value();
        EXPECT_EQ(result1_native.x, result2_native.x);
        EXPECT_EQ(result1_native.y, result2_native.y);
        if (construct_witnesses) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1020): Re-enable these.
            // EXPECT_FALSE(result1.is_constant());
            // EXPECT_FALSE(result2.is_constant());
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    };
    run_test(/*construct_witnesses=*/true);
    run_test(/*construct_witnesses=*/false);
}
#pragma GCC diagnostic pop

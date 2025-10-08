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

// Utility function for gate count checking and circuit verification
template <typename Builder> void check_circuit_and_gates(Builder& builder, uint32_t expected_gates)
{
    if (!builder.circuit_finalized) {
        builder.finalize_circuit(/*ensure_nonzero=*/false);
    }
    // Ultra builder always creates 1 gate for the zero constant (this->zero_idx = put_constant_variable(FF::zero()))
    // We subtract this off to get a more meaningful gate count for the actual operations
    uint32_t actual_gates = static_cast<uint32_t>(builder.get_num_finalized_gates()) - 1;
    EXPECT_EQ(actual_gates, expected_gates)
        << "Gate count changed! Expected: " << expected_gates << ", Actual: " << actual_gates;
    EXPECT_TRUE(CircuitChecker::check(builder));
}

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
    check_circuit_and_gates(builder, 0);
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
    check_circuit_and_gates(builder, 6);
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
    check_circuit_and_gates(builder, 15);
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
    check_circuit_and_gates(builder, 41);
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
    check_circuit_and_gates(builder, 1);
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
    check_circuit_and_gates(builder, 5);
}

/**
 * @brief Checks that a point on the curve passes the validate_on_curve check
 *
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveSucceed)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto lhs = TestFixture::generators[0];
    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    a.validate_on_curve();
    EXPECT_FALSE(builder.failed());
    check_circuit_and_gates(builder, 11);
}

/**
 * @brief Checks that a point that is not on the curve but marked as the point at infinity passes the
 * validate_on_curve check
 * @details Should pass since marking it with _is_infinity=true makes whatever other point data invalid.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveInfinitySucceed)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/true); // marks this point as the point at infinity
    a.validate_on_curve();
    EXPECT_FALSE(builder.failed());
    check_circuit_and_gates(builder, 0);
}

/**
 * @brief Checks that a point that is not on the curve but *not* marked as the point at infinity fails the
 * validate_on_curve check
 * @details (1, 1) is not on the either the Grumpkin curve or the BN254 curve.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveFail)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/false);
    a.validate_on_curve();
    EXPECT_TRUE(builder.failed());
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Checks that a point that is not on the curve but *not* marked as the point at infinity fails the
 * validate_on_curve check
 * @details (1, 1) is not on the either the Grumpkin curve or the BN254 curve.
 */
TYPED_TEST(CycleGroupTest, TestValidateOnCurveFail2)
{
    STDLIB_TYPE_ALIASES;
    Builder builder;

    auto x = stdlib::field_t<Builder>::from_witness(&builder, 1);
    auto y = stdlib::field_t<Builder>::from_witness(&builder, 1);

    cycle_group_ct a(x, y, /*_is_infinity=*/bool_ct(witness_ct(&builder, false)));
    a.validate_on_curve();
    EXPECT_TRUE(builder.failed());
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TYPED_TEST(CycleGroupTest, TestStandardForm)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto affine_infinity = cycle_group_ct::AffineElement::infinity();
    cycle_group_ct input_a = cycle_group_ct::from_witness(&builder, Element::random_element());
    cycle_group_ct input_b = cycle_group_ct::from_witness(&builder, affine_infinity);
    cycle_group_ct input_c = cycle_group_ct(Element::random_element());
    cycle_group_ct input_d = cycle_group_ct(affine_infinity);

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

    check_circuit_and_gates(builder, 15);
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
    for (size_t i = 0; i < 3; ++i) {
        c = a.dbl();
    }
    d = b.dbl();
    AffineElement expected(Element(lhs).dbl());
    AffineElement result = c.get_value();
    EXPECT_EQ(result, expected);
    EXPECT_EQ(d.get_value(), expected);

    check_circuit_and_gates(builder, 15);

    // Ensure the tags stay the same after doubling
    EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(d.get_origin_tag(), challenge_origin_tag);
}

TYPED_TEST(CycleGroupTest, TestDblNonConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Witness point WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);

        Element doubled_element = Element(lhs).dbl();
        AffineElement hint(doubled_element);

        cycle_group_ct result = a.dbl(hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 9);
    }

    // Test case 2: Witness point WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[1];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);

        cycle_group_ct result = a.dbl();

        Element expected_element = Element(lhs).dbl();
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        // Note: same gate count as with hint - hint is a witness generation optimization only
        check_circuit_and_gates(builder, 9);
    }

    // Test case 3: Witness infinity point WITHOUT hint
    {
        auto builder = Builder();
        AffineElement infinity_element;
        infinity_element.self_set_infinity();

        cycle_group_ct infinity = cycle_group_ct::from_witness(&builder, infinity_element);

        cycle_group_ct result = infinity.dbl();

        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        // Note: from_witness sets x,y to witness(0,0) for infinity points
        // After doubling, y becomes -1 (0x3064...) due to the modified_y logic
        EXPECT_EQ(result.x.get_value(), 0);

        // Same gate count as regular witness points
        check_circuit_and_gates(builder, 9);
    }
}

TYPED_TEST(CycleGroupTest, TestDblConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Constant point WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        cycle_group_ct a(lhs);

        Element doubled_element = Element(lhs).dbl();
        AffineElement hint(doubled_element);

        cycle_group_ct result = a.dbl(hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }

    // Test case 2: Constant point WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[1];
        cycle_group_ct a(lhs);

        cycle_group_ct result = a.dbl();

        Element expected_element = Element(lhs).dbl();
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }

    // Test case 3: Constant infinity point WITHOUT hint
    {
        auto builder = Builder();
        cycle_group_ct infinity = cycle_group_ct::constant_infinity(nullptr);

        cycle_group_ct result = infinity.dbl();

        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_TRUE(result.is_constant());
        EXPECT_EQ(result.x.get_value(), 0);
        EXPECT_EQ(result.y.get_value(), 0);

        check_circuit_and_gates(builder, 0);
    }

    // Test case 4: Constant infinity point WITH hint
    {
        auto builder = Builder();
        cycle_group_ct infinity = cycle_group_ct::constant_infinity(nullptr);

        AffineElement hint;
        hint.self_set_infinity();

        cycle_group_ct result = infinity.dbl(hint);

        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_TRUE(result.is_constant());
        EXPECT_EQ(result.x.get_value(), 0);
        EXPECT_EQ(result.y.get_value(), 0);

        check_circuit_and_gates(builder, 0);
    }
}

TYPED_TEST(CycleGroupTest, TestDblMixedConstantWitness)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    // Test doubling where x is constant but y is witness (edge case)
    // This currently fails due to implementation issues with mixed constant/witness points
    // TODO: Fix the implementation to handle this case properly

    auto point = TestFixture::generators[1];
    auto x = stdlib::field_t<Builder>(&builder, point.x);             // constant
    auto y = stdlib::field_t<Builder>(witness_ct(&builder, point.y)); // witness
    cycle_group_ct a(x, y, false);

    // Currently this crashes with an assertion error about invalid variable_index
    // The issue is that when we have mixed constant/witness coordinates, the dbl()
    // implementation tries to access witness indices that don't exist for constants

    EXPECT_THROW(
        { [[maybe_unused]] cycle_group_ct result = a.dbl(); },
        std::exception // Expect exception from assertion failure
    );
}

TYPED_TEST(CycleGroupTest, TestUnconditionalAddNonConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Two witness points WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

        cycle_group_ct result = a.unconditional_add(b);

        Element expected_element = Element(lhs) + Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 14);
    }

    // Test case 2: Two witness points WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[2];
        auto rhs = TestFixture::generators[3];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

        Element sum_element = Element(lhs) + Element(rhs);
        AffineElement hint(sum_element);

        cycle_group_ct result = a.unconditional_add(b, hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 14);
    }

    // Test case 3: Mixed witness and constant points
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b(rhs); // constant

        cycle_group_ct result = a.unconditional_add(b);

        Element expected_element = Element(lhs) + Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 10);
    }
}

TYPED_TEST(CycleGroupTest, TestUnconditionalAddConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Two constant points WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        cycle_group_ct result = a.unconditional_add(b);

        Element expected_element = Element(lhs) + Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }

    // Test case 2: Two constant points WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[2];
        auto rhs = TestFixture::generators[3];
        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        Element sum_element = Element(lhs) + Element(rhs);
        AffineElement hint(sum_element);

        cycle_group_ct result = a.unconditional_add(b, hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }
}

TYPED_TEST(CycleGroupTest, TestUnconditionalSubtractNonConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Two witness points WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

        cycle_group_ct result = a.unconditional_subtract(b);

        Element expected_element = Element(lhs) - Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 14);
    }

    // Test case 2: Two witness points WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[2];
        auto rhs = TestFixture::generators[3];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

        Element diff_element = Element(lhs) - Element(rhs);
        AffineElement hint(diff_element);

        cycle_group_ct result = a.unconditional_subtract(b, hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        // Same gate count as without hint - hint is a witness generation optimization only
        check_circuit_and_gates(builder, 14);
    }

    // Test case 3: Mixed witness and constant points
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b(rhs); // constant

        cycle_group_ct result = a.unconditional_subtract(b);

        Element expected_element = Element(lhs) - Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 10);
    }
}

TYPED_TEST(CycleGroupTest, TestUnconditionalSubtractConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test case 1: Two constant points WITHOUT hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[0];
        auto rhs = TestFixture::generators[1];
        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        cycle_group_ct result = a.unconditional_subtract(b);

        Element expected_element = Element(lhs) - Element(rhs);
        AffineElement expected(expected_element);
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }

    // Test case 2: Two constant points WITH hint
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[2];
        auto rhs = TestFixture::generators[3];
        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        Element diff_element = Element(lhs) - Element(rhs);
        AffineElement hint(diff_element);

        cycle_group_ct result = a.unconditional_subtract(b, hint);

        EXPECT_EQ(result.get_value(), hint);
        EXPECT_TRUE(result.is_constant());
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        check_circuit_and_gates(builder, 0);
    }
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

    check_circuit_and_gates(builder, 34);
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

    check_circuit_and_gates(builder, 16);
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
    // No gate count check for failing test
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// Test regular addition of witness points (no edge cases)
TYPED_TEST(CycleGroupTest, TestAddRegular)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];

    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

    // Test tag merging
    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    AffineElement expected(Element(lhs) + Element(rhs));
    EXPECT_EQ(c.get_value(), expected);
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    check_circuit_and_gates(builder, 47);
}

// Test addition with LHS point at infinity
TYPED_TEST(CycleGroupTest, TestAddLhsInfinity)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto rhs = -TestFixture::generators[1];
    auto affine_infinity = cycle_group_ct::AffineElement::infinity();

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&builder, affine_infinity);

    cycle_group_ct a = point_at_infinity;
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs);

    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    EXPECT_EQ(c.get_value(), rhs);
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    check_circuit_and_gates(builder, 47);
}

// Test addition with RHS point at infinity
TYPED_TEST(CycleGroupTest, TestAddRhsInfinity)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto affine_infinity = cycle_group_ct::AffineElement::infinity();

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&builder, affine_infinity);

    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = point_at_infinity;

    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    EXPECT_EQ(c.get_value(), lhs);
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    // Addition with witness infinity point
    check_circuit_and_gates(builder, 47);
}

// Test addition with both points at infinity
TYPED_TEST(CycleGroupTest, TestAddBothInfinity)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto affine_infinity = cycle_group_ct::AffineElement::infinity();

    cycle_group_ct point_at_infinity1 = cycle_group_ct::from_witness(&builder, affine_infinity);

    cycle_group_ct point_at_infinity2 = cycle_group_ct::from_witness(&builder, affine_infinity);

    cycle_group_ct a = point_at_infinity1;
    cycle_group_ct b = point_at_infinity2;

    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    EXPECT_TRUE(c.is_point_at_infinity().get_value());
    EXPECT_TRUE(c.get_value().is_point_at_infinity());
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    check_circuit_and_gates(builder, 47);
}

// Test addition of inverse points (result is infinity)
TYPED_TEST(CycleGroupTest, TestAddInversePoints)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];

    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, -lhs);

    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    EXPECT_TRUE(c.is_point_at_infinity().get_value());
    EXPECT_TRUE(c.get_value().is_point_at_infinity());
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    check_circuit_and_gates(builder, 47);
}

// Test doubling (adding point to itself)
TYPED_TEST(CycleGroupTest, TestAddDoubling)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];

    cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&builder, lhs);

    a.set_origin_tag(submitted_value_origin_tag);
    b.set_origin_tag(challenge_origin_tag);

    cycle_group_ct c = a + b;

    AffineElement expected((Element(lhs)).dbl());
    EXPECT_EQ(c.get_value(), expected);
    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

    check_circuit_and_gates(builder, 47);
}

TYPED_TEST(CycleGroupTest, TestAddConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test adding constant points - this takes a completely different path than witness points
    // The existing TestAdd only tests witness points
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[5];
        auto rhs = TestFixture::generators[6];

        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        cycle_group_ct result = a + b;

        AffineElement expected(Element(lhs) + Element(rhs));
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_TRUE(result.is_constant());

        // No gates needed for constant arithmetic
        check_circuit_and_gates(builder, 0);
    }

    // Test constant point + constant infinity (early return optimization)
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[7];

        cycle_group_ct a(lhs);
        cycle_group_ct b = cycle_group_ct::constant_infinity(&builder);

        cycle_group_ct result = a + b;

        EXPECT_EQ(result.get_value(), lhs);
        EXPECT_TRUE(result.is_constant());

        // Uses early return for constant infinity
        check_circuit_and_gates(builder, 0);
    }
}

TYPED_TEST(CycleGroupTest, TestAddMixedConstantWitness)
{
    STDLIB_TYPE_ALIASES;

    // Test mixed constant/witness operations which use different code paths than pure witness ops
    // The existing TestAdd doesn't cover these mixed scenarios

    // Test witness + constant infinity (early return path)
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[10];

        cycle_group_ct a = cycle_group_ct::from_witness(&builder, lhs);
        cycle_group_ct b = cycle_group_ct::constant_infinity(&builder);

        cycle_group_ct result = a + b;

        EXPECT_EQ(result.get_value(), lhs);
        EXPECT_FALSE(result.is_constant());

        // Early return optimization for constant infinity
        check_circuit_and_gates(builder, 6);
    }

    // Test constant + witness point (different gate count than witness + witness)
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[11];
        auto rhs = TestFixture::generators[12];

        cycle_group_ct a(lhs);                                          // constant
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, rhs); // witness

        cycle_group_ct result = a + b;

        AffineElement expected(Element(lhs) + Element(rhs));
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_FALSE(result.is_constant());

        // Different gate count than pure witness addition
        check_circuit_and_gates(builder, 23);
    }
}

// Test the infinity result logic specifically
TYPED_TEST(CycleGroupTest, TestAddInfinityResultLogic)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    // Test Case 1: P + (-P) = O (infinity_predicate true, neither input is infinity)
    {
        auto point = TestFixture::generators[0];
        auto neg_point = -point;

        cycle_group_ct a = cycle_group_ct::from_witness(&builder, point);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, neg_point);

        cycle_group_ct result = a + b;

        // Verify result is infinity
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_TRUE(result.get_value().is_point_at_infinity());
    }

    // Test Case 2: O + O = O (both inputs are infinity)
    {
        cycle_group_ct inf1 = cycle_group_ct::from_witness(&builder, Group::affine_point_at_infinity);
        cycle_group_ct inf2 = cycle_group_ct::from_witness(&builder, Group::affine_point_at_infinity);

        cycle_group_ct result = inf1 + inf2;

        // Verify result is infinity
        EXPECT_TRUE(result.is_point_at_infinity().get_value());
        EXPECT_TRUE(result.get_value().is_point_at_infinity());
    }

    // Test Case 3: P + O = P (only rhs is infinity, result should NOT be infinity)
    {
        auto point = TestFixture::generators[1];

        cycle_group_ct a = cycle_group_ct::from_witness(&builder, point);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, Group::affine_point_at_infinity);

        cycle_group_ct result = a + b;

        // Verify result is NOT infinity
        EXPECT_FALSE(result.is_point_at_infinity().get_value());
        EXPECT_EQ(result.get_value(), point);
    }

    // Test Case 4: O + P = P (only lhs is infinity, result should NOT be infinity)
    {
        auto point = TestFixture::generators[2];

        cycle_group_ct a = cycle_group_ct::from_witness(&builder, Group::affine_point_at_infinity);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, point);

        cycle_group_ct result = a + b;

        // Verify result is NOT infinity
        EXPECT_FALSE(result.is_point_at_infinity().get_value());
        EXPECT_EQ(result.get_value(), point);
    }

    // Test Case 5: P + P = 2P (doubling, result should NOT be infinity unless P is special)
    {
        auto point = TestFixture::generators[3];

        cycle_group_ct a = cycle_group_ct::from_witness(&builder, point);
        cycle_group_ct b = cycle_group_ct::from_witness(&builder, point);

        cycle_group_ct result = a + b;

        // Verify result is NOT infinity (it's 2P)
        EXPECT_FALSE(result.is_point_at_infinity().get_value());

        AffineElement expected(Element(point).dbl());
        EXPECT_EQ(result.get_value(), expected);
    }

    check_circuit_and_gates(builder, 235);
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

    check_circuit_and_gates(builder, 34);
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

    check_circuit_and_gates(builder, 16);
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
    // No gate count check for failing test
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TYPED_TEST(CycleGroupTest, TestSubtract)
{
    STDLIB_TYPE_ALIASES;
    using bool_ct = stdlib::bool_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    auto builder = Builder();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];
    auto affine_infinity = cycle_group_ct::AffineElement::infinity();

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&builder, affine_infinity);

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

    check_circuit_and_gates(builder, 267);
}

TYPED_TEST(CycleGroupTest, TestSubtractConstantPoints)
{
    STDLIB_TYPE_ALIASES;

    // Test subtracting constant points - this takes a completely different path than witness points
    // The existing TestSubtract only tests witness points
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[5];
        auto rhs = TestFixture::generators[6];

        cycle_group_ct a(lhs);
        cycle_group_ct b(rhs);

        cycle_group_ct result = a - b;

        AffineElement expected(Element(lhs) - Element(rhs));
        EXPECT_EQ(result.get_value(), expected);
        EXPECT_TRUE(result.is_constant());

        // No gates needed for constant arithmetic
        check_circuit_and_gates(builder, 0);
    }

    // Test constant point - constant infinity (early return optimization)
    {
        auto builder = Builder();
        auto lhs = TestFixture::generators[7];

        cycle_group_ct a(lhs);
        cycle_group_ct b = cycle_group_ct::constant_infinity(&builder);

        cycle_group_ct result = a - b;

        EXPECT_EQ(result.get_value(), lhs);
        EXPECT_TRUE(result.is_constant());

        // Uses early return for constant infinity
        check_circuit_and_gates(builder, 0);
    }

    // Test constant infinity - constant point (early return optimization)
    {
        auto builder = Builder();
        auto rhs = TestFixture::generators[7];

        cycle_group_ct a = cycle_group_ct::constant_infinity(&builder);
        cycle_group_ct b(rhs);

        cycle_group_ct result = a - b;

        EXPECT_EQ(result.get_value(), -rhs);
        EXPECT_TRUE(result.is_constant());

        // Uses early return for constant infinity
        check_circuit_and_gates(builder, 0);
    }
}

/**
 * @brief Assign different tags to all points and scalars and return the union of that tag
 * @details We assign the tags with the same round index to a (point,scalar) pair, but the point is treated as
 * submitted value, while scalar as a challenge. Merging these tags should not run into any edgecases
 *
 */
template <typename T1, typename T2> auto assign_and_merge_tags(T1& points, T2& scalars)
{
    OriginTag merged_tag;
    for (size_t i = 0; i < points.size(); i++) {
        const auto point_tag = OriginTag(/*parent_index=*/0, /*round_index=*/i, /*is_submitted=*/true);
        const auto scalar_tag = OriginTag(/*parent_index=*/0, /*round_index=*/i, /*is_submitted=*/false);

        merged_tag = OriginTag(merged_tag, OriginTag(point_tag, scalar_tag));
        points[i].set_origin_tag(point_tag);
        scalars[i].set_origin_tag(scalar_tag);
    }
    return merged_tag;
}

TYPED_TEST(CycleGroupTest, TestBatchMulGeneralMSM)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    const size_t num_muls = 1;
    // case 1, general MSM with inputs that are combinations of constant and witnesses
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

    check_circuit_and_gates(builder, 4396);
}

TYPED_TEST(CycleGroupTest, TestBatchMulProducesInfinity)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    // case 2, MSM that produces point at infinity
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

    check_circuit_and_gates(builder, 4022);
}

TYPED_TEST(CycleGroupTest, TestBatchMulMultiplyByZero)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    // case 3. Multiply by zero
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

    check_circuit_and_gates(builder, 3532);
}

TYPED_TEST(CycleGroupTest, TestBatchMulInputsAreInfinity)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    // case 4. Inputs are points at infinity
    std::vector<cycle_group_ct> points;
    std::vector<typename cycle_group_ct::cycle_scalar> scalars;

    typename Group::Fr scalar = Group::Fr::random_element(&engine);
    auto affine_infinity = cycle_group_ct::AffineElement::infinity();

    // is_infinity = witness
    {
        cycle_group_ct point = cycle_group_ct::from_witness(&builder, affine_infinity);
        points.emplace_back(point);
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
    }
    // is_infinity = constant
    {
        cycle_group_ct point = cycle_group_ct(affine_infinity);
        points.emplace_back(point);
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));
    }

    const auto expected_tag = assign_and_merge_tags(points, scalars);
    auto result = cycle_group_ct::batch_mul(points, scalars);
    EXPECT_TRUE(result.is_point_at_infinity().get_value());
    EXPECT_EQ(result.get_origin_tag(), expected_tag);

    check_circuit_and_gates(builder, 3545);
}

TYPED_TEST(CycleGroupTest, TestBatchMulFixedBaseInLookupTable)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    const size_t num_muls = 1;
    // case 5, fixed-base MSM with inputs that are combinations of constant and witnesses (group elements are in
    // lookup table)
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

    check_circuit_and_gates(builder, 2822);
}

TYPED_TEST(CycleGroupTest, TestBatchMulFixedBaseSomeInLookupTable)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    const size_t num_muls = 1;
    // case 6, fixed-base MSM with inputs that are combinations of constant and witnesses (some group elements are
    // in lookup table)
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

        // 3: add entry where point is constant, scalar is witness
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

    check_circuit_and_gates(builder, 3398);
}

TYPED_TEST(CycleGroupTest, TestBatchMulFixedBaseZeroScalars)
{
    STDLIB_TYPE_ALIASES;
    auto builder = Builder();

    const size_t num_muls = 1;
    // case 7, Fixed-base MSM where input scalars are 0
    std::vector<cycle_group_ct> points;
    std::vector<typename cycle_group_ct::cycle_scalar> scalars;

    for (size_t i = 0; i < num_muls; ++i) {
        auto element = plookup::fixed_base::table::lhs_generator_point();
        typename Group::Fr scalar = 0;

        // 1: add entry where point is constant, scalar is witness
        points.emplace_back((element));
        scalars.emplace_back(cycle_group_ct::cycle_scalar::from_witness(&builder, scalar));

        // 2: add entry where point is constant, scalar is constant
        points.emplace_back((element));
        scalars.emplace_back(typename cycle_group_ct::cycle_scalar(scalar));
    }
    const auto expected_tag = assign_and_merge_tags(points, scalars);
    auto result = cycle_group_ct::batch_mul(points, scalars);
    EXPECT_EQ(result.is_point_at_infinity().get_value(), true);
    EXPECT_EQ(result.get_origin_tag(), expected_tag);

    check_circuit_and_gates(builder, 2837);
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

    check_circuit_and_gates(builder, 6597);
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
            check_circuit_and_gates(builder, 3498);
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
            check_circuit_and_gates(builder, 5288);
        }
    };
    run_test(/*construct_witnesses=*/true);
    run_test(/*construct_witnesses=*/false);
}

/**
 * @brief Temporary debugging test demonstrating that batch_mul with scalars of different bit lengths is not supported
 *
 */
TYPED_TEST(CycleGroupTest, MixedLengthScalarsIsNotSupported)
{
    STDLIB_TYPE_ALIASES
    using FF = typename Curve::ScalarField;
    using FF_ct = stdlib::bigfield<Builder, typename FF::Params>;

    Builder builder;

    // Create two points
    std::vector<cycle_group_ct> points;
    points.push_back(cycle_group_ct::from_witness(&builder, TestFixture::generators[0]));
    points.push_back(cycle_group_ct::from_witness(&builder, TestFixture::generators[1]));

    // Create two scalars with DIFFERENT bit lengths
    std::vector<typename cycle_group_ct::cycle_scalar> scalars;

    // First scalar: 254 bits (default cycle_scalar::NUM_BITS)
    auto scalar1_value = FF::random_element(&engine);
    auto scalar1 = FF_ct::from_witness(&builder, scalar1_value);
    scalars.emplace_back(scalar1);
    EXPECT_EQ(scalars[0].num_bits(), cycle_scalar_ct::NUM_BITS);

    // Second scalar: 256 bits
    uint256_t scalar2_value = uint256_t(987654321);
    scalars.push_back(cycle_scalar_ct::from_u256_witness(&builder, scalar2_value));
    EXPECT_EQ(scalars[1].num_bits(), 256);

    // The different sized scalars results in different sized scalar slices arrays which is not handled in batch_mul
    EXPECT_NE(scalars[0].num_bits(), scalars[1].num_bits());
    EXPECT_THROW_OR_ABORT(cycle_group_ct::batch_mul(points, scalars), "Assertion failed: (s.num_bits() == num_bits)");
}

/**
 * @brief Test fixed-base batch multiplication via the public batch_mul interface
 *
 * Tests that the fixed-base MSM works correctly for the two supported Pedersen generators
 */
TYPED_TEST(CycleGroupTest, TestFixedBaseBatchMul)
{
    STDLIB_TYPE_ALIASES
    Builder builder;

    // Get the fixed base points that have lookup tables
    auto lhs_generator = plookup::fixed_base::table::lhs_generator_point();
    auto rhs_generator = plookup::fixed_base::table::rhs_generator_point();

    // Test with two scalars and both generators
    std::vector<cycle_scalar_ct> scalars;
    std::vector<cycle_group_ct> points;

    auto scalar1_val = Group::Fr::random_element(&engine);
    auto scalar2_val = Group::Fr::random_element(&engine);

    scalars.push_back(cycle_scalar_ct::from_witness(&builder, scalar1_val));
    scalars.push_back(cycle_scalar_ct::from_witness(&builder, scalar2_val));
    points.push_back(cycle_group_ct(lhs_generator)); // constant point
    points.push_back(cycle_group_ct(rhs_generator)); // constant point

    auto result = cycle_group_ct::batch_mul(points, scalars);

    // Compute expected result natively
    AffineElement expected = lhs_generator * scalar1_val + rhs_generator * scalar2_val;

    EXPECT_EQ(result.get_value(), expected);

    check_circuit_and_gates(builder, 2908);
}
#pragma GCC diagnostic pop

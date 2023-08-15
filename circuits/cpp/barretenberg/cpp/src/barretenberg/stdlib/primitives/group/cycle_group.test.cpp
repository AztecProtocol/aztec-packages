#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <gtest/gtest.h>

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Composer = TypeParam;                                                                                        \
    using cycle_group_ct = stdlib::cycle_group<Composer>;                                                              \
    using G1 = typename Composer::EmbeddedCurve;                                                                       \
    using element = typename G1::element;                                                                              \
    using affine_element = typename G1::affine_element;

namespace stdlib_cycle_group_tests {
using namespace barretenberg;
using namespace proof_system::plonk;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

template <class Composer> class CycleGroupTest : public ::testing::Test {
  public:
    using G1 = typename Composer::EmbeddedCurve;
    using FF = typename G1::subgroup_field;

    using element = typename G1::element;
    using affine_element = typename G1::affine_element;

    static constexpr size_t num_generators = 10;
    static inline std::array<affine_element, num_generators> generators{};

    static void SetUpTestSuite()
    {
        for (size_t i = 0; i < num_generators; ++i) {
            generators[i] = G1::one * FF::random_element(&engine);
        }
    };
};

using CircuitTypes = ::testing::
    Types<proof_system::StandardCircuitBuilder, proof_system::TurboCircuitBuilder, proof_system::UltraCircuitBuilder>;
TYPED_TEST_SUITE(CycleGroupTest, CircuitTypes);

TYPED_TEST(CycleGroupTest, TestDbl)
{
    STDLIB_TYPE_ALIASES;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
    cycle_group_ct c = a.dbl();
    affine_element expected(element(lhs).dbl());
    affine_element result = c.get_value();
    EXPECT_EQ(result, expected);

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestUnconditionalAdd)
{
    STDLIB_TYPE_ALIASES;
    auto composer = Composer();

    auto add =
        [&](const affine_element& lhs, const affine_element& rhs, const bool lhs_constant, const bool rhs_constant) {
            cycle_group_ct a = lhs_constant ? cycle_group_ct(lhs) : cycle_group_ct::from_witness(&composer, lhs);
            cycle_group_ct b = rhs_constant ? cycle_group_ct(rhs) : cycle_group_ct::from_witness(&composer, rhs);
            cycle_group_ct c = a.unconditional_add(b);
            affine_element expected(element(lhs) + element(rhs));
            affine_element result = c.get_value();
            EXPECT_EQ(result, expected);
        };

    add(TestFixture::generators[0], TestFixture::generators[1], false, false);
    add(TestFixture::generators[0], TestFixture::generators[1], false, true);
    add(TestFixture::generators[0], TestFixture::generators[1], true, false);
    add(TestFixture::generators[0], TestFixture::generators[1], true, true);

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalAddSucceed)
{
    STDLIB_TYPE_ALIASES;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];

    // case 1. valid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
    cycle_group_ct c = a.constrained_unconditional_add(b);
    affine_element expected(element(lhs) + element(rhs));
    affine_element result = c.get_value();
    EXPECT_EQ(result, expected);

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalAddFail)
{
    using Composer = TypeParam;
    using cycle_group_ct = stdlib::cycle_group<Composer>;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[0]; // ruh roh

    // case 2. invalid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
    a.constrained_unconditional_add(b);

    EXPECT_TRUE(composer.failed());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestAdd)
{
    STDLIB_TYPE_ALIASES;
    using bool_ct = stdlib::bool_t<Composer>;
    using witness_ct = stdlib::witness_t<Composer>;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&composer, rhs);
    point_at_infinity.is_infinity = bool_ct(witness_ct(&composer, true));

    // case 1. no edge-cases triggered
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
        cycle_group_ct c = a + b;
        affine_element expected(element(lhs) + element(rhs));
        affine_element result = c.get_value();
        EXPECT_EQ(result, expected);
    }

    // case 2. lhs is point at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
        cycle_group_ct c = a + b;
        affine_element result = c.get_value();
        EXPECT_EQ(result, rhs);
    }

    // case 3. rhs is point at infinity
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = point_at_infinity;
        cycle_group_ct c = a + b;
        affine_element result = c.get_value();
        EXPECT_EQ(result, lhs);
    }

    // case 4. both points are at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = point_at_infinity;
        cycle_group_ct c = a + b;
        EXPECT_TRUE(c.is_infinity.get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
    }

    // case 5. lhs = -rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, -lhs);
        cycle_group_ct c = a + b;
        EXPECT_TRUE(c.is_infinity.get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
    }

    // case 6. lhs = rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct c = a + b;
        affine_element expected((element(lhs)).dbl());
        affine_element result = c.get_value();
        EXPECT_EQ(result, expected);
    }

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestUnconditionalSubtract)
{
    STDLIB_TYPE_ALIASES;
    auto composer = Composer();

    auto add =
        [&](const affine_element& lhs, const affine_element& rhs, const bool lhs_constant, const bool rhs_constant) {
            cycle_group_ct a = lhs_constant ? cycle_group_ct(lhs) : cycle_group_ct::from_witness(&composer, lhs);
            cycle_group_ct b = rhs_constant ? cycle_group_ct(rhs) : cycle_group_ct::from_witness(&composer, rhs);
            cycle_group_ct c = a.unconditional_subtract(b);
            affine_element expected(element(lhs) - element(rhs));
            affine_element result = c.get_value();
            EXPECT_EQ(result, expected);
        };

    add(TestFixture::generators[0], TestFixture::generators[1], false, false);
    add(TestFixture::generators[0], TestFixture::generators[1], false, true);
    add(TestFixture::generators[0], TestFixture::generators[1], true, false);
    add(TestFixture::generators[0], TestFixture::generators[1], true, true);

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalSubtractSucceed)
{
    STDLIB_TYPE_ALIASES;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = TestFixture::generators[1];

    // case 1. valid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
    cycle_group_ct c = a.constrained_unconditional_subtract(b);
    affine_element expected(element(lhs) - element(rhs));
    affine_element result = c.get_value();
    EXPECT_EQ(result, expected);

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(CycleGroupTest, TestConstrainedUnconditionalSubtractFail)
{
    using Composer = TypeParam;
    using cycle_group_ct = stdlib::cycle_group<Composer>;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[0]; // ruh roh

    // case 2. invalid unconditional add
    cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
    cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
    a.constrained_unconditional_subtract(b);

    EXPECT_TRUE(composer.failed());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, false);
}

TYPED_TEST(CycleGroupTest, TestSubtract)
{
    STDLIB_TYPE_ALIASES;
    using bool_ct = stdlib::bool_t<Composer>;
    using witness_ct = stdlib::witness_t<Composer>;
    auto composer = Composer();

    auto lhs = TestFixture::generators[0];
    auto rhs = -TestFixture::generators[1];

    cycle_group_ct point_at_infinity = cycle_group_ct::from_witness(&composer, rhs);
    point_at_infinity.is_infinity = bool_ct(witness_ct(&composer, true));

    // case 1. no edge-cases triggered
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
        cycle_group_ct c = a - b;
        affine_element expected(element(lhs) - element(rhs));
        affine_element result = c.get_value();
        EXPECT_EQ(result, expected);
    }

    // case 2. lhs is point at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, rhs);
        cycle_group_ct c = a - b;
        affine_element result = c.get_value();
        EXPECT_EQ(result, -rhs);
    }

    // case 3. rhs is point at infinity
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = point_at_infinity;
        cycle_group_ct c = a - b;
        affine_element result = c.get_value();
        EXPECT_EQ(result, lhs);
    }

    // case 4. both points are at infinity
    {
        cycle_group_ct a = point_at_infinity;
        cycle_group_ct b = point_at_infinity;
        cycle_group_ct c = a - b;
        EXPECT_TRUE(c.is_infinity.get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
    }

    // case 5. lhs = -rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, -lhs);
        cycle_group_ct c = a - b;
        affine_element expected((element(lhs)).dbl());
        affine_element result = c.get_value();
        EXPECT_EQ(result, expected);
    }

    // case 6. lhs = rhs
    {
        cycle_group_ct a = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct b = cycle_group_ct::from_witness(&composer, lhs);
        cycle_group_ct c = a - b;
        EXPECT_TRUE(c.is_infinity.get_value());
        EXPECT_TRUE(c.get_value().is_point_at_infinity());
    }

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, false);
}

} // namespace stdlib_cycle_group_tests
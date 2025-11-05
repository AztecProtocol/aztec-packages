#include "multi_scalar_mul.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace ::acir_format;

enum class InputConstancy : uint8_t { None, Points, Scalars, Both };

/**
 * @brief Testing functions to generate the MultiScalarMul test suite. Constancy specifies which inputs to the
 * constraints should be constant.
 *
 * @details Edge cases for MSM on Grumpkin are tested in cycle_group. Here we test that:
 * 1. If sum(scalars[i] * points[i]) != result, then the circuit fails (TamperingMode::Result)
 * 2. If the inputs are not valid points/scalars on Grumpkin, or the MSM is incorrect, but the predicate is witness
 * false, then the circuit is satisfied.
 */
template <typename Builder_, InputConstancy Constancy> class MultiScalarMulTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = MultiScalarMul;
    using G1 = bb::grumpkin::g1;
    using GrumpkinPoint = G1::affine_element;
    using FF = bb::fr;

    class Tampering {
      public:
        enum class Mode : uint8_t { None, Result };

        static std::vector<Mode> get_all() { return { Mode::None, Mode::Result }; }

        static std::vector<std::string> get_labels() { return { "None", "Result" }; }
    };

    class WitnessOverride {
      public:
        enum class Case : uint8_t { None, Points, Scalars };

        static std::vector<Case> get_all() { return { Case::None, Case::Points, Case::Scalars }; }

        static std::vector<std::string> get_labels() { return { "None", "Points", "Scalars" }; }
    };

    static void generate_constraints(AcirConstraint& msm_constraint, WitnessVector& witness_values)
    {
        // Generate a single point and scalar for simplicity
        GrumpkinPoint point = GrumpkinPoint::random_element();
        bb::fq scalar_native = bb::fq::random_element();
        GrumpkinPoint result = point * scalar_native;
        BB_ASSERT(result != GrumpkinPoint::one()); // Ensure that tampering works correctly

        // Split scalar into low and high limbs (128 bits each) as FF for witness values
        uint256_t scalar_u256 = uint256_t(scalar_native);
        FF scalar_lo = scalar_u256.slice(0, 128);
        FF scalar_hi = scalar_u256.slice(128, 256);

        // Determine which inputs are constants based on the Constancy template parameter
        constexpr bool points_are_constant = (Constancy == InputConstancy::Points || Constancy == InputConstancy::Both);
        constexpr bool scalars_are_constant =
            (Constancy == InputConstancy::Scalars || Constancy == InputConstancy::Both);

        // Helper to add points: either as witnesses or constants based on Constancy
        auto construct_points = [&]() -> std::vector<WitnessOrConstant<FF>> {
            if constexpr (points_are_constant) {
                // Points are constants
                return { WitnessOrConstant<FF>::from_constant(point.x),
                         WitnessOrConstant<FF>::from_constant(point.y),
                         WitnessOrConstant<FF>::from_constant(point.is_point_at_infinity() ? FF(1) : FF(0)) };
            }
            // Points are witnesses
            std::vector<uint32_t> point_indices = add_to_witness_and_track_indices(witness_values, point);
            return { WitnessOrConstant<FF>::from_index(point_indices[0]),
                     WitnessOrConstant<FF>::from_index(point_indices[1]),
                     WitnessOrConstant<FF>::from_index(point_indices[2]) };
        };

        // Helper to add scalars: either as witnesses or constants based on Constancy
        auto construct_scalars = [&]() -> std::vector<WitnessOrConstant<FF>> {
            if constexpr (scalars_are_constant) {
                // Scalars are constants
                return { WitnessOrConstant<FF>::from_constant(scalar_lo),
                         WitnessOrConstant<FF>::from_constant(scalar_hi) };
            }
            // Scalars are witnesses
            uint32_t scalar_lo_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(scalar_lo);
            uint32_t scalar_hi_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(scalar_hi);
            return { WitnessOrConstant<FF>::from_index(scalar_lo_index),
                     WitnessOrConstant<FF>::from_index(scalar_hi_index) };
        };

        // Add points and scalars according to constancy template parameter
        auto point_fields = construct_points();
        auto scalar_fields = construct_scalars();

        // Construct result and predicate as witnesses
        std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);
        uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF::one()); // predicate

        // Build the constraint
        msm_constraint = MultiScalarMul{
            .points = point_fields,
            .scalars = scalar_fields,
            .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
            .out_point_x = result_indices[0],
            .out_point_y = result_indices[1],
            .out_point_is_infinite = result_indices[2],
        };
    }

    static void override_witness(AcirConstraint& constraint,
                                 WitnessVector& witness_values,
                                 const WitnessOverride::Case& witness_override)
    {
        switch (witness_override) {
        case WitnessOverride::Case::Points: {
            // Invalidate the point by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Scalars) {
                witness_values[constraint.points[0].index] += bb::fr(1);
            } else {
                constraint.points[0] = WitnessOrConstant<FF>::from_constant(constraint.points[0].value + bb::fr(1));
            }
            break;
        }
        case WitnessOverride::Case::Scalars: {
            // Invalidate the scalar by adding 1 to the low limb
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Points) {
                witness_values[constraint.scalars[0].index] += bb::fr(1);
            } else {
                constraint.scalars[0] = WitnessOrConstant<FF>::from_constant(constraint.scalars[0].value + bb::fr(1));
            }
            break;
        }
        case WitnessOverride::Case::None:
        default:
            break;
        }
    }

    static void tampering(AcirConstraint& constraint,
                          WitnessVector& witness_values,
                          const Tampering::Mode& tampering_mode)
    {
        switch (tampering_mode) {
        case Tampering::Mode::Result: {
            // Tamper with the result by setting it to the generator point
            witness_values[constraint.out_point_x] = GrumpkinPoint::one().x;
            witness_values[constraint.out_point_y] = GrumpkinPoint::one().y;
            witness_values[constraint.out_point_is_infinite] = FF::zero();
            break;
        }
        case Tampering::Mode::None:
        default:
            break;
        }
    };
};

template <typename Builder>
class MultiScalarMulTestsNoneConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::None>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsPointsConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Points>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsScalarsConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Scalars>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsBothConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Both>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(MultiScalarMulTestsNoneConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsPointsConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsScalarsConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsBothConstant, BuilderTypes);

TYPED_TEST(MultiScalarMulTestsNoneConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(MultiScalarMulTestsBothConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsBothConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsBothConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsBothConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(MultiScalarMulTestsBothConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

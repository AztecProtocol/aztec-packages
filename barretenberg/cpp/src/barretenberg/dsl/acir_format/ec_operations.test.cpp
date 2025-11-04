#include "ec_operations.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"

#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace ::acir_format;

enum class InputConstancy : uint8_t { None, Input1, Input2, Both };

/**
 * @brief Testing functions to generate the EcOperationTest test suite. Constancy specifies which inputs to the
 * constraints should be constant.
 *
 * @details Edge cases for point addition on Grumpkin are tested in cycle_group. Here we test that:
 * 1. If input1 + input2 != result, then the circuit fails (TamperingMode::Result)
 * 2. If the inputs are not valid points on Grumpkin, or input1 + input2 != result, but the predicate is witness false,
 *    then the circuit is satisfied.
 */
template <typename Builder_, InputConstancy Constancy> class EcOperationsTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = EcAdd;
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
        enum class Case : uint8_t { None, Input1, Input2 };

        static std::vector<Case> get_all() { return { Case::None, Case::Input1, Case::Input2 }; }

        static std::vector<std::string> get_labels() { return { "None", "Input1", "Input2" }; }
    };

    static void generate_constraints(AcirConstraint& ec_add_constraint, WitnessVector& witness_values)
    {
        // Generate points on Grumpkin
        GrumpkinPoint input1 = GrumpkinPoint::random_element();
        GrumpkinPoint input2 = GrumpkinPoint::random_element();
        GrumpkinPoint result = input1 + input2;
        BB_ASSERT(result != GrumpkinPoint::one()); // Ensure that tampering works correctly

        if constexpr (Constancy == InputConstancy::None) {
            std::vector<uint32_t> input1_indices = add_to_witness_and_track_indices(witness_values, input1);
            std::vector<uint32_t> input2_indices = add_to_witness_and_track_indices(witness_values, input2);
            std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);

            uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(FF::one()); // predicate

            ec_add_constraint = EcAdd{
                .input1_x = WitnessOrConstant<FF>::from_index(input1_indices[0]),
                .input1_y = WitnessOrConstant<FF>::from_index(input1_indices[1]),
                .input1_infinite = WitnessOrConstant<FF>::from_index(input1_indices[2]),
                .input2_x = WitnessOrConstant<FF>::from_index(input2_indices[0]),
                .input2_y = WitnessOrConstant<FF>::from_index(input2_indices[1]),
                .input2_infinite = WitnessOrConstant<FF>::from_index(input2_indices[2]),
                .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
                .result_x = result_indices[0],
                .result_y = result_indices[1],
                .result_infinite = result_indices[2],
            };
        } else if constexpr (Constancy == InputConstancy::Input1) {
            std::vector<uint32_t> input2_indices = add_to_witness_and_track_indices(witness_values, input2);
            std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);

            uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(FF::one()); // predicate

            ec_add_constraint = EcAdd{
                .input1_x = WitnessOrConstant<FF>::from_constant(input1.x),
                .input1_y = WitnessOrConstant<FF>::from_constant(input1.y),
                .input1_infinite = WitnessOrConstant<FF>::from_constant(input1.is_point_at_infinity() ? FF(1) : FF(0)),
                .input2_x = WitnessOrConstant<FF>::from_index(input2_indices[0]),
                .input2_y = WitnessOrConstant<FF>::from_index(input2_indices[1]),
                .input2_infinite = WitnessOrConstant<FF>::from_index(input2_indices[2]),
                .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
                .result_x = result_indices[0],
                .result_y = result_indices[1],
                .result_infinite = result_indices[2],
            };
        } else if constexpr (Constancy == InputConstancy::Input2) {
            std::vector<uint32_t> input1_indices = add_to_witness_and_track_indices(witness_values, input1);
            std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);

            uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(FF::one()); // predicate

            ec_add_constraint = EcAdd{
                .input1_x = WitnessOrConstant<FF>::from_index(input1_indices[0]),
                .input1_y = WitnessOrConstant<FF>::from_index(input1_indices[1]),
                .input1_infinite = WitnessOrConstant<FF>::from_index(input1_indices[2]),
                .input2_x = WitnessOrConstant<FF>::from_constant(input2.x),
                .input2_y = WitnessOrConstant<FF>::from_constant(input2.y),
                .input2_infinite = WitnessOrConstant<FF>::from_constant(input2.is_point_at_infinity() ? FF(1) : FF(0)),
                .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
                .result_x = result_indices[0],
                .result_y = result_indices[1],
                .result_infinite = result_indices[2],
            };
        } else if constexpr (Constancy == InputConstancy::Both) {
            std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);

            uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(FF::one()); // predicate

            ec_add_constraint = EcAdd{
                .input1_x = WitnessOrConstant<FF>::from_constant(input1.x),
                .input1_y = WitnessOrConstant<FF>::from_constant(input1.y),
                .input1_infinite = WitnessOrConstant<FF>::from_constant(input1.is_point_at_infinity() ? FF(1) : FF(0)),
                .input2_x = WitnessOrConstant<FF>::from_constant(input2.x),
                .input2_y = WitnessOrConstant<FF>::from_constant(input2.y),
                .input2_infinite = WitnessOrConstant<FF>::from_constant(input2.is_point_at_infinity() ? FF(1) : FF(0)),
                .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
                .result_x = result_indices[0],
                .result_y = result_indices[1],
                .result_infinite = result_indices[2],
            };
        }
    }

    static void override_witness(AcirConstraint& constraint,
                                 WitnessVector& witness_values,
                                 const WitnessOverride::Case& witness_override)
    {
        switch (witness_override) {
        case WitnessOverride::Case::Input1: {
            // Invalidate the first input by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Input2) {
                witness_values[constraint.input1_x.index] += bb::fr(1);
            } else {
                constraint.input1_x = WitnessOrConstant<FF>::from_constant(constraint.input1_x.value + bb::fr(1));
            }
            break;
        }
        case WitnessOverride::Case::Input2: {
            // Invalidate the second input by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Input1) {
                witness_values[constraint.input2_x.index] += bb::fr(1);
            } else {
                constraint.input2_x = WitnessOrConstant<FF>::from_constant(constraint.input2_x.value + bb::fr(1));
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
            witness_values[constraint.result_x] = GrumpkinPoint::one().x;
            witness_values[constraint.result_y] = GrumpkinPoint::one().y;
            witness_values[constraint.result_infinite] = FF::zero();
            break;
        }
        case Tampering::Mode::None:
        default:
            break;
        }
    };
};

template <typename Builder>
class EcOperationsTestsNoneConstant
    : public ::testing::Test,
      public TestClassWithPredicate<EcOperationsTestingFunctions<Builder, InputConstancy::None>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class EcOperationsTestsInput1Constant
    : public ::testing::Test,
      public TestClassWithPredicate<EcOperationsTestingFunctions<Builder, InputConstancy::Input1>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class EcOperationsTestsInput2Constant
    : public ::testing::Test,
      public TestClassWithPredicate<EcOperationsTestingFunctions<Builder, InputConstancy::Input2>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class EcOperationsTestsBothConstant
    : public ::testing::Test,
      public TestClassWithPredicate<EcOperationsTestingFunctions<Builder, InputConstancy::Both>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(EcOperationsTestsNoneConstant, BuilderTypes);
TYPED_TEST_SUITE(EcOperationsTestsInput1Constant, BuilderTypes);
TYPED_TEST_SUITE(EcOperationsTestsInput2Constant, BuilderTypes);
TYPED_TEST_SUITE(EcOperationsTestsBothConstant, BuilderTypes);

TYPED_TEST(EcOperationsTestsNoneConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsNoneConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsNoneConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsNoneConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsNoneConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(EcOperationsTestsInput1Constant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsInput1Constant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput1Constant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput1Constant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput1Constant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(EcOperationsTestsInput2Constant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsInput2Constant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput2Constant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput2Constant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsInput2Constant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(EcOperationsTestsBothConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsBothConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsBothConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsBothConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::Result);
}

TYPED_TEST(EcOperationsTestsBothConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

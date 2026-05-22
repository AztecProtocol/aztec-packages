#include "ec_operations.hpp"
#include "acir_format.hpp"

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

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Input1, // Invalidate first input point
            Input2, // Invalidate second input point
            Result  // Invalidate result output
        };

        static std::vector<Target> get_all()
        {
            return { Target::None, Target::Input1, Target::Input2, Target::Result };
        }

        static std::vector<std::string> get_labels() { return { "None", "Input1", "Input2", "Result" }; }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static void generate_constraints(AcirConstraint& ec_add_constraint, WitnessVector& witness_values)
    {
        // Generate points on Grumpkin
        GrumpkinPoint input1 = GrumpkinPoint::random_element();
        GrumpkinPoint input2 = GrumpkinPoint::random_element();
        GrumpkinPoint result = input1 + input2;
        BB_ASSERT(result != GrumpkinPoint::one()); // Ensure that tampering works correctly

        // Helper to add a point: either as witness or constant
        auto construct_point = [&](const GrumpkinPoint& point, bool as_constant) -> std::vector<WitnessOrConstant<FF>> {
            if (as_constant) {
                // Point is constant
                return { WitnessOrConstant<FF>::from_constant(point.x), WitnessOrConstant<FF>::from_constant(point.y) };
            }
            // Point is witness
            std::vector<uint32_t> point_indices = add_to_witness_and_track_indices(witness_values, point);
            return { WitnessOrConstant<FF>::from_index(point_indices[0]),
                     WitnessOrConstant<FF>::from_index(point_indices[1]) };
        };

        // Determine which inputs are constants based on the Constancy template parameter
        constexpr bool input1_is_constant = (Constancy == InputConstancy::Input1 || Constancy == InputConstancy::Both);
        constexpr bool input2_is_constant = (Constancy == InputConstancy::Input2 || Constancy == InputConstancy::Both);

        // Add inputs according to constancy template parameter
        auto input1_fields = construct_point(input1, input1_is_constant);
        auto input2_fields = construct_point(input2, input2_is_constant);

        // Construct result and predicate as witnesses
        std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);
        uint32_t predicate_index = add_to_witness_and_track_indices(witness_values, FF(1));

        // Build the constraint
        ec_add_constraint = EcAdd{
            .input1_x = input1_fields[0],
            .input1_y = input1_fields[1],
            .input2_x = input2_fields[0],
            .input2_y = input2_fields[1],
            .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
            .result_x = result_indices[0],
            .result_y = result_indices[1],
        };
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Input1: {
            // Invalidate the first input by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Input2) {
                witness_values[constraint.input1_x.index] += bb::fr(1);
            } else {
                constraint.input1_x = WitnessOrConstant<FF>::from_constant(constraint.input1_x.value + bb::fr(1));
            }
            break;
        }
        case InvalidWitness::Target::Input2: {
            // Invalidate the second input by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Input1) {
                witness_values[constraint.input2_x.index] += bb::fr(1);
            } else {
                constraint.input2_x = WitnessOrConstant<FF>::from_constant(constraint.input2_x.value + bb::fr(1));
            }
            break;
        }
        case InvalidWitness::Target::Result: {
            // Tamper with the result (always a witness) by setting it to the generator point
            witness_values[constraint.result_x] = GrumpkinPoint::one().x;
            witness_values[constraint.result_y] = GrumpkinPoint::one().y;
            break;
        }
        case InvalidWitness::Target::None:
        default:
            break;
        }

        return { constraint, witness_values };
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
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsNoneConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsNoneConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(EcOperationsTestsNoneConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(EcOperationsTestsInput1Constant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsInput1Constant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsInput1Constant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsInput1Constant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(EcOperationsTestsInput1Constant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(EcOperationsTestsInput2Constant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsInput2Constant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsInput2Constant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsInput2Constant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(EcOperationsTestsInput2Constant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(EcOperationsTestsBothConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcOperationsTestsBothConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsBothConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcOperationsTestsBothConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(EcOperationsTestsBothConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

// ============================================================
// Infinity tests: the point at infinity is encoded as (0, 0).
// ============================================================
using GrumpkinPoint = bb::grumpkin::g1::affine_element;
using FF = bb::fr;

struct AcirPoint {
    FF x, y;
    static AcirPoint from_native(const GrumpkinPoint& p) { return { p.x, p.y }; }
    static AcirPoint infinity() { return { FF(0), FF(0) }; }
};

template <typename Builder> class EcOperationsInfinityTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Push an AcirPoint to the witness vector and return the [x, y] indices.
    static std::array<uint32_t, 2> push_point(WitnessVector& witness, const AcirPoint& pt)
    {
        uint32_t xi = static_cast<uint32_t>(witness.size());
        witness.emplace_back(pt.x);
        uint32_t yi = static_cast<uint32_t>(witness.size());
        witness.emplace_back(pt.y);
        return { xi, yi };
    }

    // Build an EcAdd constraint (predicate=1) from three ACIR points.
    // Returns the constraint and the populated witness vector.
    static std::pair<EcAdd, WitnessVector> make_ec_add(AcirPoint p1, AcirPoint p2, AcirPoint result)
    {
        WitnessVector witness;
        auto i1 = push_point(witness, p1);
        auto i2 = push_point(witness, p2);
        auto r = push_point(witness, result);
        uint32_t pred_idx = static_cast<uint32_t>(witness.size());
        witness.emplace_back(FF(1));

        EcAdd c{
            .input1_x = WitnessOrConstant<FF>::from_index(i1[0]),
            .input1_y = WitnessOrConstant<FF>::from_index(i1[1]),
            .input2_x = WitnessOrConstant<FF>::from_index(i2[0]),
            .input2_y = WitnessOrConstant<FF>::from_index(i2[1]),
            .predicate = WitnessOrConstant<FF>::from_index(pred_idx),
            .result_x = r[0],
            .result_y = r[1],
        };
        return { c, witness };
    }

    // Run the circuit and return (satisfied, error_string).
    static std::pair<bool, std::string> run_circuit(EcAdd constraint, WitnessVector witness)
    {
        AcirFormat cs = constraint_to_acir_format(constraint);
        AcirProgram program{ cs, witness };
        auto builder = create_circuit<Builder>(program, ProgramMetadata{});
        bool ok = CircuitChecker::check(builder) && !builder.failed();
        return { ok, builder.err() };
    }
};

TYPED_TEST_SUITE(EcOperationsInfinityTests, BuilderTypes);

// P + (-P) = (0, 0): valid circuit.
TYPED_TEST(EcOperationsInfinityTests, ResultIsInfinity)
{
    BB_DISABLE_ASSERTS();
    GrumpkinPoint p = GrumpkinPoint::random_element();
    auto [constraint, witness] =
        TestFixture::make_ec_add(AcirPoint::from_native(p), AcirPoint::from_native(-p), AcirPoint::infinity());
    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "P + (-P) = infinity should produce a valid circuit";
}

// Input point at infinity (∞ + P = P): valid circuit.
TYPED_TEST(EcOperationsInfinityTests, Input1IsInfinity)
{
    BB_DISABLE_ASSERTS();
    GrumpkinPoint p = GrumpkinPoint::random_element();
    auto [constraint, witness] =
        TestFixture::make_ec_add(AcirPoint::infinity(), AcirPoint::from_native(p), AcirPoint::from_native(p));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "infinity + P = P should produce a valid circuit";
}

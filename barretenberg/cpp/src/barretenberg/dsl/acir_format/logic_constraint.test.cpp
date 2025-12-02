#include "logic_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"

#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace ::acir_format;

enum class InputConstancy : uint8_t { None, Input1, Input2, Both };

template <typename Builder_, InputConstancy Constancy_, size_t num_bits_, bool is_xor_gate_>
struct LogicConstraintTestParams {
    using Builder = Builder_;
    static constexpr InputConstancy Constancy = Constancy_;
    static constexpr size_t num_bits = num_bits_;
    static constexpr bool is_xor_gate = is_xor_gate_;
};

/**
 * @brief Testing functions to generate the LogicConstraintTest test suite. Constancy specifies which inputs to the
 * constraints should be constant.
 */
template <typename Builder_, InputConstancy Constancy, size_t num_bits, bool is_xor_gate>
class LogicConstraintTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = LogicConstraint;
    using FF = bb::fr;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Input1Value,   // Invalidate first input
            Input1BitSize, // Invalidate first input
            Input2Value,   // Invalidate second input
            Input2BitSize, // Invalidate second input
            Result         // Invalidate result output
        };

        static std::vector<Target> get_all()
        {
            return { Target::None,        Target::Input1Value,   Target::Input1BitSize,
                     Target::Input2Value, Target::Input2BitSize, Target::Result };
        }

        static std::vector<std::string> get_labels()
        {
            return { "None", "Input1Value", "Input1BitSize", "Input2Value", "Input2BitSize", "Result" };
        }
    };

    static void generate_constraints(AcirConstraint& logic_constraint, WitnessVector& witness_values)
    {
        // Helper to add an input
        auto construct_input = [&](const bb::fr input, bool as_constant) -> WitnessOrConstant<FF> {
            if (as_constant) {
                // Input is constant
                return { WitnessOrConstant<FF>::from_constant(input) };
            }
            // Input is witness
            uint32_t input_index = add_to_witness_and_track_indices(witness_values, input);
            return WitnessOrConstant<FF>::from_index(input_index);
        };

        bb::fr lhs = FF::random_element();
        lhs = FF(static_cast<uint256_t>(lhs) >> (256 - num_bits)); // Mask to num_bits
        bb::fr rhs = FF::random_element();
        rhs = FF(static_cast<uint256_t>(rhs) >> (256 - num_bits)); // Mask to num_bits
        bb::fr result = is_xor_gate ? (static_cast<uint256_t>(lhs) ^ static_cast<uint256_t>(rhs))
                                    : (static_cast<uint256_t>(lhs) & static_cast<uint256_t>(rhs));

        logic_constraint = AcirConstraint{
            .a = construct_input(lhs, (Constancy == InputConstancy::Input1 || Constancy == InputConstancy::Both)),
            .b = construct_input(rhs, (Constancy == InputConstancy::Input2 || Constancy == InputConstancy::Both)),
            .result = add_to_witness_and_track_indices(witness_values, result),
            .num_bits = static_cast<uint32_t>(num_bits),
            .is_xor_gate = static_cast<uint32_t>(is_xor_gate),
        };
    };

    static void invalidate_witness(AcirConstraint& constraint,
                                   WitnessVector& witness_values,
                                   const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::Input1Value: {
            if (Constancy != InputConstancy::Input1 && Constancy != InputConstancy::Both) {
                uint32_t witness_index = constraint.a.index;
                witness_values[witness_index] += FF::one(); // Tamper input 1 value
            }
            break;
        }
        case InvalidWitness::Target::Input1BitSize: {
            if (Constancy != InputConstancy::Input1 && Constancy != InputConstancy::Both) {
                uint32_t witness_index = constraint.a.index;
                witness_values[witness_index] +=
                    (static_cast<uint256_t>(witness_values[witness_index]) << 1); // Tamper input 1 bit size
            }
            break;
        }
        case InvalidWitness::Target::Input2Value: {
            if (Constancy != InputConstancy::Input2 && Constancy != InputConstancy::Both) {
                uint32_t witness_index = constraint.b.index;
                witness_values[witness_index] += FF::one(); // Tamper input 2 value
            }
            break;
        }
        case InvalidWitness::Target::Input2BitSize: {
            if (Constancy != InputConstancy::Input2 && Constancy != InputConstancy::Both) {
                uint32_t witness_index = constraint.b.index;
                witness_values[witness_index] +=
                    (static_cast<uint256_t>(witness_values[witness_index]) << 1); // Tamper input 1 bit size
            }
            break;
        }
        case InvalidWitness::Target::Result: {
            uint32_t witness_index = constraint.result;
            witness_values[witness_index] += FF::one(); // Tamper result value
            break;
        }
        }
    }
};

template <InputConstancy Constancy>
using LogicTestConfigs =
    testing::Types<LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 32, false>, // Ultra, AND
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 16, false>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 8, false>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 4, false>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 32, true>, // Ultra, XOR
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 16, true>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 8, true>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 4, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 32, false>, // Mega, AND
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 16, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 8, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 4, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 32, true>, // Mega, XOR
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 16, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 8, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 4, true>>;

template <typename Params>
class LogicConstraintTestsNoneConstant : public ::testing::Test,
                                         public TestClass<LogicConstraintTestingFunctions<typename Params::Builder,
                                                                                          Params::Constancy,
                                                                                          Params::num_bits,
                                                                                          Params::is_xor_gate>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Params>
class LogicConstraintTestsInput1Constant : public ::testing::Test,
                                           public TestClass<LogicConstraintTestingFunctions<typename Params::Builder,
                                                                                            Params::Constancy,
                                                                                            Params::num_bits,
                                                                                            Params::is_xor_gate>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Params>
class LogicConstraintTestsInput2Constant : public ::testing::Test,
                                           public TestClass<LogicConstraintTestingFunctions<typename Params::Builder,
                                                                                            Params::Constancy,
                                                                                            Params::num_bits,
                                                                                            Params::is_xor_gate>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Params>
class LogicConstraintTestsBothConstant : public ::testing::Test,
                                         public TestClass<LogicConstraintTestingFunctions<typename Params::Builder,
                                                                                          Params::Constancy,
                                                                                          Params::num_bits,
                                                                                          Params::is_xor_gate>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(LogicConstraintTestsNoneConstant, LogicTestConfigs<InputConstancy::None>);
TYPED_TEST_SUITE(LogicConstraintTestsInput1Constant, LogicTestConfigs<InputConstancy::Input1>);
TYPED_TEST_SUITE(LogicConstraintTestsInput2Constant, LogicTestConfigs<InputConstancy::Input2>);
TYPED_TEST_SUITE(LogicConstraintTestsBothConstant, LogicTestConfigs<InputConstancy::Both>);

TYPED_TEST(LogicConstraintTestsNoneConstant, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(LogicConstraintTestsNoneConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(LogicConstraintTestsInput1Constant, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(LogicConstraintTestsInput1Constant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(LogicConstraintTestsInput2Constant, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(LogicConstraintTestsInput2Constant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

TYPED_TEST(LogicConstraintTestsBothConstant, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(LogicConstraintTestsBothConstant, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

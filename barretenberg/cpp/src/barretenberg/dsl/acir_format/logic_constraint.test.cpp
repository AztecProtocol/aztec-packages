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
template <typename Builder_, InputConstancy Constancy, uint32_t num_bits, bool is_xor_gate>
class LogicConstraintTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = LogicConstraint;
    using FF = bb::fr;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Inputs,        // Invalidate first input
            Input1BitSize, // Invalidate first input
            Input2BitSize, // Invalidate second input
        };

        static std::vector<Target> get_all()
        {
            if constexpr (num_bits == bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH) {
                return { Target::None, Target::Inputs };
            }

            return { Target::None, Target::Inputs, Target::Input1BitSize, Target::Input2BitSize };
        }

        static std::vector<std::string> get_labels()
        {
            if constexpr (num_bits == bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH) {
                return { "None", "Inputs" };
            }

            return { "None", "Inputs", "Input1BitSize", "Input2BitSize" };
        }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

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

        bb::fr lhs = FF(static_cast<uint256_t>(1) << num_bits - 1); // All bits from 0 to num_bits-1 are set
        bb::fr rhs = FF(static_cast<uint256_t>(1) << num_bits - 1); // All bits from 0 to num_bits-1 are set
        bb::fr result = is_xor_gate ? (static_cast<uint256_t>(lhs) ^ static_cast<uint256_t>(rhs))
                                    : (static_cast<uint256_t>(lhs) & static_cast<uint256_t>(rhs));

        logic_constraint = AcirConstraint{
            .a = construct_input(lhs, (Constancy == InputConstancy::Input1 || Constancy == InputConstancy::Both)),
            .b = construct_input(rhs, (Constancy == InputConstancy::Input2 || Constancy == InputConstancy::Both)),
            .result = add_to_witness_and_track_indices(witness_values, result),
            .num_bits = num_bits,
            .is_xor_gate = is_xor_gate,
        };
    };

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::Inputs: {
            // Set rhs = 1 << (num_bits - 1)
            if (Constancy != InputConstancy::Input2 && Constancy != InputConstancy::Both) {
                witness_values[constraint.b.index] = FF(static_cast<uint256_t>(1) << (num_bits - 1));
            } else {
                constraint.b.value = FF(static_cast<uint256_t>(1) << (num_bits - 1));
            }
            // Set result to incorrect value: lhs ^ (1 << (num_bits - 1)) = 0, lhs & (1 << (num_bits - 1)) = 1
            witness_values[constraint.result] = is_xor_gate ? FF::one() : FF::zero();
            break;
        }
        case InvalidWitness::Target::Input1BitSize: {
            if (Constancy != InputConstancy::Input1 && Constancy != InputConstancy::Both) {
                witness_values[constraint.a.index] +=
                    (static_cast<uint256_t>(witness_values[constraint.a.index]) << 1); // Tamper input 1 bit size
            } else {
                constraint.a.value = static_cast<uint256_t>(constraint.a.value) << 1; // Tamper input 1 bit size
            }
            break;
        }
        case InvalidWitness::Target::Input2BitSize: {
            if (Constancy != InputConstancy::Input2 && Constancy != InputConstancy::Both) {
                witness_values[constraint.b.index] +=
                    (static_cast<uint256_t>(witness_values[constraint.b.index]) << 1); // Tamper input 1 bit size
            } else {
                constraint.b.value = static_cast<uint256_t>(constraint.b.value) << 1; // Tamper input 1 bit size
            }
            break;
        }
        }

        return { constraint, witness_values };
    }
};

template <InputConstancy Constancy>
using LogicTestConfigs =
    testing::Types<LogicConstraintTestParams<UltraCircuitBuilder,
                                             Constancy,
                                             bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH,
                                             false>,                                      // Ultra, AND, max bits
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 128, false>, // Ultra, AND, random bits
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 16, false>,  // Ultra, AND, < 32 bits
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 1, false>,   // Ultra, AND, min bits
                   LogicConstraintTestParams<UltraCircuitBuilder,
                                             Constancy,
                                             bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH,
                                             true>, // Ultra, XOR
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 128, true>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 16, true>,
                   LogicConstraintTestParams<UltraCircuitBuilder, Constancy, 1, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder,
                                             Constancy,
                                             bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH,
                                             false>, // Mega, AND
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 128, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 16, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 1, false>,
                   LogicConstraintTestParams<MegaCircuitBuilder,
                                             Constancy,
                                             bb::grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH,
                                             true>, // Mega,
                                                    // XOR
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 128, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 16, true>,
                   LogicConstraintTestParams<MegaCircuitBuilder, Constancy, 1, true>>;

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
    typename TestFixture::AcirConstraint constraint;
    WitnessVector witness_values;
    TestFixture::Base::generate_constraints(constraint, witness_values);

    // We need to test tampering by hand because when both inputs are constant making the bit size invalid will not
    // make the builder fail, it will raise an error.
    {
        auto [circuit_checker_result, builder_failed, builder_err] =
            TestFixture::test_constraints(constraint, witness_values, TestFixture::InvalidWitnessTarget::None);
        EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed unexpectedly for invalid witness target None";
        EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for invalid witness target None";
    }

    {
        auto [circuit_checker_result, builder_failed, builder_err] =
            TestFixture::test_constraints(constraint, witness_values, TestFixture::InvalidWitnessTarget::Inputs);
        bool circuit_check_failed = !circuit_checker_result;
        bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
        EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
            << "Circuit checker succeeded unexpectedly and no assert_eq failure for invalid witness target Inputs";
        EXPECT_TRUE(builder_failed) << "Builder succeeded for invalid witness target Inputs";
    }

    {
        EXPECT_THROW_WITH_MESSAGE(
            TestFixture::test_constraints(constraint, witness_values, TestFixture::InvalidWitnessTarget::Input1BitSize),
            "field_t: Left operand in logic gate exceeds specified bit length");
    }

    {
        EXPECT_THROW_WITH_MESSAGE(
            TestFixture::test_constraints(constraint, witness_values, TestFixture::InvalidWitnessTarget::Input2BitSize),
            "field_t: Right operand in logic gate exceeds specified bit length");
    }
}

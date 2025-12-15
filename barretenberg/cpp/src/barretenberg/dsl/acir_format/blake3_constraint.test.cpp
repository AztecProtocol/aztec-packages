#include "blake3_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;

template <class BuilderType, bool IsInputConstant> class Blake3TestingFunctions {
  public:
    using Builder = BuilderType;
    using AcirConstraint = Blake3Constraint;
    using FF = Builder::FF;

    struct InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Input,  // Tamper with an input value
            Output, // Tamper with an output value
        };

        static std::vector<Target> get_all() { return { Target::None, Target::Input, Target::Output }; }

        static std::vector<std::string> get_labels() { return { "None", "Input", "Output" }; }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    void invalidate_witness(Blake3Constraint& constraint,
                            WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Input: {
            // Tamper with the first input element
            if constexpr (IsInputConstant) {
                constraint.inputs[0].blackbox_input =
                    WitnessOrConstant<FF>::from_constant(constraint.inputs[0].blackbox_input.value + bb::fr(1));
            } else {
                witness_values[constraint.inputs[0].blackbox_input.index] += bb::fr(1);
            }
            break;
        }
        case InvalidWitness::Target::Output: {
            // Tamper with the first output element
            witness_values[constraint.result[0]] += bb::fr(1);
            break;
        }
        case InvalidWitness::Target::None:
            break;
        }
    }

    /**
     * @brief Generate a valid Blake3Constraint with correct witness values
     */
    void generate_constraints(Blake3Constraint& blake3_constraint, WitnessVector& witness_values)
    {
        // Helper to add a state: either as witness or constant
        auto construct_state = [&](const std::vector<uint8_t>& state,
                                   bool as_constant) -> std::vector<WitnessOrConstant<FF>> {
            std::vector<WitnessOrConstant<FF>> result;
            if (as_constant) {
                for (const auto& byte : state) {
                    result.push_back(WitnessOrConstant<FF>::from_constant(FF(byte)));
                }
                return result;
            }
            auto indices = add_to_witness_and_track_indices(witness_values, state);
            for (const auto& idx : indices) {
                result.push_back(WitnessOrConstant<FF>::from_index(idx));
            }
            return result;
        };

        // Input: 64-byte message
        std::vector<uint8_t> input_state(64);

        // Expected Blake3s hash output
        std::vector<uint8_t> output_state = blake3::blake3s(input_state);

        // Create the constraint
        blake3_constraint.inputs.reserve(input_state.size());
        for (const auto& state : construct_state(input_state, IsInputConstant)) {
            Blake3Input input{ .blackbox_input = state, .num_bits = 8 };
            blake3_constraint.inputs.push_back(input);
        }

        // Add output state to witness
        auto output_indices = add_to_witness_and_track_indices(witness_values, output_state);
        // Add output indices to constraint
        for (auto [blake_result, output_idx] : zip_view(blake3_constraint.result, output_indices)) {
            blake_result = output_idx;
        }
    }
};

template <class Builder>
class Blake3ConstraintsTestInputConstant : public ::testing::Test,
                                           public TestClass<Blake3TestingFunctions<Builder, true>> {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(Blake3ConstraintsTestInputConstant, BuilderTypes);
TYPED_TEST(Blake3ConstraintsTestInputConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Blake3ConstraintsTestInputConstant, Tampering)
{
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

template <class Builder>
class Blake3ConstraintsTestInputWitness : public ::testing::Test,
                                          public TestClass<Blake3TestingFunctions<Builder, false>> {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(Blake3ConstraintsTestInputWitness, BuilderTypes);
TYPED_TEST(Blake3ConstraintsTestInputWitness, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Blake3ConstraintsTestInputWitness, Tampering)
{
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

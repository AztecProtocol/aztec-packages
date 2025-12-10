#include "blake2s_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;

template <class BuilderType> class Blake2sTestingFunctions {
  public:
    using Builder = BuilderType;
    using AcirConstraint = Blake2sConstraint;

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

    void invalidate_witness(Blake2sConstraint& constraint,
                            WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Input: {
            // Tamper with the first input element
            witness_values[constraint.inputs[0].blackbox_input.index] += bb::fr(1);
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
     * @brief Generate a valid Blake2sConstraint with correct witness values
     */
    void generate_constraints(Blake2sConstraint& blake2s_constraint, WitnessVector& witness_values)
    {
        // Start with the zero variable at index 0
        witness_values.emplace_back(bb::fr(0));

        // Input: 64-byte message
        std::vector<uint8_t> input_state(64);

        // Expected Blake2s hash output
        std::array<uint8_t, 32> output_state = crypto::blake2s(input_state);

        // Add input and output state to witness
        auto input_indices = add_to_witness_and_track_indices<std::vector<uint8_t>, 64>(witness_values, input_state);
        auto output_indices =
            add_to_witness_and_track_indices<std::array<uint8_t, 32>, 32>(witness_values, output_state);

        // Create the constraint
        blake2s_constraint.inputs.reserve(input_state.size());
        for (size_t i = 0; i < input_state.size(); ++i) {
            Blake2sInput input{
                .blackbox_input = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(input_indices[i])),
                .num_bits = 8,
            };
            blake2s_constraint.inputs.push_back(input);
        }
        for (size_t i = 0; i < 32; ++i) {
            blake2s_constraint.result[i] = static_cast<uint32_t>(output_indices[i]);
        }
    }
};

template <class Builder>
class Blake2sConstraintsTest : public ::testing::Test, public TestClass<Blake2sTestingFunctions<Builder>> {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(Blake2sConstraintsTest, BuilderTypes);

TYPED_TEST(Blake2sConstraintsTest, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Blake2sConstraintsTest, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

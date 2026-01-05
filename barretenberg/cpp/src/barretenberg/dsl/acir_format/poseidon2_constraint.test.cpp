#include "poseidon2_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;

template <class BuilderType> class Poseidon2TestingFunctions {
  public:
    using Builder = BuilderType;
    using AcirConstraint = Poseidon2Constraint;
    using Poseidon2 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    using State = Poseidon2::State;

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

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        Poseidon2Constraint constraint,
        WitnessVector witness_values,
        const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Input:
            // Tamper with the first input element
            witness_values[constraint.state[0].index] += bb::fr(1);
            break;
        case InvalidWitness::Target::Output:
            // Tamper with the first output element
            witness_values[constraint.result[0]] += bb::fr(1);
            break;
        case InvalidWitness::Target::None:
            break;
        }

        return { constraint, witness_values };
    }

    /**
     * @brief Generate valid Poseidon2 constraint with correct witness values
     */
    static void generate_constraints(Poseidon2Constraint& poseidon2_constraint, WitnessVector& witness_values)
    {
        // Start with the zero variable at index 0
        witness_values.emplace_back(bb::fr(0));

        // Use a reproducible input state
        State input_state = { bb::fr(0), bb::fr(1), bb::fr(2), bb::fr(3) };

        // Compute expected output using native Poseidon2 permutation
        State output_state = Poseidon2::permutation(input_state);

        // Add input and output state to witness
        auto input_indices = add_to_witness_and_track_indices<State, 4>(witness_values, input_state);
        auto output_indices = add_to_witness_and_track_indices<State, 4>(witness_values, output_state);

        // Create the constraint
        poseidon2_constraint = Poseidon2Constraint{
            .state = { WitnessOrConstant<bb::fr>::from_index(input_indices[0]),
                       WitnessOrConstant<bb::fr>::from_index(input_indices[1]),
                       WitnessOrConstant<bb::fr>::from_index(input_indices[2]),
                       WitnessOrConstant<bb::fr>::from_index(input_indices[3]) },
            .result = { output_indices[0], output_indices[1], output_indices[2], output_indices[3] },
        };
    }
};

template <class Builder>
class Poseidon2ConstraintsTest : public ::testing::Test, public TestClass<Poseidon2TestingFunctions<Builder>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(Poseidon2ConstraintsTest, BuilderTypes);

TYPED_TEST(Poseidon2ConstraintsTest, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Poseidon2ConstraintsTest, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

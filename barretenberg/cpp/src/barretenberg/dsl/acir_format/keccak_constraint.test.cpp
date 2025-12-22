#include "keccak_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/crypto/keccak/keccakf1600.cpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;

template <class BuilderType> class KeccakTestingFunctions {
  public:
    using Builder = BuilderType;
    using AcirConstraint = Keccakf1600;

    struct InvalidWitness {
        enum class Target : uint8_t {
            None,
            Input,  // Tamper with an input lane witness
            Output, // Tamper with an output lane witness
        };

        static std::vector<Target> get_all() { return { Target::None, Target::Input, Target::Output }; }

        static std::vector<std::string> get_labels() { return { "None", "Input", "Output" }; }
    };

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        Keccakf1600 constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
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
     * @brief Generate a valid Keccakf1600 constraint with correct witness values
     *
     * This produces:
     *  - 25 input lanes
     *  - 25 output lanes
     */
    static void generate_constraints(Keccakf1600& keccak_constraint, WitnessVector& witness_values)
    {
        // Start with the zero variable at index 0
        witness_values.emplace_back(bb::fr(0));

        // Use a reproducible input state
        std::array<uint64_t, KECCAKF1600_LANES> input_state{};
        for (size_t i = 0; i < input_state.size(); ++i) {
            input_state[i] = static_cast<uint64_t>(i);
        }

        // Compute expected output state using a native Keccak-f[1600] permutation
        std::array<uint64_t, KECCAKF1600_LANES> output_state = input_state;
        ethash_keccakf1600(output_state.data());

        // Add input/output states to witness
        auto input_indices =
            add_to_witness_and_track_indices<std::array<uint64_t, KECCAKF1600_LANES>, KECCAKF1600_LANES>(witness_values,
                                                                                                         input_state);
        auto output_indices =
            add_to_witness_and_track_indices<std::array<uint64_t, KECCAKF1600_LANES>, KECCAKF1600_LANES>(witness_values,
                                                                                                         output_state);

        // Create the constraint
        for (size_t i = 0; i < KECCAKF1600_LANES; ++i) {
            keccak_constraint.state[i] = WitnessOrConstant<bb::fr>::from_index(input_indices[i]);
            keccak_constraint.result[i] = output_indices[i];
        }
    }
};

template <class Builder>
class KeccakConstraintsTest : public ::testing::Test, public TestClass<KeccakTestingFunctions<Builder>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(KeccakConstraintsTest, BuilderTypes);

TYPED_TEST(KeccakConstraintsTest, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(KeccakConstraintsTest, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

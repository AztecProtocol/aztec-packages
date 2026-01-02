#include "sha256_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;

template <class BuilderType, bool IsInputConstant> class Sha256TestingFunctions {
  public:
    using Builder = BuilderType;
    using AcirConstraint = Sha256Compression;
    using FF = Builder::FF;

    struct InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Input,     // Tamper with an input value
            HashValue, // Tamper with a previous hash state value
            Output,    // Tamper with an output value
        };

        static std::vector<Target> get_all()
        {
            return { Target::None, Target::Input, Target::HashValue, Target::Output };
        }

        static std::vector<std::string> get_labels() { return { "None", "Input", "HashValue", "Output" }; }
    };

    void invalidate_witness(Sha256Compression& constraint,
                            WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Input: {
            if constexpr (IsInputConstant) {
                constraint.inputs[0] = WitnessOrConstant<FF>::from_constant(constraint.inputs[0].value + FF(1));
            } else {
                witness_values[constraint.inputs[0].index] += FF(1);
            }
            break;
        }
        case InvalidWitness::Target::HashValue: {
            if constexpr (IsInputConstant) {
                constraint.hash_values[0] =
                    WitnessOrConstant<FF>::from_constant(constraint.hash_values[0].value + FF(1));
            } else {
                witness_values[constraint.hash_values[0].index] += FF(1);
            }
            break;
        }
        case InvalidWitness::Target::Output: {
            witness_values[constraint.result[0]] += FF(1);
            break;
        }
        case InvalidWitness::Target::None:
            break;
        }
    }

    /**
     * @brief Generate a valid Sha256Compression constraint with correct witness values
     */
    void generate_constraints(Sha256Compression& sha256_constraint, WitnessVector& witness_values)
    {
        // Helper to create WitnessOrConstant from a value
        auto make_witness_or_constant = [&](uint32_t value) -> WitnessOrConstant<FF> {
            if constexpr (IsInputConstant) {
                return WitnessOrConstant<FF>::from_constant(FF(value));
            } else {
                uint32_t idx = static_cast<uint32_t>(witness_values.size());
                witness_values.emplace_back(FF(value));
                return WitnessOrConstant<FF>::from_index(idx);
            }
        };

        // Input: 16 words of zeros (512-bit message block)
        std::array<uint32_t, 16> input_block = { 0 };

        // Initial hash state (SHA-256 IV)
        std::array<uint32_t, 8> hash_values = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

        // Compute expected output using native SHA-256 compression
        std::array<uint32_t, 8> result = crypto::sha256_block(hash_values, input_block);

        // Build the constraint
        for (size_t i = 0; i < 16; ++i) {
            sha256_constraint.inputs[i] = make_witness_or_constant(input_block[i]);
        }
        for (size_t i = 0; i < 8; ++i) {
            sha256_constraint.hash_values[i] = make_witness_or_constant(hash_values[i]);
        }

        // Add output values to witness and set result indices
        for (size_t i = 0; i < 8; ++i) {
            sha256_constraint.result[i] = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(FF(result[i]));
        }
    }
};

// Test with constant inputs
template <class Builder>
class Sha256ConstraintsTestInputConstant : public ::testing::Test,
                                           public TestClass<Sha256TestingFunctions<Builder, true>> {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(Sha256ConstraintsTestInputConstant, BuilderTypes);

TYPED_TEST(Sha256ConstraintsTestInputConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Sha256ConstraintsTestInputConstant, Tampering)
{
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

// Test with witness inputs
template <class Builder>
class Sha256ConstraintsTestInputWitness : public ::testing::Test,
                                          public TestClass<Sha256TestingFunctions<Builder, false>> {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(Sha256ConstraintsTestInputWitness, BuilderTypes);

TYPED_TEST(Sha256ConstraintsTestInputWitness, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(Sha256ConstraintsTestInputWitness, Tampering)
{
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "aes128_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;

namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

/**
 * @brief Testing functions to generate the AES128Test test suite.
 *
 * @details Tests that:
 * 1. Verification key generation is deterministic and independent of witness values
 * 2. Invalid witnesses (wrong key, IV, or output) cause circuit failure
 *
 * @tparam Builder_ The circuit builder type
 * @tparam IsKeyConstant If true, the encryption key is a constant (not a witness)
 * @tparam IsIVConstant If true, the initialization vector is a constant (not a witness)
 */
template <typename Builder_, bool IsKeyConstant, bool IsIVConstant> class AES128TestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = AES128Constraint;
    using FF = typename Builder::FF;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,   // No invalidation - circuit should succeed
            Key,    // Tamper with encryption key (only valid when key is witness)
            IV,     // Tamper with initialization vector (only valid when IV is witness)
            Output, // Tamper with expected output
        };

        static std::vector<Target> get_all()
        {
            std::vector<Target> targets = { Target::None };
            if constexpr (!IsKeyConstant) {
                targets.push_back(Target::Key);
            }
            if constexpr (!IsIVConstant) {
                targets.push_back(Target::IV);
            }
            targets.push_back(Target::Output);
            return targets;
        }

        static std::vector<std::string> get_labels()
        {
            std::vector<std::string> labels = { "None" };
            if constexpr (!IsKeyConstant) {
                labels.push_back("Key");
            }
            if constexpr (!IsIVConstant) {
                labels.push_back("IV");
            }
            labels.push_back("Output");
            return labels;
        }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    /**
     * @brief Generate valid AES128 encryption constraints with random inputs.
     *
     * @details Creates a constraint with:
     * - Random plaintext (1-3 full blocks, i.e. 16, 32, or 48 bytes)
     * - Random 16-byte key (constant or witness based on template param)
     * - Random 16-byte IV (constant or witness based on template param)
     * - Output witnesses computed via native AES-128-CBC
     */
    static void generate_constraints(AcirConstraint& constraint, WitnessVector& witness_values)
    {
        // Generate random plaintext with 1-3 full blocks (16, 32, or 48 bytes)
        size_t num_blocks = 1 + (engine.get_random_uint32() % 3);
        size_t plaintext_size = num_blocks * 16;

        std::vector<uint8_t> plaintext(plaintext_size);
        for (auto& byte : plaintext) {
            byte = static_cast<uint8_t>(engine.get_random_uint32() & 0xFF);
        }

        // Generate random key (16 bytes)
        std::array<uint8_t, 16> key{};
        for (auto& byte : key) {
            byte = static_cast<uint8_t>(engine.get_random_uint32() & 0xFF);
        }

        // Generate random IV (16 bytes)
        std::array<uint8_t, 16> iv{};
        for (auto& byte : iv) {
            byte = static_cast<uint8_t>(engine.get_random_uint32() & 0xFF);
        }

        // Compute the expected ciphertext using native AES-128-CBC (no padding for full blocks)
        std::vector<uint8_t> ciphertext = native_aes128_cbc_encrypt(plaintext, key, iv);

        // Add plaintext bytes to witness and constraint (always witness)
        std::vector<WitnessOrConstant<FF>> input_witnesses;
        for (const auto& byte : plaintext) {
            uint32_t witness_idx = add_to_witness_and_track_indices(witness_values, FF(byte));
            input_witnesses.push_back(WitnessOrConstant<FF>::from_index(witness_idx));
        }

        // Add key bytes to constraint (constant or witness based on template param)
        std::array<WitnessOrConstant<FF>, 16> key_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            if constexpr (IsKeyConstant) {
                key_witnesses[i] = WitnessOrConstant<FF>::from_constant(FF(key[i]));
            } else {
                uint32_t witness_idx = add_to_witness_and_track_indices(witness_values, FF(key[i]));
                key_witnesses[i] = WitnessOrConstant<FF>::from_index(witness_idx);
            }
        }

        // Add IV bytes to constraint (constant or witness based on template param)
        std::array<WitnessOrConstant<FF>, 16> iv_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            if constexpr (IsIVConstant) {
                iv_witnesses[i] = WitnessOrConstant<FF>::from_constant(FF(iv[i]));
            } else {
                uint32_t witness_idx = add_to_witness_and_track_indices(witness_values, FF(iv[i]));
                iv_witnesses[i] = WitnessOrConstant<FF>::from_index(witness_idx);
            }
        }

        // Add output (ciphertext) bytes to witness
        std::vector<uint32_t> output_indices;
        for (const auto& byte : ciphertext) {
            uint32_t witness_idx = add_to_witness_and_track_indices(witness_values, FF(byte));
            output_indices.push_back(witness_idx);
        }

        // Build the constraint
        constraint = AES128Constraint{
            .inputs = std::move(input_witnesses),
            .iv = iv_witnesses,
            .key = key_witnesses,
            .outputs = std::move(output_indices),
        };
    }

    /**
     * @brief Invalidate witness values to test circuit failure detection.
     */
    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            // No tampering
            break;

        case InvalidWitness::Target::Key:
            // Tamper with the first key byte
            if constexpr (IsKeyConstant) {
                constraint.key[0] = WitnessOrConstant<FF>::from_constant(constraint.key[0].value + FF(1));
            } else {
                witness_values[constraint.key[0].index] += FF(1);
            }
            break;

        case InvalidWitness::Target::IV:
            // Tamper with the first IV byte
            if constexpr (IsIVConstant) {
                constraint.iv[0] = WitnessOrConstant<FF>::from_constant(constraint.iv[0].value + FF(1));
            } else {
                witness_values[constraint.iv[0].index] += FF(1);
            }
            break;

        case InvalidWitness::Target::Output:
            // Tamper with the first output byte
            if (!constraint.outputs.empty()) {
                witness_values[constraint.outputs[0]] += FF(1);
            }
            break;
        }

        return { constraint, witness_values };
    }

  private:
    /**
     * @brief Native AES-128-CBC encryption for generating expected outputs.
     *
     * @details Uses the native crypto implementation to compute expected ciphertext.
     * For full blocks (plaintext.size() % 16 == 0), no padding is added to match circuit behavior.
     */
    static std::vector<uint8_t> native_aes128_cbc_encrypt(const std::vector<uint8_t>& plaintext,
                                                          const std::array<uint8_t, 16>& key,
                                                          const std::array<uint8_t, 16>& iv)
    {
        // Copy plaintext to output buffer (no padding for full blocks)
        std::vector<uint8_t> buffer = plaintext;

        // Create mutable copy of IV (the native function modifies it)
        std::array<uint8_t, 16> iv_copy = iv;

        // Encrypt in-place using the native crypto implementation
        crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_copy.data(), key.data(), buffer.size());

        return buffer;
    }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

// =============================================================================
// Test Configuration 1: All witnesses (key and IV are witnesses)
// =============================================================================
template <typename Builder>
class AES128TestAllWitness : public ::testing::Test, public TestClass<AES128TestingFunctions<Builder, false, false>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(AES128TestAllWitness, BuilderTypes);

TYPED_TEST(AES128TestAllWitness, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(AES128TestAllWitness, Tampering)
{
    TestFixture::test_tampering();
}

// =============================================================================
// Test Configuration 2: Constant key (IV is witness)
// =============================================================================
template <typename Builder>
class AES128TestConstantKey : public ::testing::Test, public TestClass<AES128TestingFunctions<Builder, true, false>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(AES128TestConstantKey, BuilderTypes);

TYPED_TEST(AES128TestConstantKey, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(AES128TestConstantKey, Tampering)
{
    TestFixture::test_tampering();
}

// =============================================================================
// Test Configuration 3: Constant IV (key is witness)
// =============================================================================
template <typename Builder>
class AES128TestConstantIV : public ::testing::Test, public TestClass<AES128TestingFunctions<Builder, false, true>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(AES128TestConstantIV, BuilderTypes);

TYPED_TEST(AES128TestConstantIV, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(AES128TestConstantIV, Tampering)
{
    TestFixture::test_tampering();
}

// =============================================================================
// Test Configuration 4: Both key and IV are constants
// =============================================================================
template <typename Builder>
class AES128TestAllConstant : public ::testing::Test, public TestClass<AES128TestingFunctions<Builder, true, true>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(AES128TestAllConstant, BuilderTypes);

TYPED_TEST(AES128TestAllConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(AES128TestAllConstant, Tampering)
{
    TestFixture::test_tampering();
}

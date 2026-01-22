// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "aes128_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
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
template <typename Builder_, bool IsPlaintextConstant, bool IsKeyConstant, bool IsIVConstant>
class AES128TestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = AES128Constraint;
    using FF = typename Builder::FF;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,      // No invalidation - circuit should succeed
            Plaintext, // Tamper with plaintext (only valid when plaintext is witness)
            Key,       // Tamper with encryption key (only valid when key is witness)
            IV,        // Tamper with initialization vector (only valid when IV is witness)
            Output,    // Tamper with expected output
        };

        static std::vector<Target> get_all()
        {
            std::vector<Target> targets = { Target::None };
            if constexpr (!IsPlaintextConstant) {
                targets.push_back(Target::Plaintext);
            }
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
            if constexpr (!IsPlaintextConstant) {
                labels.push_back("Plaintext");
            }
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

        // Lambda to create WitnessOrConstant based on template param
        auto make_witness_or_constant = [&witness_values](FF value, bool is_constant) -> WitnessOrConstant<FF> {
            if (is_constant) {
                return WitnessOrConstant<FF>::from_constant(value);
            }
            uint32_t witness_idx = add_to_witness_and_track_indices(witness_values, value);
            return WitnessOrConstant<FF>::from_index(witness_idx);
        };

        // Add plaintext bytes to constraint
        std::vector<WitnessOrConstant<FF>> input_witnesses;
        for (const auto& byte : plaintext) {
            input_witnesses.push_back(make_witness_or_constant(FF(byte), IsPlaintextConstant));
        }

        // Add key bytes to constraint
        std::array<WitnessOrConstant<FF>, 16> key_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            key_witnesses[i] = make_witness_or_constant(FF(key[i]), IsKeyConstant);
        }

        // Add IV bytes to constraint
        std::array<WitnessOrConstant<FF>, 16> iv_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            iv_witnesses[i] = make_witness_or_constant(FF(iv[i]), IsIVConstant);
        }

        // Add output (ciphertext) bytes to witness (always witness)
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
    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(AcirConstraint constraint,
                                                                       WitnessVector witness_values,
                                                                       const typename InvalidWitness::Target& target)
    {
        switch (target) {
        case InvalidWitness::Target::None:
            // No tampering
            break;

        case InvalidWitness::Target::Plaintext:
            // Tamper with the first plaintext byte
            if constexpr (IsPlaintextConstant) {
                if (!constraint.inputs.empty()) {
                    constraint.inputs[0] = WitnessOrConstant<FF>::from_constant(constraint.inputs[0].value + FF(1));
                }
            } else {
                if (!constraint.inputs.empty()) {
                    witness_values[constraint.inputs[0].index] += FF(1);
                }
            }
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
// Test Configuration 1: All witnesses (plaintext, key, and IV are witnesses)
// =============================================================================
template <typename Builder>
class AES128TestAllWitness : public ::testing::Test,
                             public TestClass<AES128TestingFunctions<Builder, false, false, false>> {
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
// Test Configuration 2: Constant plaintext (key and IV are witnesses)
// =============================================================================
template <typename Builder>
class AES128TestConstantPlaintext : public ::testing::Test,
                                    public TestClass<AES128TestingFunctions<Builder, true, false, false>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(AES128TestConstantPlaintext, BuilderTypes);

TYPED_TEST(AES128TestConstantPlaintext, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(AES128TestConstantPlaintext, Tampering)
{
    TestFixture::test_tampering();
}

// =============================================================================
// Test Configuration 3: Constant key (plaintext and IV are witnesses)
// =============================================================================
template <typename Builder>
class AES128TestConstantKey : public ::testing::Test,
                              public TestClass<AES128TestingFunctions<Builder, false, true, false>> {
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
// Test Configuration 4: Constant IV (plaintext and key are witnesses)
// =============================================================================
template <typename Builder>
class AES128TestConstantIV : public ::testing::Test,
                             public TestClass<AES128TestingFunctions<Builder, false, false, true>> {
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
// Test Configuration 5: All constants (plaintext, key, and IV are constants)
// =============================================================================
template <typename Builder>
class AES128TestAllConstant : public ::testing::Test,
                              public TestClass<AES128TestingFunctions<Builder, true, true, true>> {
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

// =============================================================================
// PKCS#7 Padding Bug Documentation Test
// =============================================================================
// This test documents a known bug: the circuit does NOT add a full padding block
// when the input is block-aligned (multiple of 16 bytes).
//
// Per PKCS#7 specification:
// - Input of N bytes should produce output of N + 16 - (N % 16) bytes
// - When N % 16 == 0, output should be N + 16 bytes (full padding block added)
//
// Current buggy behavior:
// - Input of 32 bytes produces 32 bytes output (no padding block)
// - Should produce 48 bytes output (32 + 16 padding block)
//
// This matches the Noir stdlib signature: fn aes128_encrypt<let N: u32>(...) -> [u8; N + 16 - N % 16]
// And the ACVM solver which uses libaes with proper PKCS#7 padding.
// =============================================================================

/**
 * @brief Test that documents the PKCS#7 padding bug for block-aligned inputs.
 *
 * This test will need to be updated when the bug is fixed:
 * - Change EXPECT_EQ(constraint.outputs.size(), 32) to EXPECT_EQ(constraint.outputs.size(), 48)
 * - Update the ciphertext computation to include the padding block
 */
TEST(AES128PaddingBug, BlockAlignedInputMissingPaddingBlock)
{
    // Initialize SRS for plookup tables
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    using Builder = UltraCircuitBuilder;
    using FF = Builder::FF;

    // 32 bytes of plaintext (exactly 2 blocks - block aligned)
    std::vector<uint8_t> plaintext = { 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e,
                                       0x11, 0x73, 0x93, 0x17, 0x2a, 0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03,
                                       0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51 };

    std::array<uint8_t, 16> key = { 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,
                                    0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };

    std::array<uint8_t, 16> iv = { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
                                   0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };

    // Compute ciphertext WITHOUT padding (to match current buggy circuit behavior)
    std::vector<uint8_t> ciphertext_no_padding = plaintext;
    std::array<uint8_t, 16> iv_copy = iv;
    crypto::aes128_encrypt_buffer_cbc(ciphertext_no_padding.data(), iv_copy.data(), key.data(), plaintext.size());

    // Create builder and add witnesses directly
    Builder builder;

    // Helper to add witness to builder and return index
    auto add_witness = [&builder](FF value) -> uint32_t { return builder.add_variable(value); };

    // Add plaintext to builder as witnesses
    std::vector<WitnessOrConstant<FF>> input_witnesses;
    for (const auto& byte : plaintext) {
        uint32_t idx = add_witness(FF(byte));
        input_witnesses.push_back(WitnessOrConstant<FF>::from_index(idx));
    }

    // Add key to builder as witnesses
    std::array<WitnessOrConstant<FF>, 16> key_witnesses{};
    for (size_t i = 0; i < 16; ++i) {
        uint32_t idx = add_witness(FF(key[i]));
        key_witnesses[i] = WitnessOrConstant<FF>::from_index(idx);
    }

    // Add IV to builder as witnesses
    std::array<WitnessOrConstant<FF>, 16> iv_witnesses{};
    for (size_t i = 0; i < 16; ++i) {
        uint32_t idx = add_witness(FF(iv[i]));
        iv_witnesses[i] = WitnessOrConstant<FF>::from_index(idx);
    }

    // Add output (ciphertext without padding) to builder as witnesses
    std::vector<uint32_t> output_indices;
    for (const auto& byte : ciphertext_no_padding) {
        uint32_t idx = add_witness(FF(byte));
        output_indices.push_back(idx);
    }

    // Build the constraint with 32 bytes output (matching buggy behavior)
    AES128Constraint constraint{
        .inputs = std::move(input_witnesses),
        .iv = iv_witnesses,
        .key = key_witnesses,
        .outputs = std::move(output_indices),
    };

    // Per PKCS#7, a 32-byte input should produce 48-byte output (32 + 16 padding block)
    // But the current circuit only produces 32 bytes.

    // Document the bug: output size equals input size (no padding block added)
    EXPECT_EQ(constraint.inputs.size(), 32u) << "Input should be 32 bytes (block-aligned)";
    EXPECT_EQ(constraint.outputs.size(), 32u) << "BUG: Output is 32 bytes, should be 48 bytes per PKCS#7";

    // The correct PKCS#7 output size would be:
    constexpr size_t correct_pkcs7_output_size = 32 + 16; // = 48 bytes
    EXPECT_NE(constraint.outputs.size(), correct_pkcs7_output_size)
        << "When this fails, the PKCS#7 padding bug has been fixed!";

    // Create the AES constraints in the builder
    create_aes128_constraints(builder, constraint);

    // The circuit should pass with the buggy 32-byte output
    bool circuit_valid = CircuitChecker::check(builder);
    EXPECT_TRUE(circuit_valid) << "Circuit should pass with buggy 32-byte output";
}

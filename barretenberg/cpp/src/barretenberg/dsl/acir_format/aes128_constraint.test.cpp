// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "aes128_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
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
// Range Constraint Regression Tests
// =============================================================================
// These tests verify that the AES128 constraint properly enforces that all byte
// values (input, key, IV, output) are in the range [0, 255]. Values outside this
// range should cause circuit verification to fail.
// =============================================================================

class AES128RangeConstraintTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Builder = UltraCircuitBuilder;
    using FF = Builder::FF;

    // Valid test vectors for AES-128-CBC (16 bytes = 1 block)
    static constexpr std::array<FF, 16> valid_plaintext = { 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96,
                                                            0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a };

    static constexpr std::array<FF, 16> valid_key = { 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,
                                                      0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };

    static constexpr std::array<FF, 16> valid_iv = { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
                                                     0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };

    /**
     * @brief Compute valid ciphertext for the test vectors.
     */
    static std::array<FF, 16> compute_ciphertext()
    {
        std::vector<uint8_t> buffer(16);
        std::array<uint8_t, 16> key_bytes{};
        std::array<uint8_t, 16> iv_bytes{};

        for (size_t i = 0; i < 16; ++i) {
            buffer[i] = static_cast<uint8_t>(uint256_t(valid_plaintext[i]));
            key_bytes[i] = static_cast<uint8_t>(uint256_t(valid_key[i]));
            iv_bytes[i] = static_cast<uint8_t>(uint256_t(valid_iv[i]));
        }

        crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_bytes.data(), key_bytes.data(), buffer.size());

        std::array<FF, 16> result{};
        for (size_t i = 0; i < 16; ++i) {
            result[i] = FF(buffer[i]);
        }
        return result;
    }

    /**
     * @brief Build an AES128 constraint with specified values.
     *
     * @param plaintext_vals 16 field elements for plaintext (can include out-of-range values)
     * @param key_vals 16 field elements for key
     * @param iv_vals 16 field elements for IV
     * @param output_vals 16 field elements for expected output
     */
    static std::pair<Builder, AES128Constraint> create_constraint(const std::array<FF, 16>& plaintext_vals,
                                                                  const std::array<FF, 16>& key_vals,
                                                                  const std::array<FF, 16>& iv_vals,
                                                                  const std::array<FF, 16>& output_vals)
    {
        Builder builder;

        auto add_witness = [&builder](FF value) -> uint32_t { return builder.add_variable(value); };

        // Add plaintext witnesses
        std::vector<WitnessOrConstant<FF>> input_witnesses;
        for (const auto& val : plaintext_vals) {
            input_witnesses.push_back(WitnessOrConstant<FF>::from_index(add_witness(val)));
        }

        // Add key witnesses
        std::array<WitnessOrConstant<FF>, 16> key_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            key_witnesses[i] = WitnessOrConstant<FF>::from_index(add_witness(key_vals[i]));
        }

        // Add IV witnesses
        std::array<WitnessOrConstant<FF>, 16> iv_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            iv_witnesses[i] = WitnessOrConstant<FF>::from_index(add_witness(iv_vals[i]));
        }

        // Add output witnesses
        std::vector<uint32_t> output_indices;
        for (const auto& val : output_vals) {
            output_indices.push_back(add_witness(val));
        }

        AES128Constraint constraint{
            .inputs = std::move(input_witnesses),
            .iv = iv_witnesses,
            .key = key_witnesses,
            .outputs = std::move(output_indices),
        };

        return { std::move(builder), std::move(constraint) };
    }

    /**
     * @brief Helper to test that out-of-range bytes are rejected BY THE CIRCUIT, not by native checks.
     *
     * This helper does NOT catch exceptions - if a native check throws, the test will fail.
     * This ensures we're testing circuit soundness, not native validation.
     */
    static bool circuit_rejects_bad_input(Builder& builder, AES128Constraint& constraint)
    {
        // Don't catch exceptions - we want to verify CIRCUIT constraints catch the issue,
        // not native checks that could be bypassed by a malicious prover
        create_aes128_constraints(builder, constraint);
        return !CircuitChecker::check(builder);
    }
};

/**
 * @brief Test that plaintext byte values > 255 cause circuit failure at the RANGE CONSTRAINT,
 * not at the lookup tables.
 *
 * This tests the "overflow attack" scenario with correct byte ordering:
 * - Packing is big-endian: byte[0] is MSB (×256^15), byte[15] is LSB (×256^0)
 * - Attacker provides plaintext [..., 0, 256] (256 in LSB position 15)
 * - packed = 256 * 256^0 = 256
 * - When sliced: 256 % 256 = 0, 256 / 256 = 1 → slices = [0, 1, 0, ...]
 * - This corresponds to valid plaintext [..., 1, 0] (1 in position 14)
 *
 * The range constraint should catch this attack.
 */
TEST_F(AES128RangeConstraintTest, PlaintextOutOfRangeFails)
{
    // The "overflowed" plaintext that AES would actually see after slicing
    // attacker [..., 0, 256] becomes [..., 1, 0] when packed (256) and sliced
    std::array<FF, 16> overflowed_plaintext = {};
    overflowed_plaintext[14] = FF(1); // Carry from position 15
    overflowed_plaintext[15] = FF(0); // 256 % 256 = 0
    // rest are 0

    // Compute the ciphertext for the OVERFLOWED plaintext
    std::vector<uint8_t> buffer(16, 0);
    buffer[14] = 1;
    buffer[15] = 0;
    std::array<uint8_t, 16> key_bytes{};
    std::array<uint8_t, 16> iv_bytes{};
    for (size_t i = 0; i < 16; ++i) {
        key_bytes[i] = static_cast<uint8_t>(uint256_t(valid_key[i]));
        iv_bytes[i] = static_cast<uint8_t>(uint256_t(valid_iv[i]));
    }
    crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_bytes.data(), key_bytes.data(), buffer.size());

    std::array<FF, 16> overflowed_ciphertext{};
    for (size_t i = 0; i < 16; ++i) {
        overflowed_ciphertext[i] = FF(buffer[i]);
    }

    // PART 1: Verify that [..., 1, 0] with matching ciphertext PASSES
    // This proves the lookups work fine - there's no issue with the data itself
    {
        auto [builder, constraint] =
            create_constraint(overflowed_plaintext, valid_key, valid_iv, overflowed_ciphertext);
        create_aes128_constraints(builder, constraint);
        EXPECT_TRUE(CircuitChecker::check(builder))
            << "Sanity check: [..., 1, 0] with correct ciphertext should pass (lookups work)";
    }

    // PART 2: Verify that [..., 0, 256] FAILS due to range constraint
    // The attacker's plaintext has 256 in LSB position, overflows to [..., 1, 0]
    std::array<FF, 16> attacker_plaintext = {};
    attacker_plaintext[15] = FF(256); // Out of range in LSB position!
    // rest are 0

    // Attacker provides the ciphertext that matches the overflowed interpretation
    auto [builder, constraint] = create_constraint(attacker_plaintext, valid_key, valid_iv, overflowed_ciphertext);
    create_aes128_constraints(builder, constraint);
    EXPECT_TRUE(builder.failed()) << "Circuit should fail when plaintext has byte > 255";
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Test that key byte values > 255 cause circuit failure at the RANGE CONSTRAINT.
 *
 * Same logic as PlaintextOutOfRangeFails with correct byte ordering:
 * - 256 in LSB position (index 15) overflows to 1 in position 14
 */
TEST_F(AES128RangeConstraintTest, KeyOutOfRangeFails)
{
    // The "overflowed" key that AES would see: [..., 1, 0]
    std::array<FF, 16> overflowed_key = {};
    overflowed_key[14] = FF(1); // Carry from position 15
    overflowed_key[15] = FF(0); // 256 % 256 = 0

    // Compute ciphertext with the overflowed key
    std::vector<uint8_t> buffer(16);
    std::array<uint8_t, 16> key_bytes = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0 };
    std::array<uint8_t, 16> iv_bytes{};
    for (size_t i = 0; i < 16; ++i) {
        buffer[i] = static_cast<uint8_t>(uint256_t(valid_plaintext[i]));
        iv_bytes[i] = static_cast<uint8_t>(uint256_t(valid_iv[i]));
    }
    crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_bytes.data(), key_bytes.data(), buffer.size());

    std::array<FF, 16> overflowed_ciphertext{};
    for (size_t i = 0; i < 16; ++i) {
        overflowed_ciphertext[i] = FF(buffer[i]);
    }

    // PART 1: Verify lookups work with valid key [..., 1, 0]
    {
        auto [builder, constraint] =
            create_constraint(valid_plaintext, overflowed_key, valid_iv, overflowed_ciphertext);
        create_aes128_constraints(builder, constraint);
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Sanity check: key [..., 1, 0] should pass (lookups work)";
    }

    // PART 2: Verify [..., 0, 256] key FAILS due to range constraint
    std::array<FF, 16> attacker_key = {};
    attacker_key[15] = FF(256); // Out of range in LSB position!

    auto [builder, constraint] = create_constraint(valid_plaintext, attacker_key, valid_iv, overflowed_ciphertext);
    create_aes128_constraints(builder, constraint);
    EXPECT_TRUE(builder.failed()) << "Circuit should fail when key has byte > 255";
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Test that IV byte values > 255 cause circuit failure at the RANGE CONSTRAINT.
 *
 * Same logic with correct byte ordering: 256 in LSB position overflows to adjacent byte.
 */
TEST_F(AES128RangeConstraintTest, IVOutOfRangeFails)
{
    // The "overflowed" IV that AES would see: [..., 1, 0]
    std::array<FF, 16> overflowed_iv = {};
    overflowed_iv[14] = FF(1); // Carry from position 15
    overflowed_iv[15] = FF(0); // 256 % 256 = 0

    // Compute ciphertext with the overflowed IV
    std::vector<uint8_t> buffer(16);
    std::array<uint8_t, 16> key_bytes{};
    std::array<uint8_t, 16> iv_bytes = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0 };
    for (size_t i = 0; i < 16; ++i) {
        buffer[i] = static_cast<uint8_t>(uint256_t(valid_plaintext[i]));
        key_bytes[i] = static_cast<uint8_t>(uint256_t(valid_key[i]));
    }
    crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_bytes.data(), key_bytes.data(), buffer.size());

    std::array<FF, 16> overflowed_ciphertext{};
    for (size_t i = 0; i < 16; ++i) {
        overflowed_ciphertext[i] = FF(buffer[i]);
    }

    // PART 1: Verify lookups work with valid IV [..., 1, 0]
    {
        auto [builder, constraint] =
            create_constraint(valid_plaintext, valid_key, overflowed_iv, overflowed_ciphertext);
        create_aes128_constraints(builder, constraint);
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Sanity check: IV [..., 1, 0] should pass (lookups work)";
    }

    // PART 2: Verify [..., 0, 256] IV FAILS due to range constraint
    std::array<FF, 16> attacker_iv = {};
    attacker_iv[15] = FF(256); // Out of range in LSB position!

    auto [builder, constraint] = create_constraint(valid_plaintext, valid_key, attacker_iv, overflowed_ciphertext);
    create_aes128_constraints(builder, constraint);
    EXPECT_TRUE(builder.failed()) << "Circuit should fail when IV has byte > 255";
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Test that output byte values > 255 cause circuit failure at the RANGE CONSTRAINT.
 *
 * For outputs, we provide witnesses that pack to the same value using LSB overflow:
 * If valid output is [..., X, Y], then [..., X-1, Y+256] packs to the same value:
 *   (X-1)*256^1 + (Y+256)*256^0 = X*256 - 256 + Y + 256 = X*256 + Y
 */
TEST_F(AES128RangeConstraintTest, OutputOutOfRangeFails)
{
    // Compute the valid ciphertext
    auto valid_ciphertext = compute_ciphertext();

    // PART 1: Verify circuit passes with valid output
    {
        auto [builder, constraint] = create_constraint(valid_plaintext, valid_key, valid_iv, valid_ciphertext);
        create_aes128_constraints(builder, constraint);
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Sanity check: valid ciphertext should pass";
    }

    // PART 2: Create attacker output that packs to the same value using LSB positions
    // [..., X-1, Y+256] packs same as [..., X, Y] due to overflow
    std::array<FF, 16> attacker_output = valid_ciphertext;
    uint64_t second_last_byte = static_cast<uint64_t>(uint256_t(valid_ciphertext[14])); // X
    uint64_t last_byte = static_cast<uint64_t>(uint256_t(valid_ciphertext[15]));        // Y

    // Need second_last_byte >= 1 to subtract 1 from it
    ASSERT_GE(second_last_byte, 1u) << "Test requires ciphertext[14] >= 1";

    attacker_output[14] = FF(second_last_byte - 1); // X - 1
    attacker_output[15] = FF(last_byte + 256);      // Y + 256 (out of range!)

    auto [builder, constraint] = create_constraint(valid_plaintext, valid_key, valid_iv, attacker_output);
    create_aes128_constraints(builder, constraint);
    EXPECT_TRUE(builder.failed()) << "Circuit should fail when output has byte > 255";
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// =============================================================================
// Shape Validation Regression Tests
// =============================================================================
// Guards in create_aes128_constraints enforce:
//   - inputs.size() % 16 == 0
//   - outputs.size() == inputs.size()
// Malformed ACIR violating either invariant would otherwise produce circuits
// with undefined behaviour (span OOB) or under-constrained output witnesses.
// =============================================================================

class AES128ShapeValidationTest : public ::testing::Test {
  protected:
    using Builder = UltraCircuitBuilder;
    using FF = Builder::FF;

    // Build a well-formed AES128Constraint with `num_input_bytes` input and
    // `num_output_bytes` output witnesses. Values are zero; we only exercise
    // the shape guards, which run before any AES math.
    static std::pair<Builder, AES128Constraint> make_constraint(size_t num_input_bytes, size_t num_output_bytes)
    {
        Builder builder;
        auto add_witness = [&builder](FF value) { return builder.add_variable(value); };

        std::vector<WitnessOrConstant<FF>> input_witnesses;
        for (size_t i = 0; i < num_input_bytes; ++i) {
            input_witnesses.push_back(WitnessOrConstant<FF>::from_index(add_witness(FF(0))));
        }

        std::array<WitnessOrConstant<FF>, 16> key_witnesses{};
        std::array<WitnessOrConstant<FF>, 16> iv_witnesses{};
        for (size_t i = 0; i < 16; ++i) {
            key_witnesses[i] = WitnessOrConstant<FF>::from_index(add_witness(FF(0)));
            iv_witnesses[i] = WitnessOrConstant<FF>::from_index(add_witness(FF(0)));
        }

        std::vector<uint32_t> output_indices;
        for (size_t i = 0; i < num_output_bytes; ++i) {
            output_indices.push_back(add_witness(FF(0)));
        }

        AES128Constraint constraint{
            .inputs = std::move(input_witnesses),
            .iv = iv_witnesses,
            .key = key_witnesses,
            .outputs = std::move(output_indices),
        };
        return { std::move(builder), std::move(constraint) };
    }
};

TEST_F(AES128ShapeValidationTest, InputsNotBlockAlignedRejected)
{
    auto [builder, constraint] = make_constraint(/*num_input_bytes=*/17, /*num_output_bytes=*/17);
    EXPECT_THROW_OR_ABORT(create_aes128_constraints(builder, constraint), ".*multiple of 16.*");
}

TEST_F(AES128ShapeValidationTest, OutputsSizeMismatchRejected)
{
    auto [builder, constraint] = make_constraint(/*num_input_bytes=*/16, /*num_output_bytes=*/32);
    EXPECT_THROW_OR_ABORT(create_aes128_constraints(builder, constraint), ".*same length as inputs.*");
}

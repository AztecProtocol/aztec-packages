#include "sha256.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using namespace bb::stdlib;

namespace {
auto& engine = numeric::get_debug_randomness();
}

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Builder = TypeParam;                                                                                         \
    using field_ct = field_t<Builder>;                                                                                 \
    using witness_ct = witness_t<Builder>;

template <class Builder> class Sha256Test : public ::testing::Test {};

using BuilderTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
TYPED_TEST_SUITE(Sha256Test, BuilderTypes);

using bb::stdlib::test_utils::check_circuit_and_gate_count;

// Common test data: SHA-256 initial hash values (FIPS 180-4 section 5.3.3)
constexpr std::array<uint32_t, 8> SHA256_IV = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

// Padded block for "abc" (FIPS 180-4 section 5.1.1)
constexpr std::array<uint32_t, 16> ABC_PADDED_BLOCK = { 0x61626380, 0x00000000, 0x00000000, 0x00000000,
                                                        0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                        0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                        0x00000000, 0x00000000, 0x00000000, 0x00000018 };

// Expected output: SHA-256("abc") from NIST
constexpr std::array<uint32_t, 8> ABC_EXPECTED = { 0xba7816bf, 0x8f01cfea, 0x414140de, 0x5dae2223,
                                                   0xb00361a3, 0x96177a9c, 0xb410ff61, 0xf20015ad };

/**
 * @brief Test sha256_block against NIST vector one ("abc")
 *
 * This tests the compression function directly by manually padding the message
 * and comparing against the known NIST hash output.
 *
 * For "abc" (3 bytes):
 * - Padded block: "abc" + 0x80 + zeros + 64-bit length (24 bits)
 * - Single block since message fits in 55 bytes
 */
TYPED_TEST(Sha256Test, BlockNistVectorOne)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    // Verify native implementation first
    auto native_output = crypto::sha256_block(SHA256_IV, ABC_PADDED_BLOCK);
    for (size_t i = 0; i < 8; i++) {
        EXPECT_EQ(native_output[i], ABC_EXPECTED[i]) << "Native mismatch at index " << i;
    }

    // Create circuit witnesses
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, SHA256_IV[i]);
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_ct(&builder, ABC_PADDED_BLOCK[i]);
    }

    // Run circuit compression
    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    // Compare outputs
    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, ABC_EXPECTED[i]) << "Circuit mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 6703);
    EXPECT_EQ(builder.get_tables_size(), 33944);
}

/**
 * @brief Test sha256_block against NIST vector two (56-byte message)
 *
 * This tests chained compression by manually padding a two-block message
 * and comparing against the known NIST hash output.
 *
 * For "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (56 bytes):
 * - Block 1: message bytes + padding bit (0x80)
 * - Block 2: zeros + 64-bit length (448 bits = 0x1c0)
 */
TYPED_TEST(Sha256Test, BlockNistVectorTwo)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    constexpr std::array<uint32_t, 16> BLOCK_1 = {
        0x61626364, 0x62636465, 0x63646566, 0x64656667, // "abcd" "bcde" "cdef" "defg"
        0x65666768, 0x66676869, 0x6768696a, 0x68696a6b, // "efgh" "fghi" "ghij" "hijk"
        0x696a6b6c, 0x6a6b6c6d, 0x6b6c6d6e, 0x6c6d6e6f, // "ijkl" "jklm" "klmn" "lmno"
        0x6d6e6f70, 0x6e6f7071, 0x80000000, 0x00000000  // "mnop" "nopq" + padding bit
    };

    constexpr std::array<uint32_t, 16> BLOCK_2 = { 0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x000001c0 };

    constexpr std::array<uint32_t, 8> EXPECTED = { 0x248d6a61, 0xd20638b8, 0xe5c02693, 0x0c3e6039,
                                                   0xa33ce459, 0x64ff2167, 0xf6ecedd4, 0x19db06c1 };

    // Verify native implementation
    auto h_after_block1 = crypto::sha256_block(SHA256_IV, BLOCK_1);
    auto native_output = crypto::sha256_block(h_after_block1, BLOCK_2);
    for (size_t i = 0; i < 8; i++) {
        EXPECT_EQ(native_output[i], EXPECTED[i]) << "Native mismatch at index " << i;
    }

    // Circuit: first block
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, SHA256_IV[i]);
    }

    std::array<field_ct, 16> block1;
    for (size_t i = 0; i < 16; i++) {
        block1[i] = witness_ct(&builder, BLOCK_1[i]);
    }

    auto h_mid = SHA256<Builder>::sha256_block(h_init, block1);

    // Circuit: second block
    std::array<field_ct, 16> block2;
    for (size_t i = 0; i < 16; i++) {
        block2[i] = witness_ct(&builder, BLOCK_2[i]);
    }

    auto circuit_output = SHA256<Builder>::sha256_block(h_mid, block2);

    // Compare outputs
    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, EXPECTED[i]) << "Circuit mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 10649);
    EXPECT_EQ(builder.get_tables_size(), 33944);
}

/**
 * @brief Test sha256_block with all-constant inputs produces correct output with zero gates.
 *
 * When both h_init and input are circuit constants (not witnesses), every plookup operation
 * takes the constant path (no gate creation), and add_normalize_unsafe returns constants directly.
 */
TYPED_TEST(Sha256Test, BlockAllConstants)
{
    using Builder = TypeParam;
    using field_ct = field_t<Builder>;

    Builder builder;

    // Create all inputs as constants (with builder context)
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = field_ct(&builder, SHA256_IV[i]);
        ASSERT_TRUE(h_init[i].is_constant());
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = field_ct(&builder, ABC_PADDED_BLOCK[i]);
        ASSERT_TRUE(block[i].is_constant());
    }

    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, ABC_EXPECTED[i]) << "All-constant mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 0);
    EXPECT_EQ(builder.get_tables_size(), 0);
}

/**
 * @brief Test sha256_block with constant h_init and witness input block.
 *
 * This is the natural use case for the first block of a SHA-256 hash: the IV is known
 * at compile time, but the message is a witness. The constant h_init values take the
 * constant plookup path for their initial sparse form conversions, saving gates compared
 * to the all-witness case.
 */
TYPED_TEST(Sha256Test, BlockConstantHinitWitnessInput)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = field_ct(&builder, SHA256_IV[i]);
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_ct(&builder, ABC_PADDED_BLOCK[i]);
    }

    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, ABC_EXPECTED[i]) << "Constant h_init mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 6652);
    EXPECT_EQ(builder.get_tables_size(), 33944);
}

/**
 * @brief Test sha256_block with witness h_init and constant input block.
 *
 * This models the second block in a two-block hash where the intermediate hash state
 * is a witness (output of first compression) but the padding block is all constants.
 * The constant message words fold through extend_witness without creating lookup gates,
 * yielding significantly fewer gates than the all-witness case.
 */
TYPED_TEST(Sha256Test, BlockWitnessHinitConstantInput)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, SHA256_IV[i]);
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = field_ct(&builder, ABC_PADDED_BLOCK[i]);
    }

    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, ABC_EXPECTED[i]) << "Witness h_init mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 5523);
    EXPECT_EQ(builder.get_tables_size(), 13072);
}

/**
 * @brief Test sha256_block with interleaved constant and witness values within both arrays.
 *
 * Even-indexed h_init and input words are constants, odd-indexed are witnesses. This exercises
 * the mixed-input paths through plookup (some lookups constant, some witness), extend_witness
 * (lazy sparse conversion with mixed provenance), and add_normalize_unsafe (one constant operand,
 * one witness operand).
 */
TYPED_TEST(Sha256Test, BlockMixedConstantsAndWitnesses)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    // Even-indexed = constant, odd-indexed = witness
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        if (i % 2 == 0) {
            h_init[i] = field_ct(&builder, SHA256_IV[i]);
        } else {
            h_init[i] = witness_ct(&builder, SHA256_IV[i]);
        }
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        if (i % 2 == 0) {
            block[i] = field_ct(&builder, ABC_PADDED_BLOCK[i]);
        } else {
            block[i] = witness_ct(&builder, ABC_PADDED_BLOCK[i]);
        }
    }

    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, ABC_EXPECTED[i]) << "Mixed mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 6644);
    EXPECT_EQ(builder.get_tables_size(), 33944);
}

/**
 * @brief Test extend_witness with mixed constant and witness message words.
 *
 * Only input[0] and input[15] are witnesses; the rest are constants. This exercises
 * the lazy sparse conversion and context propagation in extend_witness when inputs
 * have mixed constantness.
 */
TYPED_TEST(Sha256Test, ExtendWitnessMixedInputs)
{
    STDLIB_TYPE_ALIASES

    Builder builder;

    // Make first and last words witnesses, rest constants
    std::array<field_ct, 16> input;
    for (size_t i = 0; i < 16; i++) {
        if (i == 0 || i == 15) {
            input[i] = witness_ct(&builder, ABC_PADDED_BLOCK[i]);
        } else {
            input[i] = field_ct(&builder, ABC_PADDED_BLOCK[i]);
        }
    }

    // Compute circuit extension
    std::array<field_ct, 64> w_ext = SHA256<Builder>::extend_witness(input);

    // Compute native extension for comparison
    std::array<uint32_t, 64> w_native;
    for (size_t i = 0; i < 16; i++) {
        w_native[i] = ABC_PADDED_BLOCK[i];
    }
    for (size_t i = 16; i < 64; i++) {
        uint32_t s0 = std::rotr(w_native[i - 15], 7) ^ std::rotr(w_native[i - 15], 18) ^ (w_native[i - 15] >> 3);
        uint32_t s1 = std::rotr(w_native[i - 2], 17) ^ std::rotr(w_native[i - 2], 19) ^ (w_native[i - 2] >> 10);
        w_native[i] = w_native[i - 16] + s0 + w_native[i - 7] + s1;
    }

    // Verify all 64 words match
    for (size_t i = 0; i < 64; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(w_ext[i].get_value()));
        EXPECT_EQ(circuit_val, w_native[i]) << "extend_witness mismatch at index " << i;
    }

    check_circuit_and_gate_count(builder, 3817);
    EXPECT_EQ(builder.get_tables_size(), 20872);
}

/**
 * @brief Test extend_witness constraints (boomerang attack regression)
 *
 * This security test verifies that SHA256::extend_witness() properly constrains
 * all 64 extended message schedule words. Modifying any word should cause
 * circuit failure.
 *
 */
TYPED_TEST(Sha256Test, ExtendWitnessTamperingFailure)
{
    STDLIB_TYPE_ALIASES

    BB_DISABLE_ASSERTS();

    Builder builder;
    std::array<field_ct, 16> input;

    // Create random input witnesses and ensure they are constrained
    for (size_t i = 0; i < 16; i++) {
        auto random32bits = engine.get_random_uint32();
        field_ct elt(witness_ct(&builder, fr(random32bits)));
        elt.fix_witness();
        input[i] = elt;
    }

    // Extend the witness
    std::array<field_ct, 64> w_ext = SHA256<Builder>::extend_witness(input);

    // Verify circuit is initially valid
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Try modifying each extended witness and verify circuit fails
    bool any_modification_passed = false;
    for (auto& single_extended_witness : w_ext) {
        auto random32bits = engine.get_random_uint32();
        uint32_t variable_index = single_extended_witness.get_witness_index();

        // Ensure our random value is different from current
        while (builder.get_variable(variable_index) == fr(random32bits)) {
            random32bits = engine.get_random_uint32();
        }

        auto backup = builder.get_variable(variable_index);
        builder.set_variable(variable_index, fr(random32bits));

        // Circuit should fail with modified witness
        if (CircuitChecker::check(builder)) {
            any_modification_passed = true;
        }

        builder.set_variable(variable_index, backup);
    }

    // If any modification didn't cause failure, we have a problem
    EXPECT_FALSE(any_modification_passed);
}

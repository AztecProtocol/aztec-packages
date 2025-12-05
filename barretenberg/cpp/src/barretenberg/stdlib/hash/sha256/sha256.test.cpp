#include "sha256.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using namespace bb::stdlib;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = UltraCircuitBuilder;
using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;

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
TEST(stdlib_sha256, test_sha256_block_NIST_vector_one)
{
    auto builder = Builder();

    // SHA-256 initial hash values (FIPS 180-4 section 5.3.3)
    constexpr std::array<uint32_t, 8> H_INIT = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    // Manually padded block for "abc" (FIPS 180-4 section 5.1.1)
    // Message "abc" = 0x616263
    // Pad: append 1 bit, then zeros, then 64-bit length
    // Block: 0x61626380 00000000 ... 00000000 00000018
    constexpr std::array<uint32_t, 16> PADDED_BLOCK = {
        0x61626380, // "abc" + padding bit
        0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
        0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
        0x00000018 // length in bits (24)
    };

    // Expected output: SHA-256("abc") from NIST
    constexpr std::array<uint32_t, 8> EXPECTED = { 0xba7816bf, 0x8f01cfea, 0x414140de, 0x5dae2223,
                                                   0xb00361a3, 0x96177a9c, 0xb410ff61, 0xf20015ad };

    // Verify native implementation first
    auto native_output = crypto::sha256_block(H_INIT, PADDED_BLOCK);
    for (size_t i = 0; i < 8; i++) {
        EXPECT_EQ(native_output[i], EXPECTED[i]) << "Native mismatch at index " << i;
    }

    // Create circuit witnesses
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, H_INIT[i]);
    }

    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_ct(&builder, PADDED_BLOCK[i]);
    }

    // Run circuit compression
    auto circuit_output = SHA256<Builder>::sha256_block(h_init, block);

    // Verify circuit correctness
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Compare outputs
    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, EXPECTED[i]) << "Circuit mismatch at index " << i;
    }

    info("sha256_block num gates = ", builder.get_num_finalized_gates_inefficient());
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
TEST(stdlib_sha256, test_sha256_block_NIST_vector_two)
{
    auto builder = Builder();

    // SHA-256 initial hash values
    constexpr std::array<uint32_t, 8> H_INIT = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    // First block: first 64 bytes of padded message
    // "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" = 56 bytes
    // After padding bit, need second block for length
    constexpr std::array<uint32_t, 16> BLOCK_1 = {
        0x61626364, 0x62636465, 0x63646566, 0x64656667, // "abcd" "bcde" "cdef" "defg"
        0x65666768, 0x66676869, 0x6768696a, 0x68696a6b, // "efgh" "fghi" "ghij" "hijk"
        0x696a6b6c, 0x6a6b6c6d, 0x6b6c6d6e, 0x6c6d6e6f, // "ijkl" "jklm" "klmn" "lmno"
        0x6d6e6f70, 0x6e6f7071, 0x80000000, 0x00000000  // "mnop" "nopq" + padding bit
    };

    // Second block: zeros + 64-bit length (448 bits = 0x1c0)
    constexpr std::array<uint32_t, 16> BLOCK_2 = { 0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x00000000,
                                                   0x00000000, 0x00000000, 0x00000000, 0x000001c0 };

    // Expected output from NIST
    constexpr std::array<uint32_t, 8> EXPECTED = { 0x248d6a61, 0xd20638b8, 0xe5c02693, 0x0c3e6039,
                                                   0xa33ce459, 0x64ff2167, 0xf6ecedd4, 0x19db06c1 };

    // Verify native implementation
    auto h_after_block1 = crypto::sha256_block(H_INIT, BLOCK_1);
    auto native_output = crypto::sha256_block(h_after_block1, BLOCK_2);
    for (size_t i = 0; i < 8; i++) {
        EXPECT_EQ(native_output[i], EXPECTED[i]) << "Native mismatch at index " << i;
    }

    // Circuit: first block
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, H_INIT[i]);
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

    // Verify circuit correctness
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Compare outputs
    for (size_t i = 0; i < 8; i++) {
        uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        EXPECT_EQ(circuit_val, EXPECTED[i]) << "Circuit mismatch at index " << i;
    }

    info("sha256_block (2 blocks) num gates = ", builder.get_num_finalized_gates_inefficient());
}

/**
 * @brief Test extend_witness constraints (boomerang attack regression)
 *
 * This security test verifies that SHA256::extend_witness() properly constrains
 * all 64 extended message schedule words. Modifying any word should cause
 * circuit failure.
 *
 */
TEST(stdlib_sha256, test_extend_witness_constraints)
{
    BB_DISABLE_ASSERTS();

    auto builder = Builder();
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

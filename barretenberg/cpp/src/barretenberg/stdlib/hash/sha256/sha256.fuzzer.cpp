#include "sha256.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <array>
#include <cassert>
#include <cstdint>

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Fuzzer for SHA-256 compression function (sha256_block)
 *
 * Tests the circuit implementation of sha256_block against the native crypto::sha256_block.
 * This tests the primitive exposed to ACIR for the Sha256Compression opcode.
 *
 * Input: 96 bytes representing h_init (8 x 32-bit) + block (16 x 32-bit), big-endian
 * The fuzzer:
 * 1. Interprets input as native SHA-256 state and message block
 * 2. Runs native compression via crypto::sha256_block
 * 3. Runs circuit compression via SHA256::sha256_block
 * 4. Verifies the circuit is valid
 * 5. Asserts that the native and circuit results are identical
 */

// Convert 4 bytes to uint32_t (big-endian, as per SHA-256 spec)
static uint32_t bytes_to_uint32(const uint8_t* bytes)
{
    return (static_cast<uint32_t>(bytes[0]) << 24) | (static_cast<uint32_t>(bytes[1]) << 16) |
           (static_cast<uint32_t>(bytes[2]) << 8) | static_cast<uint32_t>(bytes[3]);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    // SHA-256 compression input: 32 bytes h_init (8 x uint32) + 64 bytes block (16 x uint32)
    constexpr size_t SHA256_BLOCK_INPUT_SIZE = 96;
    if (Size < SHA256_BLOCK_INPUT_SIZE) {
        return 0;
    }

    // Parse h_init (8 x 32-bit words) from first 32 bytes
    std::array<uint32_t, 8> h_init_native;
    for (size_t i = 0; i < 8; i++) {
        h_init_native[i] = bytes_to_uint32(Data + i * 4);
    }

    // Parse block (16 x 32-bit words) from next 64 bytes
    std::array<uint32_t, 16> block_native;
    for (size_t i = 0; i < 16; i++) {
        block_native[i] = bytes_to_uint32(Data + 32 + i * 4);
    }

    // Compute native result
    [[maybe_unused]] auto expected_output = crypto::sha256_block(h_init_native, block_native);

    // Build circuit with compression
    UltraCircuitBuilder builder;

    // Convert state to circuit field elements
    std::array<field_t<UltraCircuitBuilder>, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_t<UltraCircuitBuilder>(&builder, h_init_native[i]);
    }

    std::array<field_t<UltraCircuitBuilder>, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_t<UltraCircuitBuilder>(&builder, block_native[i]);
    }

    // Run circuit compression
    auto circuit_output = SHA256<UltraCircuitBuilder>::sha256_block(h_init, block);

    // Verify circuit correctness
    assert(CircuitChecker::check(builder));

    // Compare outputs
    for (size_t i = 0; i < 8; i++) {
        [[maybe_unused]] uint32_t circuit_val = static_cast<uint32_t>(uint256_t(circuit_output[i].get_value()));
        assert(circuit_val == expected_output[i]);
    }

    return 0;
}

#include "keccak.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <vector>

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Fuzzer for Keccak-f1600 permutation (permutation_opcode)
 *
 * Tests the circuit implementation of permutation_opcode against the native ethash_keccakf1600.
 * This tests the primitive exposed to ACIR for the keccakf1600 opcode.
 *
 * Input: 200 bytes representing a Keccak-f1600 state (25 lanes of 64 bits each)
 * The fuzzer:
 * 1. Interprets input as native Keccak state
 * 2. Runs native permutation via ethash_keccakf1600
 * 3. Runs circuit permutation via keccak::permutation_opcode
 * 4. Asserts both produce identical results
 * 5. Verifies the circuit is valid
 */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    // Keccak-f1600 state is 25 lanes of 64 bits = 200 bytes
    constexpr size_t KECCAK_STATE_SIZE = 200;
    if (Size < KECCAK_STATE_SIZE) {
        return 0;
    }

    // Convert input bytes to native state (25 x uint64_t)
    std::array<uint64_t, 25> native_state;
    std::memcpy(native_state.data(), Data, KECCAK_STATE_SIZE);

    // Run native permutation
    std::array<uint64_t, 25> expected_state = native_state;
    ethash_keccakf1600(expected_state.data());

    // Build circuit with permutation
    UltraCircuitBuilder builder;

    // Convert state to circuit field elements
    std::array<field_t<UltraCircuitBuilder>, 25> circuit_state;
    for (size_t i = 0; i < 25; i++) {
        circuit_state[i] = witness_t<UltraCircuitBuilder>(&builder, native_state[i]);
    }

    // Run circuit permutation
    auto circuit_output = keccak<UltraCircuitBuilder>::permutation_opcode(circuit_state, &builder);

    // Verify circuit correctness
    assert(CircuitChecker::check(builder));

    // Compare outputs
    for (size_t i = 0; i < 25; i++) {
        uint64_t circuit_value = static_cast<uint64_t>(circuit_output[i].get_value());
        assert(circuit_value == expected_state[i]);
    }

    return 0;
}

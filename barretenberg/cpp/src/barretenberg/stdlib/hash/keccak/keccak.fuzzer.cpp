#include "keccak.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

using namespace bb;
using namespace bb::stdlib;

#ifdef FUZZING_SHOW_INFORMATION
#define PRINT_STATE(header, bs)                                                                                        \
    {                                                                                                                  \
        std::cout << header;                                                                                           \
        for (const uint64_t& x : bs) {                                                                                 \
            std::cout << "0x" << std::hex << std::uppercase << std::setw(16) << std::setfill('0') << x << " "          \
                      << std::dec;                                                                                     \
        }                                                                                                              \
        std::cout << std::endl;                                                                                        \
    }
#else
#define PRINT_STATE(header, bs)
#endif

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

    PRINT_STATE("Input: ", native_state);

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

    std::array<uint64_t, 25> circuit_output_u;
    for (size_t i = 0; i < 25; i++) {
        circuit_output_u[i] = static_cast<uint64_t>(circuit_output[i].get_value());
    }

    PRINT_STATE("Circuit output: ", circuit_output_u);
    PRINT_STATE("Expected:       ", expected_state);

    // Compare outputs
    BB_ASSERT(circuit_output_u == expected_state);

    // Verify circuit correctness
    BB_ASSERT(CircuitChecker::check(builder));
    return 0;
}

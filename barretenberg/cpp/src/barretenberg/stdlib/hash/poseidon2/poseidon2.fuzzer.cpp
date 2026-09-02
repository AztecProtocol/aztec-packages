/**
 * @brief Differential fuzzer for Poseidon2 hash
 *
 * Tests the circuit implementation of poseidon2::hash against the native crypto::Poseidon2::hash.
 *
 * Input: raw bytes interpreted as 32-byte field elements (big-endian)
 * The fuzzer:
 * 1. Parses input into 1+ field elements (each 32 bytes, reduced mod p)
 * 2. Runs native hash via crypto::Poseidon2
 * 3. Runs circuit hash via stdlib::poseidon2
 * 4. Asserts both produce identical results
 * 5. Verifies the circuit is valid
 */

#include "poseidon2.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <cstdint>
#include <cstring>
#include <vector>

using namespace bb;
using namespace bb::stdlib;
using native_poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

#ifdef FUZZING_SHOW_INFORMATION
#define PRINT_FIELD_ARRAY(header, f)                                                                                   \
    {                                                                                                                  \
        std::cout << header << f << std::endl;                                                                         \
    }
#else
#define PRINT_FIELD_ARRAY(header, f)
#endif

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    constexpr size_t FIELD_SIZE = 32;

    if (Size < FIELD_SIZE) {
        return 0;
    }

    size_t num_elements = Size / FIELD_SIZE;

    std::vector<fr> native_inputs;
    native_inputs.reserve(num_elements);

    for (size_t i = 0; i < num_elements; i++) {
        native_inputs.push_back(fr::serialize_from_buffer(Data + i * FIELD_SIZE));
        PRINT_FIELD_ARRAY("input[" << i << "] = ", native_inputs.back());
    }

    auto expected = native_poseidon2::hash(native_inputs);

    UltraCircuitBuilder builder;
    std::vector<field_t<UltraCircuitBuilder>> circuit_inputs;
    circuit_inputs.reserve(num_elements);

    for (const auto& input : native_inputs) {
        circuit_inputs.emplace_back(witness_t<UltraCircuitBuilder>(&builder, input));
    }

    auto circuit_result = poseidon2<UltraCircuitBuilder>::hash(circuit_inputs);

    PRINT_FIELD_ARRAY("expected: ", expected);
    PRINT_FIELD_ARRAY("circuit:  ", circuit_result.get_value());

    BB_ASSERT(circuit_result.get_value() == expected, "poseidon2: circuit output != native output");
    BB_ASSERT(CircuitChecker::check(builder), "poseidon2: circuit check failed");

    return 0;
}

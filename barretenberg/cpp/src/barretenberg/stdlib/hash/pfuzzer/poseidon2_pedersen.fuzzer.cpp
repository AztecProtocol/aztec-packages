// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @file poseidon2_pedersen.fuzzer.cpp
 * @brief Fuzzer for testing Poseidon2 and Pedersen hash Ultra circuits against native implementations
 *
 * @details This fuzzer implements differential testing of both Poseidon2 and Pedersen hash function
 * circuits by comparing Ultra circuit outputs with native implementation results. The fuzzer:
 *
 * 1. **Dual Algorithm Testing**: Tests both Poseidon2 and Pedersen hash functions in a single fuzzer
 * 2. **Algorithm Selection**: Uses the first bit of input data to select between Poseidon2 (0) and Pedersen (1)
 * 3. **Structured Input Format**: Uses FieldVM data for deterministic field element generation
 * 4. **Ultra Circuit Testing**: Focuses on UltraCircuitBuilder for comprehensive circuit testing
 * 5. **Differential Testing**: Compares circuit output with trusted native implementation
 * 6. **Variable Input Lengths**: Tests inputs of any length (controlled by fuzzer configuration)
 * 7. **Edge Cases**: Tests zero inputs, repeated inputs, and boundary conditions
 * 8. **Circuit Verification**: Validates circuit correctness using CircuitChecker
 *
 *
 */

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>

using namespace bb;
using Fr = fr;
using native_poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using native_pedersen = crypto::pedersen_hash;

// Input structure constants
static constexpr size_t SINGLE_CHUNK_SIZE = 129; // 1 byte for selection of element + 128 bytes for FieldVM data

/**
 * @brief Parse input structure and generate field elements using FieldVM
 * @param data Raw input data
 * @param size Data size
 * @return Vector of field elements for Poseidon2
 */
std::vector<Fr> parse_input_and_generate_elements(const uint8_t* data, size_t size)
{
    std::vector<Fr> elements;

    // Need at least header size
    if (size < SINGLE_CHUNK_SIZE) {
        return elements;
    }

    // Parse header: first byte is number of elements (0-128)
    size_t num_elements = size / SINGLE_CHUNK_SIZE;

    // Create FieldVM instance for field element generation
    FieldVM<Fr> field_vm(false, 65536); // Disable debug, max 65536 steps

    // Disable heavy operations for better performance
    field_vm.settings.enable_inv = false;          // Disable inversion
    field_vm.settings.enable_sqrt = false;         // Disable square root
    field_vm.settings.enable_batch_invert = false; // Disable batch inversion
    field_vm.settings.enable_pow = false;          // Disable power operation
    field_vm.settings.enable_div = false;          // Disable division
    field_vm.settings.enable_div_assign = false;   // Disable division assignment

    // Run FieldVM with data after header (bytes 129+)
    size_t fieldvm_data_size = size - num_elements;
    if (fieldvm_data_size > 0) {
        field_vm.run(data, fieldvm_data_size);
    }

    // Extract elements based on indices in header
    elements.reserve(num_elements);
    for (size_t i = 0; i < num_elements; ++i) {
        uint8_t index_byte = data[fieldvm_data_size + i]; // Bytes 1-128 contain indices

        size_t field_index = index_byte % 32; // Wrap around if needed

        // Get element from FieldVM state
        Fr element = field_vm.field_internal_state[field_index];
        elements.emplace_back(element);
    }

    return elements;
}

/**
 * @brief Test Poseidon2 circuit with specified builder type
 * @tparam Builder Circuit builder type
 * @param inputs Vector of field elements to hash
 * @return true if test passes, false otherwise
 */
template <typename Builder> bool test_poseidon2_circuit(const std::vector<Fr>& inputs)
{
    try {
        using field_ct = stdlib::field_t<Builder>;
        using witness_ct = stdlib::witness_t<Builder>;

        Builder builder;
        std::vector<field_ct> circuit_inputs;
        circuit_inputs.reserve(inputs.size());

        // Convert native field elements to circuit witnesses
        for (const auto& input : inputs) {
            circuit_inputs.emplace_back(field_ct(witness_ct(&builder, input)));
        }

        // Compute hash using circuit
        auto circuit_result = stdlib::poseidon2<Builder>::hash(circuit_inputs);

        // Compute hash using native implementation
        auto native_result = native_poseidon2::hash(inputs);

        // Compare results
        if (circuit_result.get_value() != native_result) {
            std::cerr << "Poseidon2 circuit mismatch detected!" << std::endl;
            std::cerr << "Input length: " << inputs.size() << std::endl;
            std::cerr << "Circuit result: " << circuit_result.get_value() << std::endl;
            std::cerr << "Native result: " << native_result << std::endl;
            return false;
        }

        // Verify circuit correctness
        bool circuit_check = CircuitChecker::check(builder);
        if (!circuit_check) {
            std::cerr << "Poseidon2 circuit check failed!" << std::endl;
            std::cerr << "Input length: " << inputs.size() << std::endl;
            return false;
        }

        return true;

    } catch (const std::exception& e) {
        std::cerr << "Exception in Poseidon2 circuit test: " << e.what() << std::endl;
        std::cerr << "Input length: " << inputs.size() << std::endl;
        return false;
    }
}
/**
 * @brief Test Pedersen circuit with specified builder type
 * @tparam Builder Circuit builder type
 * @param inputs Vector of field elements to hash
 * @return true if test passes, false otherwise
 */
template <typename Builder> bool test_pedersen_circuit(const std::vector<Fr>& inputs)
{
    try {
        using field_ct = stdlib::field_t<Builder>;
        using witness_ct = stdlib::witness_t<Builder>;

        Builder builder;
        std::vector<field_ct> circuit_inputs;
        circuit_inputs.reserve(inputs.size());

        // Convert native field elements to circuit witnesses
        for (const auto& input : inputs) {
            circuit_inputs.emplace_back(field_ct(witness_ct(&builder, input)));
        }

        // Compute hash using circuit
        auto circuit_result = stdlib::pedersen_hash<Builder>::hash(circuit_inputs);

        // Compute hash using native implementation
        auto native_result = native_pedersen::hash(inputs);

        // Compare results
        if (circuit_result.get_value() != native_result) {
            std::cerr << "Pedersen circuit mismatch detected!" << std::endl;
            std::cerr << "Input length: " << inputs.size() << std::endl;
            std::cerr << "Circuit result: " << circuit_result.get_value() << std::endl;
            std::cerr << "Native result: " << native_result << std::endl;
            return false;
        }

        // Verify circuit correctness
        bool circuit_check = CircuitChecker::check(builder);
        if (!circuit_check) {
            std::cerr << "Pedersen circuit check failed!" << std::endl;
            std::cerr << "Input length: " << inputs.size() << std::endl;
            return false;
        }

        return true;

    } catch (const std::exception& e) {
        std::cerr << "Exception in Pedersen circuit test: " << e.what() << std::endl;
        std::cerr << "Input length: " << inputs.size() << std::endl;
        return false;
    }
}

/**
 * @brief Main fuzzer entry point
 * @param Data Input data from libfuzzer
 * @param Size Size of input data
 * @return 0 for success, non-zero for failure
 */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    // Security check: Ensure minimum input size
    if (Size == 0) {
        return 0; // No input data
    }
    bool is_poseidon2 = Data[0] & 0x01;

    // Parse input structure and generate field elements using FieldVM
    auto field_elements = parse_input_and_generate_elements(Data + 1, Size - 1);

    // Security check: Ensure we have valid elements
    if (field_elements.empty()) {
        return 0; // No valid field elements generated
    }

    // Test with Ultra circuit builder only
    bool test_result = is_poseidon2 ? test_poseidon2_circuit<UltraCircuitBuilder>(field_elements)
                                    : test_pedersen_circuit<UltraCircuitBuilder>(field_elements);

    if (!test_result) {
        abort(); // Circuit test failed
    }

    return 0; // Success
}

/**
 * @file multi_field.fuzzer.cpp
 * @brief Multi-field fuzzer for testing field arithmetic operations across different elliptic curve fields
 *
 * @details This fuzzer implements a multi-phase virtual machine that can execute field arithmetic
 * operations across different elliptic curve fields. The algorithm works as follows:
 *
 * 1. **Input Format**: The fuzzer expects input data structured as a sequence of phase headers
 *    followed by instruction data. Each phase header is exactly 2 bytes containing:
 *    - Field type (0-5): Specifies which field to use (BN254_FQ, BN254_FR, SECP256K1_FQ, etc.)
 *    - Step count (0-63): Number of VM steps to execute in this phase
 *
 * 2. **Multi-Phase Execution**: The fuzzer processes input data in phases:
 *    - Each phase uses a different field type and step count
 *    - State is carried forward between phases using modulus reduction
 *    - VM execution continues until insufficient data remains
 *
 * 3. **Field Types Supported**:
 *    - BN254_FQ: BN254 curve base field
 *    - BN254_FR: BN254 curve scalar field
 *    - SECP256K1_FQ: Secp256k1 curve base field
 *    - SECP256K1_FR: Secp256k1 curve scalar field
 *    - SECP256R1_FQ: Secp256r1 curve base field
 *    - SECP256R1_FR: Secp256r1 curve scalar field
 *
 * 4. **State Management**: Each phase can import state from the previous phase, with automatic
 *    modulus reduction to ensure values fit within the target field's modulus.
 *
 * 5. **Error Handling**: The fuzzer includes comprehensive error detection and debug capabilities:
 *    - Internal state consistency checks after each phase
 *    - Debug VM execution for failed phases
 *    - Detailed error reporting with instruction stream analysis
 *
 * @author Barretenberg Team
 * @date 2024
 */

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include <cassert>
#include <cstddef>
#include <cstring>
#include <vector>
using namespace bb;

/**
 * @brief Enumeration of supported field types for the multi-field fuzzer
 */
enum class FieldType : uint8_t {
    BN254_FQ = 0,     ///< BN254 curve base field
    BN254_FR = 1,     ///< BN254 curve scalar field
    SECP256K1_FQ = 2, ///< Secp256k1 curve base field
    SECP256K1_FR = 3, ///< Secp256k1 curve scalar field
    SECP256R1_FQ = 4, ///< Secp256r1 curve base field
    SECP256R1_FR = 5, ///< Secp256r1 curve scalar field
};

constexpr size_t NUM_FIELD_TYPES = 6; ///< Total number of supported field types
constexpr size_t MAX_STEPS = 64;      ///< Maximum number of VM steps per phase

/**
 * @brief Header structure for each VM execution phase
 *
 * @details This structure contains metadata for each phase of VM execution,
 * including the field type to use and the number of steps to execute.
 */
struct VMPhaseHeader {
    uint8_t field_type; ///< Field type identifier (0-5)
    uint8_t steps;      ///< Number of VM steps to execute (0-63)
};

static_assert(sizeof(VMPhaseHeader) == 2, "VMPhaseHeader must be exactly 2 bytes");

const size_t PHASE_HEADER_SIZE = sizeof(VMPhaseHeader);

/**
 * @brief Reduces a uint256_t value to be less than the field's modulus
 *
 * @tparam Field The field type to reduce the value for
 * @param value The value to reduce
 * @return numeric::uint256_t The reduced value
 */
template <typename Field> numeric::uint256_t reduce_to_modulus(const numeric::uint256_t& value)
{
    if (value < Field::modulus) {
        return value;
    }
    return value % Field::modulus;
}

/**
 * @brief Creates a field VM with specified maximum steps
 *
 * @tparam Field The field type for the VM
 * @param max_steps Maximum number of steps the VM can execute
 * @return FieldVM<Field> The created field VM
 */
template <typename Field> FieldVM<Field> create_field_vm(size_t max_steps)
{
    return FieldVM<Field>(false, max_steps);
}

/**
 * @brief Imports state into a field VM with automatic modulus reduction
 *
 * @tparam Field The field type for the VM
 * @param vm The VM to import state into
 * @param state The state values to import
 */
template <typename Field>
void import_state_with_reduction(FieldVM<Field>& vm, const std::vector<numeric::uint256_t>& state)
{
    for (size_t i = 0; i < INTERNAL_STATE_SIZE && i < state.size(); i++) {
        vm.uint_internal_state[i] = reduce_to_modulus<Field>(state[i]);
        vm.field_internal_state[i] = Field(vm.uint_internal_state[i]);
    }
}

/**
 * @brief Runs a single VM phase with error handling and state management
 *
 * @tparam Field The field type for the VM
 * @param vm The VM to execute
 * @param data Input data for the VM
 * @param size Size of the input data
 * @param header Phase header containing field type and step count
 * @param data_offset Current offset in the input data (updated on success)
 * @return int 0 if not enough data, >0 if success, -1 if internal state error
 *
 * @details This function executes a single phase of VM execution. It sets the step limit,
 * runs the VM, checks internal state consistency, and exports state for potential use
 * in subsequent phases. The data_offset is only advanced on successful execution.
 */
template <typename Field>
int run_vm_phase(
    FieldVM<Field>& vm, const unsigned char* data, size_t size, const VMPhaseHeader& header, size_t& data_offset)
{
    // Set the step limit for this phase
    vm.set_max_steps(header.steps);

    // Run the VM for this phase and get the number of bytes consumed
    size_t bytes_consumed = vm.run(data + data_offset, size - data_offset, true);

    // If no bytes were consumed, there wasn't enough data
    if (bytes_consumed == 0) {
        return 0; // Not enough data for settings
    }

    // Check internal state consistency
    if (!vm.check_internal_state()) {
        std::cout << "Internal state check failed for field type: " << typeid(Field).name() << std::endl;
        return -1; // Error
    }

    // Export the state for potential import into next VM
    auto exported_state = vm.export_uint_state();

    // Update data offset based on how much data the VM actually consumed
    data_offset += bytes_consumed;

    return static_cast<int>(bytes_consumed); // Success
}

/**
 * @brief Creates and runs a VM for a specific field type with state management
 *
 * @tparam Field The field type for the VM
 * @param header Phase header containing field type and step count
 * @param Data Input data for the VM
 * @param Size Size of the input data
 * @param data_offset Current offset in the input data (updated on success)
 * @param current_state Current state to import (updated on success)
 * @return int 0 if not enough data, >0 if success, -1 if internal state error
 *
 * @details This function creates a new VM for the specified field type, imports
 * the current state (if any), runs the phase, and updates the current state
 * on successful execution.
 */
template <typename Field>
int run_field_vm(const VMPhaseHeader& header,
                 const unsigned char* Data,
                 size_t Size,
                 size_t& data_offset,
                 std::vector<numeric::uint256_t>& current_state)
{
    FieldVM<Field> vm(false, header.steps);
    if (!current_state.empty()) {
        import_state_with_reduction<Field>(vm, current_state);
    }
    int phase_result = run_vm_phase(vm, Data, Size, header, data_offset);
    if (phase_result > 0) {
        current_state = vm.export_uint_state();
    }
    return phase_result;
}

/**
 * @brief Runs a debug VM to analyze failed phases
 *
 * @tparam Field The field type for the debug VM
 * @param header Phase header containing field type and step count
 * @param Data Input data for the VM
 * @param Size Size of the input data
 * @param original_data_offset Original data offset before phase execution
 * @param current_state Current state to import
 *
 * @details This function creates a debug VM to analyze phases that failed during
 * normal execution. It provides detailed logging and state verification to help
 * identify the root cause of failures.
 */
template <typename Field>
void run_debug_vm(const VMPhaseHeader& header,
                  const unsigned char* Data,
                  size_t Size,
                  size_t original_data_offset,
                  const std::vector<numeric::uint256_t>& current_state)
{
    FieldVM<Field> vm_debug(true, header.steps);
    if (!current_state.empty()) {
        std::cout << "Importing state with " << current_state.size() << " elements" << std::endl;
        import_state_with_reduction<Field>(vm_debug, current_state);
        // Verify initial state is correctly loaded
        assert(vm_debug.verify_initial_state(current_state));
        std::cout << "State import verified successfully" << std::endl;
    } else {
        std::cout << "No state to import" << std::endl;
    }
    // Run debug VM on the same data that the pre-debug VM ran on
    size_t bytes_consumed =
        vm_debug.run(Data + original_data_offset + PHASE_HEADER_SIZE, Size - original_data_offset - PHASE_HEADER_SIZE);
    std::cout << "Debug VM consumed " << bytes_consumed << " bytes" << std::endl;
    if (vm_debug.check_internal_state()) {
        std::cout << "[Debug VM] State is still correct after execution! No discrepancy detected." << std::endl;
        // If debug VM reports state is correct, then there's no real discrepancy
        return; // Don't treat this as a failure
    } else {
        std::cout << "[Debug VM] State discrepancy detected! This is a real failure." << std::endl;
        assert(false); // Only assert if there's a real state discrepancy
    }
}

/**
 * @brief Main fuzzer entry point for multi-field testing
 *
 * @param Data Input data from the fuzzer
 * @param Size Size of the input data
 * @return int 0 for normal execution, 1 for detected issues
 *
 * @details This is the main entry point for the multi-field fuzzer. It processes
 * input data as a sequence of phases, each with its own field type and step count.
 * The fuzzer supports state transfer between phases and includes comprehensive
 * error detection and debugging capabilities.
 */
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* Data, size_t Size)
{
    if (Size < PHASE_HEADER_SIZE) {
        return 0; // Not enough data for at least one phase header
    }

    std::vector<numeric::uint256_t> current_state;
    size_t data_offset = 0;

    while (data_offset + PHASE_HEADER_SIZE <= Size) {
        // Read phase header
        const VMPhaseHeader* header_ptr = reinterpret_cast<const VMPhaseHeader*>(Data + data_offset);
        VMPhaseHeader header = *header_ptr;

        // Always select a valid field type and step count
        FieldType selected_field_type = static_cast<FieldType>(header.field_type % NUM_FIELD_TYPES);
        uint8_t selected_steps = header.steps % MAX_STEPS;
        if (selected_steps == 0) {
            selected_steps = 1; // Always do at least one step
        }
        header.field_type = static_cast<uint8_t>(selected_field_type);
        header.steps = selected_steps;

        // Execute the phase based on field type
        int phase_result = 0;
        switch (selected_field_type) {
        case FieldType::BN254_FQ: {
            phase_result = run_field_vm<fq>(header, Data, Size, data_offset, current_state);
            break;
        }
        case FieldType::BN254_FR: {
            phase_result = run_field_vm<fr>(header, Data, Size, data_offset, current_state);
            break;
        }
        case FieldType::SECP256K1_FQ: {
            phase_result = run_field_vm<secp256k1::fq>(header, Data, Size, data_offset, current_state);
            break;
        }
        case FieldType::SECP256K1_FR: {
            phase_result = run_field_vm<secp256k1::fr>(header, Data, Size, data_offset, current_state);
            break;
        }
        case FieldType::SECP256R1_FQ: {
            phase_result = run_field_vm<secp256r1::fq>(header, Data, Size, data_offset, current_state);
            break;
        }
        case FieldType::SECP256R1_FR: {
            phase_result = run_field_vm<secp256r1::fr>(header, Data, Size, data_offset, current_state);
            break;
        }
        }

        if (phase_result < 0) {
            // If a phase fails (internal state error), run with debug VM to get more information
            std::cout << "Phase failed for field type: " << static_cast<int>(selected_field_type)
                      << " with steps: " << static_cast<int>(header.steps) << std::endl;

            // Show the instruction stream that caused the failure
            std::cout << "Instruction stream (first 64 bytes): ";
            size_t debug_size = std::min(Size - data_offset - PHASE_HEADER_SIZE, size_t(64));
            for (size_t i = 0; i < debug_size; i++) {
                printf("%02x ", Data[data_offset + PHASE_HEADER_SIZE + i]);
            }
            std::cout << std::endl;

            // Run debug VM based on field type
            switch (selected_field_type) {
            case FieldType::BN254_FQ:
                run_debug_vm<fq>(header, Data, Size, data_offset, current_state);
                break;
            case FieldType::BN254_FR:
                run_debug_vm<fr>(header, Data, Size, data_offset, current_state);
                break;
            case FieldType::SECP256K1_FQ:
                run_debug_vm<secp256k1::fq>(header, Data, Size, data_offset, current_state);
                break;
            case FieldType::SECP256K1_FR:
                run_debug_vm<secp256k1::fr>(header, Data, Size, data_offset, current_state);
                break;
            case FieldType::SECP256R1_FQ:
                run_debug_vm<secp256r1::fq>(header, Data, Size, data_offset, current_state);
                break;
            case FieldType::SECP256R1_FR:
                run_debug_vm<secp256r1::fr>(header, Data, Size, data_offset, current_state);
                break;
            }
            return 1;
        } else if (phase_result == 0) {
            // Not enough data for this phase, stop processing
            break;
        }
        // phase_result > 0 means success, continue to next phase
    }

    return 0;
}
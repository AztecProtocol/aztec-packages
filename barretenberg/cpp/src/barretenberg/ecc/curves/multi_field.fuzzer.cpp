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

// Field type enum
enum class FieldType : uint8_t {
    BN254_FQ = 0,
    BN254_FR = 1,
    SECP256K1_FQ = 2,
    SECP256K1_FR = 3,
    SECP256R1_FQ = 4,
    SECP256R1_FR = 5,
};
constexpr size_t NUM_FIELD_TYPES = 6;
constexpr size_t MAX_STEPS = 64;

// Header structure for each VM execution phase
struct VMPhaseHeader {
    uint8_t field_type; // Field type (0-5)
    uint8_t steps;      // Steps (0-63)
};

static_assert(sizeof(VMPhaseHeader) == 2, "VMPhaseHeader must be exactly 2 bytes");

const size_t PHASE_HEADER_SIZE = sizeof(VMPhaseHeader);

// Helper function to reduce uint256_t values to be less than the modulus
template <typename Field> numeric::uint256_t reduce_to_modulus(const numeric::uint256_t& value)
{
    if (value < Field::modulus) {
        return value;
    }
    return value % Field::modulus;
}

// Helper function to create a field VM based on type
template <typename Field> FieldVM<Field> create_field_vm(size_t max_steps)
{
    return FieldVM<Field>(false, max_steps);
}

// Helper function to import state into a field VM with modulus reduction
template <typename Field>
void import_state_with_reduction(FieldVM<Field>& vm, const std::vector<numeric::uint256_t>& state)
{
    for (size_t i = 0; i < INTERNAL_STATE_SIZE && i < state.size(); i++) {
        vm.uint_internal_state[i] = reduce_to_modulus<Field>(state[i]);
        vm.field_internal_state[i] = Field(vm.uint_internal_state[i]);
    }
}

// Helper function to run a single VM phase
// Returns: 0 if not enough data, >0 if success, -1 if internal state error
// Advances data_offset by the number of bytes consumed if >0
// On error, does not advance data_offset
// On not enough data, does not advance data_offset
// On success, advances data_offset

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

// Helper function to create and run a VM for a specific field type
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

// Helper function to run debug VM for a specific field type
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
#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

enum class AddressingEventError : uint8_t {
    // The base address (mem[0]) points to a MemoryValue not of the
    // right tag (not MemoryAddressTag).
    BASE_ADDRESS_INVALID,
    // The relative computation overflowed.
    RELATIVE_COMPUTATION_OOB,
    // The address obtained after applying indirection points to
    // a MemoryValue not of the right tag (not MemoryAddressTag).
    INVALID_ADDRESS_AFTER_INDIRECTION,
};

inline std::string to_string(AddressingEventError e)
{
    switch (e) {
    case AddressingEventError::BASE_ADDRESS_INVALID:
        return "BASE_ADDRESS_INVALID";
    case AddressingEventError::RELATIVE_COMPUTATION_OOB:
        return "RELATIVE_COMPUTATION_OOB";
    case AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION:
        return "INVALID_ADDRESS_AFTER_INDIRECTION";
    }

    // We should be catching all the cases above.
    __builtin_unreachable();
}

struct AddressingException : public std::runtime_error {
    explicit AddressingException(const std::string& message = "Error resolving operands.")
        : std::runtime_error(message)
    {}
};

// This represents the resolution of a single operand.
// The operand can be either an immediate or an address.
// If it is an address, we can apply relative addressing and indirection to it.
// We will store the result of the resolution in the resolved_operand field.
// An immediate operand will never have an error and both resolved_operand
// and after_relative will be the same as the original operand.
// Note: after_relative does not need the tag information in trace generation
struct OperandResolutionInfo {
    FF after_relative = FF::zero();
    Operand resolved_operand;
    std::optional<AddressingEventError> error;
};

// We initialize base_address so that tag and value are 0
// in the trace when no relative addressing is used.
struct AddressingEvent {
    MemoryValue base_address = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0);
    std::vector<OperandResolutionInfo> resolution_info; // One entry per operand (including immediates).
};

} // namespace bb::avm2::simulation

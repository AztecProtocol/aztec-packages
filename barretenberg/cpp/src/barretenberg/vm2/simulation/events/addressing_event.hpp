#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

enum class AddressingEventError {
    // The operand is not a valid address.
    OPERAND_INVALID_ADDRESS,
    // The base address is not a valid address.
    BASE_ADDRESS_INVALID_ADDRESS,
    // The relative computation overflowed.
    RELATIVE_COMPUTATION_OOB,
    // The address obtained after applying indirection is not a valid address.
    INDIRECT_INVALID_ADDRESS,
};

inline std::string to_string(AddressingEventError e)
{
    switch (e) {
    case AddressingEventError::OPERAND_INVALID_ADDRESS:
        return "OPERAND_INVALID_ADDRESS";
    case AddressingEventError::BASE_ADDRESS_INVALID_ADDRESS:
        return "BASE_ADDRESS_INVALID_ADDRESS";
    case AddressingEventError::RELATIVE_COMPUTATION_OOB:
        return "RELATIVE_COMPUTATION_OOB";
    case AddressingEventError::INDIRECT_INVALID_ADDRESS:
        return "INDIRECT_INVALID_ADDRESS";
    }

    // Only to please the compiler.
    return "UNKNOWN_ADDRESSING_ERROR";
}

struct AddressingException : public std::runtime_error {
    explicit AddressingException(AddressingEventError e, size_t operand_idx = 0)
        : std::runtime_error("Addressing error: " + to_string(e) + " at operand " + std::to_string(operand_idx))
        , error(e)
        , operand_idx(operand_idx)
    {}
    AddressingEventError error;
    size_t operand_idx;
};

// See https://docs.google.com/document/d/1EgFj0OQYZCWufjzLgoAAiVL9jV0-fUAaCCIVlvRc8bY/ for circuit details.
// - The activation mask can be derived from spec.num_addresses.
struct AddressingEvent {
    Instruction instruction;
    std::vector<Operand> after_relative;
    std::vector<Operand> resolved_operands;
    MemoryValue base_address;
    const ExecInstructionSpec* spec = nullptr;
    std::optional<AddressingException> error;
};

} // namespace bb::avm2::simulation

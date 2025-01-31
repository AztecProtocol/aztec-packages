#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

enum class AddressingEventError {
    BASE_ADDRESS_INVALID_ADDRESS,
    RELATIVE_COMPUTATION_OOB,
    INDIRECT_INVALID_ADDRESS,
    FINAL_ADDRESS_INVALID,
};

struct AddressingException : public std::runtime_error {
    explicit AddressingException(AddressingEventError e, size_t operand_idx = 0)
        : std::runtime_error("Addressing error: " + std::to_string(static_cast<int>(e)) + " at operand " +
                             std::to_string(operand_idx))
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
    MemoryValue base_address_val;
    MemoryTag base_address_tag;
    const InstructionSpec* spec = nullptr;
    std::optional<AddressingException> error;
};

} // namespace bb::avm2::simulation
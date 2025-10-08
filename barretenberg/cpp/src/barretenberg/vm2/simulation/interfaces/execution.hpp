#pragma once

#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class ContextInterface;

struct ExecutionResult {
    MemoryAddress rd_offset;
    MemoryAddress rd_size;
    Gas gas_used;
    SideEffectStates side_effect_states;
    bool success;
    // Optional: if set, contains the actual return data copied from memory.
    // This is used when the caller needs the return data but the context's memory
    // will be destroyed after execution (e.g., in standalone simulation).
    std::optional<std::vector<FF>> output;
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result. TODO: This should only be top level enqueud calls
    virtual ExecutionResult execute(std::unique_ptr<ContextInterface> context) = 0;
};

class RegisterValidationException : public std::runtime_error {
  public:
    RegisterValidationException(const std::string& message)
        : std::runtime_error(message)
    {}
};

class OpcodeExecutionException : public std::runtime_error {
  public:
    OpcodeExecutionException(const std::string& message)
        : std::runtime_error(message)
    {}
};

} // namespace bb::avm2::simulation

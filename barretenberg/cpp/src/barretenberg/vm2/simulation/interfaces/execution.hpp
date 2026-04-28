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

enum HaltingMode : uint8_t {
    UNDEFINED,
    RETURN,
    REVERT,
    EXCEPTIONAL_HALT,
};

struct EnqueuedCallResult {
    bool success;
    Gas gas_used;
    // For debugging.
    HaltingMode halting_mode;
    std::optional<std::string> halting_message;
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result. TODO: This should only be top level enqueud calls
    virtual EnqueuedCallResult execute(std::unique_ptr<ContextInterface> context) = 0;
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

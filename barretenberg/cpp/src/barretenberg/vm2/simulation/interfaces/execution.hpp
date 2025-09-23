#pragma once

#include <memory>

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
};

class ExecutionInterface {
  public:
    virtual ~ExecutionInterface() = default;
    // Returns the top-level execution result. TODO: This should only be top level enqueud calls
    virtual ExecutionResult execute(std::unique_ptr<ContextInterface> context) = 0;
};

} // namespace bb::avm2::simulation

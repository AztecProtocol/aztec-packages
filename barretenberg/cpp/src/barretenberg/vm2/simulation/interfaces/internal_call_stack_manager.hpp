#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class InternalCallStackManagerInterface {
  public:
    virtual ~InternalCallStackManagerInterface() = default;

    virtual void push(PC caller_pc, PC return_pc) = 0;
    virtual PC pop() = 0;
    virtual InternalCallId get_next_call_id() const = 0;
    virtual InternalCallId get_call_id() const = 0;
    virtual InternalCallId get_return_call_id() const = 0;
    // Returns the call stack (caller PCs, not return PCs) without including the current PC.
    virtual std::vector<PC> get_current_call_stack() const = 0;
};

class InternalCallStackManagerProviderInterface {
  public:
    virtual ~InternalCallStackManagerProviderInterface() = default;
    virtual std::unique_ptr<InternalCallStackManagerInterface> make_internal_call_stack_manager(
        uint32_t context_id) = 0;
};

} // namespace bb::avm2::simulation

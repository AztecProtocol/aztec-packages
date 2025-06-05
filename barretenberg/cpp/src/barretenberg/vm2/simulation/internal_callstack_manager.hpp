#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"
#include <cstdint>
#include <stack>
#include <stdexcept>

namespace bb::avm2::simulation {

class InternalCallStackManagerInterface {
  public:
    virtual ~InternalCallStackManagerInterface() = default;

    virtual void push(PC return_pc) = 0;
    virtual PC pop() = 0;
    virtual InternalCallPtr top() const = 0;
    virtual InternalCallId get_next_call_id() const = 0;
};

// This contains the context_id due to circuit requirements similar to memory (i.e. it is used in  the event emitter)
// There might be a way to avoid this by emitting in the context / execution itself.
class InternalCallStackManager : public InternalCallStackManagerInterface {
  public:
    InternalCallStackManager(uint32_t context_id, EventEmitterInterface<InternalCallStackEvent>& emitter)
        : context_id(context_id)
        , internal_call_stack_events(emitter)
    {}

    void push(PC return_pc) override;
    PC pop() override;
    InternalCallPtr top() const override;
    InternalCallId get_next_call_id() const override;

  private:
    InternalCallId current_internal_call_id = 1; // dont start at 0
    InternalCallId return_id = 0;                // used to track the return id of the last call

    uint32_t context_id;

    std::stack<InternalCallPtr> internal_call_stack;
    EventEmitterInterface<InternalCallStackEvent>& internal_call_stack_events;
};

} // namespace bb::avm2::simulation

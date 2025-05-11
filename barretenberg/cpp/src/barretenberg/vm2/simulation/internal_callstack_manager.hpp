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

    // These are so similar we can use the same type.
    using InternalCallStackElement = InternalCallStackEvent;

    virtual void push(PC return_pc) = 0;
    virtual PC pop() = 0;
    virtual InternalCallId get_current_call_id() const = 0;
    virtual InternalCallId get_current_return_id() const = 0;
    virtual InternalCallId get_next_call_id() const = 0;
};

class InternalCallStackManager : public InternalCallStackManagerInterface {
  public:
    InternalCallStackManager(EventEmitterInterface<InternalCallStackEvent>& emitter)
        : internal_call_stack_events(emitter)
    {}

    void push(PC return_pc) override;
    PC pop() override;
    InternalCallId get_current_call_id() const override;
    InternalCallId get_current_return_id() const override;
    InternalCallId get_next_call_id() const override;

  private:
    InternalCallId internal_call_id = 1; // dont start at 0
    InternalCallId internal_call_return_id = 0;

    std::stack<InternalCallStackElement> internal_call_stack;
    EventEmitterInterface<InternalCallStackEvent>& internal_call_stack_events;
};

} // namespace bb::avm2::simulation

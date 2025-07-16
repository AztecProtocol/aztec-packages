#pragma once

#include <cstdint>
#include <stack>
#include <stdexcept>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"

namespace bb::avm2::simulation {

struct InternalCallPtr {
    InternalCallId return_id;
    PC return_pc;
};

class InternalCallStackManagerInterface {
  public:
    virtual ~InternalCallStackManagerInterface() = default;

    virtual void push(PC return_pc) = 0;
    virtual PC pop() = 0;
    virtual InternalCallId get_next_call_id() const = 0;
    virtual InternalCallId get_call_id() const = 0;
    virtual InternalCallId get_return_call_id() const = 0;
};

// This contains the context_id due to circuit requirements similar to memory (i.e. it is used in the event emitter)
// There might be a way to avoid this by emitting in the context / execution itself.
class InternalCallStackManager : public InternalCallStackManagerInterface {
  public:
    InternalCallStackManager(uint32_t context_id, EventEmitterInterface<InternalCallStackEvent>& emitter)
        : context_id(context_id)
        , internal_call_stack_events(emitter)
    {}

    void push(PC return_pc) override;
    PC pop() override;
    InternalCallId get_next_call_id() const override;
    InternalCallId get_call_id() const override;
    InternalCallId get_return_call_id() const override;

  private:
    InternalCallId next_internal_call_id = 2;    // dont start at 0
    InternalCallId current_internal_call_id = 1; // dont start at 0
    InternalCallId current_return_call_id = 0;   // this is the return id of the current call

    uint32_t context_id;

    std::stack<InternalCallPtr> internal_call_stack;
    EventEmitterInterface<InternalCallStackEvent>& internal_call_stack_events;
};

class InternalCallStackManagerProviderInterface {
  public:
    virtual ~InternalCallStackManagerProviderInterface() = default;
    virtual std::unique_ptr<InternalCallStackManagerInterface> make_internal_call_stack_manager(
        uint32_t context_id) = 0;
};

class InternalCallStackManagerProvider : public InternalCallStackManagerProviderInterface {
  public:
    InternalCallStackManagerProvider(EventEmitterInterface<InternalCallStackEvent>& event_emitter)
        : events(event_emitter)
    {}

    std::unique_ptr<InternalCallStackManagerInterface> make_internal_call_stack_manager(uint32_t context_id) override
    {
        return std::make_unique<InternalCallStackManager>(context_id, events);
    }

  private:
    EventEmitterInterface<InternalCallStackEvent>& events;
};

} // namespace bb::avm2::simulation

#pragma once

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"
#include <cstdint>
#include <stack>
#include <stdexcept>

namespace bb::avm2::simulation {

class InternalCallStackManagerInterface {
  public:
    virtual ~InternalCallStackManagerInterface() = default;

    virtual void push(uint32_t pc) = 0;
    virtual uint32_t pop() = 0;
};

class InternalCallStackManager : public InternalCallStackManagerInterface {
  public:
    InternalCallStackManager(EventEmitterInterface<InternalStackEvent>& emitter)
        : internal_call_stack_events(emitter)
    {}

    void push(uint32_t pc) override
    {
        internal_call_stack_events.emit(
            { .id = internal_call_stack_id + 1, .prev_id = internal_call_stack_id, .next_pc = pc });

        internal_call_stack.push(pc);
        internal_call_stack_id++;
    }

    uint32_t pop() override
    {
        if (internal_call_stack.empty()) {
            throw std::runtime_error("Trying to pop empty Internal Call Stack");
        }
        uint32_t pc = internal_call_stack.top();
        internal_call_stack.pop();
        return pc;
    }

  private:
    uint32_t internal_call_stack_id = 0;
    std::stack<uint32_t> internal_call_stack;
    EventEmitterInterface<InternalStackEvent>& internal_call_stack_events;
};

} // namespace bb::avm2::simulation

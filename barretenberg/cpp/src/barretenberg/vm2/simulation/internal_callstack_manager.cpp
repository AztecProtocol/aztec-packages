#include "barretenberg/vm2/simulation/internal_callstack_manager.hpp"

namespace bb::avm2::simulation {

void InternalCallStackManager::push(PC return_pc)
{
    InternalCallPtr element = {
        .id = current_internal_call_id,
        .entered_call_id = get_next_call_id(),
        .return_id = return_id,
        .return_pc = return_pc,
    };

    internal_call_stack.push(element);

    internal_call_stack_events.emit(InternalCallStackEvent{ .context_id = context_id, .call_ptr = element });

    return_id = current_internal_call_id;
    current_internal_call_id++;
}

PC InternalCallStackManager::pop()
{
    if (internal_call_stack.empty()) {
        throw std::runtime_error("Trying to pop empty Internal Call Stack");
    }
    auto element = internal_call_stack.top();
    internal_call_stack.pop();
    return element.return_pc;
}

InternalCallPtr InternalCallStackManager::top() const
{
    if (internal_call_stack.empty()) {
        // If the call stack is empty, we return a default value.
        return InternalCallPtr{ .id = 1, .entered_call_id = get_next_call_id(), .return_id = 0, .return_pc = 0 };
    }
    return internal_call_stack.top();
}

InternalCallId InternalCallStackManager::get_next_call_id() const
{
    return current_internal_call_id + 1;
}

} // namespace bb::avm2::simulation

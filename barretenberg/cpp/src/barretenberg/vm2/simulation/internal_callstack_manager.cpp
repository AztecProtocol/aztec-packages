#include "barretenberg/vm2/simulation/internal_callstack_manager.hpp"

namespace bb::avm2::simulation {

void InternalCallStackManager::push(PC return_pc)
{
    auto element = InternalCallStackElement{
        .id = internal_call_id,
        .return_id = internal_call_return_id,
        .return_pc = return_pc,
    };

    internal_call_stack_events.emit({
        .id = element.id,
        .return_id = element.return_id,
        .return_pc = element.return_pc,
    });

    internal_call_stack.push(element);

    internal_call_return_id = internal_call_id;
    internal_call_id++;
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

InternalCallId InternalCallStackManager::get_current_call_id() const
{
    return internal_call_id;
}

InternalCallId InternalCallStackManager::get_current_return_id() const
{
    return internal_call_return_id;
}

InternalCallId InternalCallStackManager::get_next_call_id() const
{
    return internal_call_id + 1;
}

} // namespace bb::avm2::simulation

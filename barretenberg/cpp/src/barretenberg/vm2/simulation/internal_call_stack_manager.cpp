#include "barretenberg/vm2/simulation/internal_call_stack_manager.hpp"

namespace bb::avm2::simulation {

void InternalCallStackManager::push(PC return_pc)
{
    // Add the current call id & return_pc to the stack
    internal_call_stack.push({ .return_id = current_return_call_id, .return_pc = return_pc });

    internal_call_stack_events.emit(InternalCallStackEvent{
        .context_id = context_id,
        .entered_call_id = next_internal_call_id,
        .id = current_internal_call_id,
        .return_id = current_return_call_id,
        .return_pc = return_pc,
    });

    // Update id values
    current_return_call_id = current_internal_call_id;
    current_internal_call_id = next_internal_call_id;
    next_internal_call_id++;
}

PC InternalCallStackManager::pop()
{
    if (internal_call_stack.empty()) {
        throw std::runtime_error("Internal call stack is empty. Cannot pop.");
    }
    // We need to restore the call ptr info to the previous call
    InternalCallPtr prev_call_ptr = internal_call_stack.top();

    // Reset the id values
    current_internal_call_id = current_return_call_id;
    current_return_call_id = prev_call_ptr.return_id;

    internal_call_stack.pop();

    // Return the next pc of the previous call
    return prev_call_ptr.return_pc;
}

InternalCallId InternalCallStackManager::get_next_call_id() const
{
    return next_internal_call_id;
}

InternalCallId InternalCallStackManager::get_call_id() const
{
    return current_internal_call_id;
}

InternalCallId InternalCallStackManager::get_return_call_id() const
{
    return current_return_call_id;
}

} // namespace bb::avm2::simulation

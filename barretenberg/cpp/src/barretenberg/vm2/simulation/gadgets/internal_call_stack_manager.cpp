#include "barretenberg/vm2/simulation/gadgets/internal_call_stack_manager.hpp"

#include <algorithm>

namespace bb::avm2::simulation {

void InternalCallStackManager::push(PC caller_pc, PC return_pc)
{
    // Add the current call id & return_pc to the stack
    internal_call_stack.push_back({ .return_call_id = return_call_id, .caller_pc = caller_pc, .return_pc = return_pc });

    internal_call_stack_events.emit(InternalCallStackEvent{
        .context_id = context_id,
        .entered_call_id = next_call_id,
        .call_id = call_id,
        .return_call_id = return_call_id,
        .return_pc = return_pc,
    });

    // Update id values
    return_call_id = call_id;
    call_id = next_call_id;
    next_call_id++;
}

PC InternalCallStackManager::pop()
{
    if (internal_call_stack.empty()) {
        throw InternalCallStackException("Internal call stack is empty. Cannot pop.");
    }
    // We need to restore the call ptr info to the previous call
    InternalCallPtr prev_call_ptr = internal_call_stack.back();

    // Reset the id values
    call_id = return_call_id;
    return_call_id = prev_call_ptr.return_call_id;

    internal_call_stack.pop_back();

    // Return the next pc of the previous call
    return prev_call_ptr.return_pc;
}

InternalCallId InternalCallStackManager::get_next_call_id() const
{
    return next_call_id;
}

InternalCallId InternalCallStackManager::get_call_id() const
{
    return call_id;
}

InternalCallId InternalCallStackManager::get_return_call_id() const
{
    return return_call_id;
}

std::vector<PC> InternalCallStackManager::get_current_call_stack() const
{
    std::vector<PC> call_stack;
    std::ranges::transform(internal_call_stack, std::back_inserter(call_stack), [](const InternalCallPtr& call_ptr) {
        return call_ptr.caller_pc;
    });
    return call_stack;
}

} // namespace bb::avm2::simulation

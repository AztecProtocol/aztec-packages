#include "barretenberg/vm2/simulation/gadgets/internal_call_stack_manager.hpp"

#include <algorithm>

namespace bb::avm2::simulation {

/**
 * @brief Push a new call onto the internal call stack.
 *        This is called when an internal call is executed.
 *        It pushes the caller_pc & return_pc to the stack.
 *        It also emits an internal call stack event.
 *
 * @param caller_pc The program counter where the caller is.
 * @param return_pc The program counter which will be returned to after the internal call is executed.
 */
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

/**
 * @brief Pop the top call from the internal call stack.
 *        This is called when an internal return is executed.
 *        It pops the top call from the stack and returns the stored return_pc.
 *        It also emits an internal call stack event.
 *
 * @return The program counter the caller will continue execution from.
 * @throws InternalCallStackException if the internal call stack is empty.
 */
PC InternalCallStackManager::pop()
{
    if (internal_call_stack.empty()) {
        throw InternalCallStackException("Internal call stack is empty. Cannot pop.");
    }
    // We need to restore the call ptr info to the previous call
    const auto& prev_call_ptr = internal_call_stack.back();

    // Reset the id values
    call_id = return_call_id;
    return_call_id = prev_call_ptr.return_call_id;

    internal_call_stack.pop_back();

    // Return the next pc of the previous call
    return prev_call_ptr.return_pc;
}

/**
 * @brief Get the next call id.
 *
 * @return The next call id.
 */
InternalCallId InternalCallStackManager::get_next_call_id() const
{
    return next_call_id;
}

/**
 * @brief Get the current call id.
 *
 * @return The current call id.
 */
InternalCallId InternalCallStackManager::get_call_id() const
{
    return call_id;
}

/**
 * @brief Get the return call id.
 *
 * @return The return call id.
 */
InternalCallId InternalCallStackManager::get_return_call_id() const
{
    return return_call_id;
}

/**
 * @brief Get the current call stack.
 *
 * @return The current call stack as a vector of caller PCs (not return PCs).
 */
std::vector<PC> InternalCallStackManager::get_current_call_stack() const
{
    std::vector<PC> call_stack;
    std::ranges::transform(internal_call_stack, std::back_inserter(call_stack), [](const InternalCallPtr& call_ptr) {
        return call_ptr.caller_pc;
    });
    return call_stack;
}

} // namespace bb::avm2::simulation

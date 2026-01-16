#include "barretenberg/vm2/simulation/lib/call_stack_metadata_collector.hpp"

#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

void CallStackMetadataCollector::set_phase(CoarseTransactionPhase phase)
{
    current_phase = phase;
}

bool CallStackMetadataCollector::should_skip_collection() const
{
    // Check call stack depth limit (size - 1 because we have a dummy root).
    if (limits.max_call_stack_depth > 0 && (call_stack_metadata.size() - 1) >= limits.max_call_stack_depth) {
        return true;
    }
    // Check total call stack items limit.
    if (limits.max_call_stack_items > 0 && total_call_stack_items >= limits.max_call_stack_items) {
        return true;
    }
    return false;
}

void CallStackMetadataCollector::notify_enter_call(const AztecAddress& contract_address,
                                                   uint32_t caller_pc,
                                                   const CalldataProvider& calldata_provider,
                                                   bool is_static_call,
                                                   const Gas& gas_limit)
{
    BB_ASSERT(!call_stack_metadata.empty(), "Call stack metadata is empty");

    // Check if we should stop collecting due to limits.
    if (should_skip_collection()) {
        return;
    }

    call_stack_metadata.top().num_nested_calls++;
    total_call_stack_items++;

    std::vector<FF> calldata = calldata_provider(limits.max_calldata_size_in_fields);

    call_stack_metadata.push({
        .timestamp = timestamp++,
        .phase = current_phase,
        .contract_address = contract_address,
        .caller_pc = caller_pc,
        .calldata = std::move(calldata),
        .is_static_call = is_static_call,
        .gas_limit = gas_limit,
        // To be filled in by the exit call or further nested calls.
        .reverted = false,
        .nested = {},
        .internal_call_stack_at_exit = {},
        .num_nested_calls = 0,
    });
}

void CallStackMetadataCollector::notify_exit_call(bool success,
                                                  uint32_t pc,
                                                  const std::optional<std::string>& halting_message,
                                                  const ReturnDataProvider& return_data_provider,
                                                  const InternalCallStackProvider& internal_call_stack_provider)
{
    // If we only have the dummy root, we skipped collection for this call.
    if (call_stack_metadata.size() <= 1) {
        return;
    }

    std::vector<FF> return_data = return_data_provider(limits.max_returndata_size_in_fields);
    std::vector<PC> internal_call_stack = internal_call_stack_provider();
    internal_call_stack.push_back(pc);

    CallStackMetadata top_call_stack_metadata = call_stack_metadata.top();
    top_call_stack_metadata.reverted = !success;
    top_call_stack_metadata.halting_message = std::move(halting_message);
    top_call_stack_metadata.output = std::move(return_data);
    top_call_stack_metadata.internal_call_stack_at_exit = std::move(internal_call_stack);

    // While exiting, we will move the top call of the stack to the nested vector of the parent call.
    BB_ASSERT_GT(call_stack_metadata.size(), static_cast<size_t>(1), "Call stack metadata size is not greater than 1");
    call_stack_metadata.pop();
    call_stack_metadata.top().nested.push_back(std::move(top_call_stack_metadata));
}

void CallStackMetadataCollector::notify_tx_revert(const std::string& revert_message)
{
    // Create a synthetic CallStackMetadata entry to capture the revert reason.
    // This is used when a tx-level revert happens outside of an enqueued call
    // (e.g., during revertible insertions from private).
    BB_ASSERT_EQ(call_stack_metadata.size(), static_cast<size_t>(1), "Call stack metadata size is not equal to 1");
    call_stack_metadata.top().nested.push_back({
        .timestamp = timestamp++,
        .phase = current_phase,
        .contract_address = 0, // No specific contract
        .caller_pc = 0,
        .calldata = {},
        .is_static_call = false,
        .gas_limit = {},
        .output = {},
        .reverted = true,
        .nested = {},
        .internal_call_stack_at_exit = {},
        .halting_message = revert_message,
        .num_nested_calls = 0,
    });
}

std::vector<CallStackMetadata> CallStackMetadataCollector::dump_call_stack_metadata()
{
    BB_ASSERT_EQ(call_stack_metadata.size(), static_cast<size_t>(1), "Call stack metadata size is not equal to 1");
    return std::move(call_stack_metadata.top().nested);
}

CalldataProvider make_calldata_provider(const ContextInterface& context)
{
    auto cd_size = context.get_parent_cd_size();
    return [&context, cd_size](uint32_t max_size) -> std::vector<FF> {
        // NOTE: get_calldata will handle offsetting into parent memory for nested contexts
        // In principle, get_calldata would pad, but this shouldn't happen since we always ask for less than cd_size.
        auto data = context.get_calldata(0, std::min(max_size, cd_size));
        // Convert MemoryValue to FF.
        return std::vector<FF>(data.begin(), data.end());
    };
}

ReturnDataProvider make_return_data_provider(const ContextInterface& context,
                                             uint32_t rd_mem_offset_in_child,
                                             uint32_t rd_size)
{
    return [&context, rd_mem_offset_in_child, rd_size](uint32_t max_size) -> std::vector<FF> {
        // NOTE: We can't use get_returndata here because that needs the parent and not the child context.
        // Passing the parent context to this method gives other problems like handling top-level returns.
        const auto& memory = context.get_memory();
        std::vector<FF> data;
        uint32_t effective_rd_size = std::min(max_size, rd_size);
        data.reserve(effective_rd_size);
        // This will copy effective_rd_size elements from returndata and will not pad.
        for (uint32_t i = 0; i < effective_rd_size; i++) {
            data.push_back(memory.get(rd_mem_offset_in_child + i).as_ff());
        }
        return data;
    };
}

InternalCallStackProvider make_internal_call_stack_provider(
    const InternalCallStackManagerInterface& internal_call_stack_manager)
{
    return [&internal_call_stack_manager]() -> std::vector<PC> {
        return internal_call_stack_manager.get_current_call_stack();
    };
}

} // namespace bb::avm2::simulation

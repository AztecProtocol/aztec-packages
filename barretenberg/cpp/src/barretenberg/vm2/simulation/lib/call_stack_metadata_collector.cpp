#include "barretenberg/vm2/simulation/lib/call_stack_metadata_collector.hpp"

#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

void CallStackMetadataCollector::set_phase(CoarseTransactionPhase phase)
{
    current_phase = phase;
}

void CallStackMetadataCollector::notify_enter_call(const AztecAddress& contract_address,
                                                   uint32_t caller_pc,
                                                   const CalldataProvider& calldata_provider,
                                                   bool is_static_call,
                                                   const Gas& gas_limit)
{
    assert(!call_stack_metadata.empty());
    call_stack_metadata.top().num_nested_calls++;

    uint32_t max_calldata_size = 1024; // TODO: make this configurable.
    std::vector<FF> calldata = calldata_provider(max_calldata_size);

    std::string function_name = [this, &contract_address, &calldata]() -> std::string {
        if (calldata.empty()) {
            return "unknown";
        }
        return contract_db.get_debug_function_name(contract_address, calldata.at(0)).value_or("unknown");
    }();

    call_stack_metadata.push({
        .phase = current_phase,
        .contract_address = contract_address,
        .caller_pc = caller_pc,
        .calldata = calldata,
        .is_static_call = is_static_call,
        .gas_limit = gas_limit,
        .function_name = std::move(function_name),
        // To be filled in by the exit call or further nested calls.
        .exit_pc = 0,
        .reverted = false,
        .nested = {},
        .num_nested_calls = 0,
    });
}

void CallStackMetadataCollector::notify_exit_call(bool success,
                                                  uint32_t pc,
                                                  const ReturnDataProvider& return_data_provider)
{
    uint32_t max_return_data_size = 1024; // TODO: make this configurable.
    std::vector<FF> return_data = return_data_provider(max_return_data_size);

    CallStackMetadata top_call_stack_metadata = std::move(call_stack_metadata.top());
    top_call_stack_metadata.exit_pc = pc;
    top_call_stack_metadata.reverted = !success;
    top_call_stack_metadata.output = std::move(return_data);

    // While exiting, we will move the top call of the stack to the nested vector of the parent call.
    call_stack_metadata.pop();
    assert(!call_stack_metadata.empty());
    call_stack_metadata.top().nested.push_back(std::move(top_call_stack_metadata));
}

std::vector<CallStackMetadata> CallStackMetadataCollector::dump_call_stack_metadata()
{
    assert(call_stack_metadata.size() == 1);
    return std::move(call_stack_metadata.top().nested);
}

CalldataProvider make_calldata_provider(const ContextInterface& context)
{
    auto cd_offset = context.get_parent_cd_addr();
    auto cd_size = context.get_parent_cd_size();
    return [&context, cd_offset, cd_size](uint32_t max_size) -> std::vector<FF> {
        try {
            // TODO: check if this will pad to size. We don't want that.
            auto data = context.get_calldata(cd_offset, std::min(max_size, cd_size));
            return std::vector<FF>(data.begin(), data.end());
        } catch (...) {
            vinfo("Failed to collect calldata (to:",
                  context.get_address(),
                  " pc:",
                  context.get_pc(),
                  " cd_offset:",
                  cd_offset,
                  " cd_size:",
                  cd_size,
                  " max_size:",
                  max_size,
                  ")");
            return {};
        }
    };
}

ReturnDataProvider make_return_data_provider(const ContextInterface& context)
{
    auto rd_addr = context.get_last_rd_addr();
    auto rd_size = context.get_last_rd_size();
    return [&context, rd_addr, rd_size](uint32_t max_size) -> std::vector<FF> {
        try {
            // TODO: check if this will pad to size. We don't want that.
            auto data = context.get_returndata(rd_addr, std::min(max_size, rd_size));
            return std::vector<FF>(data.begin(), data.end());
        } catch (...) {
            vinfo("Failed to collect returndata (to:",
                  context.get_address(),
                  " pc:",
                  context.get_pc(),
                  " rd_addr:",
                  rd_addr,
                  " rd_size:",
                  rd_size,
                  " max_size:",
                  max_size,
                  ")");
            return {};
        }
    };
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/context.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

/////////////////////////////
// Base Context
/////////////////////////////
std::vector<FF> BaseContext::get_returndata(uint32_t rd_offset_addr, uint32_t rd_copy_size)
{
    MemoryInterface& child_memory = get_child_context().get_memory();
    // The amount to rd to copy is the minimum of the requested size(with the offset) and the size of the returndata
    uint32_t read_size = std::min(rd_offset_addr + rd_copy_size, last_child_rd_size);

    std::vector<FF> retrieved_returndata;
    retrieved_returndata.reserve(read_size);
    // We read starting from the rd_addr
    for (uint32_t i = 0; i < read_size; i++) {
        retrieved_returndata.push_back(child_memory.get(get_last_rd_addr() + i));
    }
    retrieved_returndata.resize(rd_copy_size);

    return retrieved_returndata;
};

/////////////////////////////
// Enqueued Context
/////////////////////////////
std::vector<FF> EnqueuedCallContext::get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const
{
    // TODO(ilyas): Do we assert to assert cd_size < calldata.size(), otherwise it could trigger a massive write of
    // zeroes. OTOH: this should be caught by an OUT_OF_GAS exception
    std::vector<FF> padded_calldata(cd_copy_size, 0); // Vector of size cd_size filled with zeroes;

    // We first take a slice of the data, the most we can slice is the actual size of the data
    size_t slice_size = std::min(static_cast<size_t>(cd_offset + cd_copy_size), calldata.size());

    for (size_t i = cd_offset; i < slice_size; i++) {
        padded_calldata[i] = calldata[i];
    }
    return padded_calldata;
};

ContextEvent EnqueuedCallContext::serialize_context_event()
{
    return {
        .id = get_context_id(),
        .parent_id = 0,
        .pc = get_pc(),
        .msg_sender = get_msg_sender(),
        .contract_addr = get_address(),
        .is_static = get_is_static(),
        .parent_cd_addr = 0,
        .parent_cd_size_addr = 0,
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size_addr = get_last_rd_size(),
        .last_child_success = get_last_success(),
        .gas_used = get_gas_used(),
        .gas_limit = get_gas_limit(),
        .parent_gas_used = get_parent_gas_used(),
        .parent_gas_limit = get_parent_gas_limit(),
        // internal call stack
        .internal_call_id = get_internal_call_stack_manager().get_call_id(),
        .internal_call_return_id = get_internal_call_stack_manager().get_return_call_id(),
        .next_internal_call_id = get_internal_call_stack_manager().get_next_call_id(),
    };
};

/////////////////////////////
// Nested Context
/////////////////////////////
std::vector<FF> NestedContext::get_calldata(uint32_t cd_offset_addr, uint32_t cd_copy_size) const
{
    uint32_t read_size = std::min(cd_offset_addr + cd_copy_size, parent_cd_size);

    std::vector<FF> retrieved_calldata;
    retrieved_calldata.reserve(read_size);
    for (uint32_t i = 0; i < read_size; i++) {
        retrieved_calldata.push_back(parent_context.get_memory().get(parent_cd_addr + i));
    }

    // Pad the calldata
    retrieved_calldata.resize(cd_copy_size, 0);
    return retrieved_calldata;
};

ContextEvent NestedContext::serialize_context_event()
{
    return {
        .id = get_context_id(),
        .parent_id = get_parent_id(),
        .pc = get_pc(),
        .msg_sender = get_msg_sender(),
        .contract_addr = get_address(),
        .is_static = get_is_static(),
        .parent_cd_addr = parent_cd_addr,
        .parent_cd_size_addr = parent_cd_size,
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size_addr = get_last_rd_size(),
        .last_child_success = get_last_success(),
        .gas_used = get_gas_used(),
        .gas_limit = get_gas_limit(),
        .parent_gas_used = get_parent_gas_used(),
        .parent_gas_limit = get_parent_gas_limit(),
        // internal call stack
        .internal_call_id = get_internal_call_stack_manager().get_call_id(),
        .internal_call_return_id = get_internal_call_stack_manager().get_return_call_id(),
        .next_internal_call_id = get_internal_call_stack_manager().get_next_call_id(),
    };
};

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/context.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

/////////////////////////////
// Base Context
/////////////////////////////
std::vector<FF> BaseContext::get_returndata(uint32_t rd_offset, uint32_t rd_copy_size)
{
    MemoryInterface& child_memory = get_child_context().get_memory();
    // The amount to rd copy is the minimum of the requested size (with the offset into rd) and the size of the
    // returndata We need to do it over a wider integer type to avoid overflow issues, but the result is guaranteed to
    // be a u32 since last_child_rd_size would have previously been constrained to be u32.
    uint32_t max_read_index = static_cast<uint32_t>(
        std::min(static_cast<uint64_t>(rd_offset) + rd_copy_size, static_cast<uint64_t>(last_child_rd_size)));

    std::vector<FF> padded_returndata;
    padded_returndata.reserve(max_read_index - rd_offset);

    for (uint32_t i = rd_offset; i < max_read_index; i++) {
        padded_returndata.push_back(child_memory.get(get_last_rd_addr() + i));
    }
    // Resize because relying on default initialization of FF (in reserve) is a potential footgun
    padded_returndata.resize(rd_copy_size, 0);

    return padded_returndata;
};

/////////////////////////////
// Enqueued Context
/////////////////////////////
std::vector<FF> EnqueuedCallContext::get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const
{
    uint64_t calldata_size = static_cast<uint64_t>(calldata.size());
    // We first take a slice of the data, the most we can slice is the actual size of the data
    uint64_t max_read_index = std::min(static_cast<uint64_t>(cd_offset) + cd_copy_size, calldata_size);

    std::vector<FF> padded_calldata;
    padded_calldata.reserve(max_read_index - cd_offset);

    for (size_t i = cd_offset; i < max_read_index; i++) {
        padded_calldata.push_back(calldata[i]);
    }
    // Resize because relying on default initialization of FF (in reserve) is a potential footgun
    padded_calldata.resize(cd_copy_size, 0);

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
        .transaction_fee = get_transaction_fee(),
        .is_static = get_is_static(),
        .parent_cd_addr = 0,
        .parent_cd_size_addr = 0,
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size = get_last_rd_size(),
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
std::vector<FF> NestedContext::get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const
{
    // This is the amount of the parent calldata we will read
    // We need to do it over a wider integer type to avoid overflow issues
    // Explicit for clarity
    uint64_t parent_cd_size_u64 = static_cast<uint64_t>(parent_cd_size);

    uint64_t max_read_index = std::min(static_cast<uint64_t>(cd_offset) + cd_copy_size, parent_cd_size_u64);

    std::vector<FF> padded_calldata;
    padded_calldata.reserve(max_read_index - cd_offset);

    for (uint32_t i = cd_offset; i < max_read_index; i++) {
        padded_calldata.push_back(parent_context.get_memory().get(parent_cd_addr + i));
    }
    // Resize because relying on default initialization of FF (in reserve) is a potential footgun
    padded_calldata.resize(cd_copy_size, 0);

    return padded_calldata;
};

ContextEvent NestedContext::serialize_context_event()
{
    return {
        .id = get_context_id(),
        .parent_id = get_parent_id(),
        .pc = get_pc(),
        .msg_sender = get_msg_sender(),
        .contract_addr = get_address(),
        .transaction_fee = get_transaction_fee(),
        .is_static = get_is_static(),
        .parent_cd_addr = parent_cd_addr,
        .parent_cd_size_addr = parent_cd_size,
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size = get_last_rd_size(),
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

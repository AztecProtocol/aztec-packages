#include "barretenberg/vm2/simulation/gadgets/context.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

/////////////////////////////
// Base Context
/////////////////////////////
std::vector<MemoryValue> BaseContext::get_returndata(uint32_t rd_offset, uint32_t rd_copy_size)
{
    MemoryInterface& child_memory = get_child_context().get_memory();
    // The amount to rd copy is the minimum of the requested size (with the offset into rd) and the size of the
    // returndata We need to do it over a wider integer type to avoid overflow issues, but the result is guaranteed to
    // be a u32 since last_child_rd_size would have previously been constrained to be u32.
    uint32_t data_index_upper_bound = static_cast<uint32_t>(
        std::min(static_cast<uint64_t>(rd_offset) + rd_copy_size, static_cast<uint64_t>(last_child_rd_size)));

    std::vector<MemoryValue> padded_returndata;
    padded_returndata.reserve(rd_copy_size);

    for (uint32_t i = rd_offset; i < data_index_upper_bound; i++) {
        padded_returndata.push_back(child_memory.get(get_last_rd_addr() + i));
    }
    // If we have some padding (read goes beyond the end of the returndata), fill the rest of the vector with zeros.
    padded_returndata.resize(rd_copy_size, MemoryValue::from<FF>(0));

    return padded_returndata;
};

uint32_t BaseContext::get_last_child_id() const
{
    if (child_context == nullptr) {
        return 0; // No child context, so no last child id.
    }
    return child_context->get_context_id();
}

/////////////////////////////
// Enqueued Context
/////////////////////////////
std::vector<MemoryValue> EnqueuedCallContext::get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const
{
    uint64_t calldata_size = static_cast<uint64_t>(calldata.size());
    // We first take a slice of the data, the most we can slice is the actual size of the data
    uint64_t data_index_upper_bound = std::min(static_cast<uint64_t>(cd_offset) + cd_copy_size, calldata_size);

    std::vector<MemoryValue> padded_calldata;
    padded_calldata.reserve(cd_copy_size);

    for (size_t i = cd_offset; i < data_index_upper_bound; i++) {
        padded_calldata.push_back(calldata[i]);
    }
    // If we have some padding (read goes beyond the end of the calldata), fill the rest of the vector with zeros.
    padded_calldata.resize(cd_copy_size, MemoryValue::from<FF>(0));

    return padded_calldata;
};

ContextEvent EnqueuedCallContext::serialize_context_event()
{
    auto& call_stack = get_internal_call_stack_manager();
    auto& side_effects = get_side_effect_tracker().get_side_effects();

    return {
        .id = get_context_id(),
        .parent_id = 0,
        .last_child_id = get_last_child_id(),
        .pc = get_pc(),
        .msg_sender = get_msg_sender(),
        .contract_addr = get_address(),
        .bytecode_id = get_bytecode_manager().get_retrieved_bytecode_id().value_or(FF(0)),
        .transaction_fee = get_transaction_fee(),
        .is_static = get_is_static(),
        .parent_cd_addr = 0,
        .parent_cd_size = get_parent_cd_size(),
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size = get_last_rd_size(),
        .last_child_success = get_last_success(),
        .gas_used = get_gas_used(),
        .gas_limit = get_gas_limit(),
        .parent_gas_used = get_parent_gas_used(),
        .parent_gas_limit = get_parent_gas_limit(),
        // internal call stack
        .internal_call_id = call_stack.get_call_id(),
        .internal_call_return_id = call_stack.get_return_call_id(),
        .next_internal_call_id = call_stack.get_next_call_id(),
        // Tree States
        .tree_states = merkle_db.get_tree_state(),
        .written_public_data_slots_tree_snapshot = written_public_data_slots_tree.get_snapshot(),
        .retrieved_bytecodes_tree_snapshot = retrieved_bytecodes_tree.get_snapshot(),
        // Non-tree-tracked side effects
        .numUnencryptedLogFields = side_effects.get_num_unencrypted_log_fields(),
        .numL2ToL1Messages = static_cast<uint32_t>(side_effects.l2_to_l1_messages.size()),
        // Phase
        .phase = get_phase(),
    };
};

/////////////////////////////
// Nested Context
/////////////////////////////
std::vector<MemoryValue> NestedContext::get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const
{
    // This is the amount of the parent calldata we will read
    // We need to do it over a wider integer type to avoid overflow issues
    // Explicit for clarity
    uint64_t parent_cd_size_u64 = static_cast<uint64_t>(parent_cd_size);

    uint64_t data_index_upper_bound = std::min(static_cast<uint64_t>(cd_offset) + cd_copy_size, parent_cd_size_u64);

    std::vector<MemoryValue> padded_calldata;
    padded_calldata.reserve(cd_copy_size);

    for (uint32_t i = cd_offset; i < data_index_upper_bound; i++) {
        padded_calldata.push_back(parent_context.get_memory().get(parent_cd_addr + i));
    }

    // If we have some padding (read goes beyond the end of the parent calldata), fill the rest of the vector with
    // zeros.
    padded_calldata.resize(cd_copy_size, MemoryValue::from<FF>(0));

    return padded_calldata;
};

ContextEvent NestedContext::serialize_context_event()
{
    auto& call_stack = get_internal_call_stack_manager();
    auto& side_effects = get_side_effect_tracker().get_side_effects();

    return {
        .id = get_context_id(),
        .parent_id = get_parent_id(),
        .last_child_id = get_last_child_id(),
        .pc = get_pc(),
        .msg_sender = get_msg_sender(),
        .contract_addr = get_address(),
        .bytecode_id = get_bytecode_manager().get_retrieved_bytecode_id().value_or(FF(0)),
        .transaction_fee = get_transaction_fee(),
        .is_static = get_is_static(),
        .parent_cd_addr = parent_cd_addr,
        .parent_cd_size = parent_cd_size,
        .last_child_rd_addr = get_last_rd_addr(),
        .last_child_rd_size = get_last_rd_size(),
        .last_child_success = get_last_success(),
        .gas_used = get_gas_used(),
        .gas_limit = get_gas_limit(),
        .parent_gas_used = get_parent_gas_used(),
        .parent_gas_limit = get_parent_gas_limit(),
        // internal call stack
        .internal_call_id = call_stack.get_call_id(),
        .internal_call_return_id = call_stack.get_return_call_id(),
        .next_internal_call_id = call_stack.get_next_call_id(),
        // Tree states
        .tree_states = merkle_db.get_tree_state(),
        .written_public_data_slots_tree_snapshot = written_public_data_slots_tree.get_snapshot(),
        .retrieved_bytecodes_tree_snapshot = retrieved_bytecodes_tree.get_snapshot(),
        // Non-tree-tracked side effects
        .numUnencryptedLogFields = side_effects.get_num_unencrypted_log_fields(),
        .numL2ToL1Messages = static_cast<uint32_t>(side_effects.l2_to_l1_messages.size()),
        // Phase
        .phase = get_phase(),
    };
};

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process the context stack events and populate fields for the context stack sub-trace.
 *
 * @param ctx_stack_events The context stack events.
 * @param trace The trace container.
 */
void ContextStackTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ContextStackEvent>::Container& ctx_stack_events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 0;

    for (const auto& event : ctx_stack_events) {
        trace.set(row,
                  { {
                      { C::context_stack_sel, 1 },
                      { C::context_stack_context_id, event.id },
                      { C::context_stack_parent_id, event.parent_id },
                      { C::context_stack_entered_context_id, event.entered_context_id },
                      { C::context_stack_next_pc, event.next_pc },
                      { C::context_stack_msg_sender, event.msg_sender },
                      { C::context_stack_contract_address, event.contract_addr },
                      { C::context_stack_bytecode_id, event.bytecode_id },
                      { C::context_stack_is_static, event.is_static ? 1 : 0 },
                      { C::context_stack_parent_calldata_addr, event.parent_cd_addr },
                      { C::context_stack_parent_calldata_size, event.parent_cd_size },
                      { C::context_stack_parent_l2_gas_limit, event.parent_gas_limit.l2_gas },
                      { C::context_stack_parent_da_gas_limit, event.parent_gas_limit.da_gas },
                      { C::context_stack_parent_l2_gas_used, event.parent_gas_used.l2_gas },
                      { C::context_stack_parent_da_gas_used, event.parent_gas_used.da_gas },
                      { C::context_stack_internal_call_id, event.internal_call_id },
                      { C::context_stack_internal_call_return_id, event.internal_call_return_id },
                      { C::context_stack_next_internal_call_id, event.next_internal_call_id },
                      { C::context_stack_note_hash_tree_root, event.tree_states.note_hash_tree.tree.root },
                      { C::context_stack_note_hash_tree_size,
                        event.tree_states.note_hash_tree.tree.next_available_leaf_index },
                      { C::context_stack_num_note_hashes_emitted, event.tree_states.note_hash_tree.counter },
                      { C::context_stack_nullifier_tree_root, event.tree_states.nullifier_tree.tree.root },
                      { C::context_stack_nullifier_tree_size,
                        event.tree_states.nullifier_tree.tree.next_available_leaf_index },
                      { C::context_stack_num_nullifiers_emitted, event.tree_states.nullifier_tree.counter },
                      { C::context_stack_public_data_tree_root, event.tree_states.public_data_tree.tree.root },
                      { C::context_stack_public_data_tree_size,
                        event.tree_states.public_data_tree.tree.next_available_leaf_index },
                      { C::context_stack_written_public_data_slots_tree_root,
                        event.written_public_data_slots_tree_snapshot.root },
                      { C::context_stack_written_public_data_slots_tree_size,
                        event.written_public_data_slots_tree_snapshot.next_available_leaf_index },
                      { C::context_stack_num_unencrypted_log_fields, event.numUnencryptedLogFields },
                      { C::context_stack_num_l2_to_l1_messages, event.numL2ToL1Messages },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen

#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::tracegen {

void ContextStackTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ContextStackEvent>::Container& ctx_stack_events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 0;

    for (const auto& event : ctx_stack_events) {
        trace.set(
            row,
            { {
                { C::context_stack_sel, 1 },
                { C::context_stack_context_id_inv, FF(event.id).invert() },
                { C::context_stack_context_id, event.id },
                { C::context_stack_parent_id, event.parent_id },
                { C::context_stack_entered_context_id, event.entered_context_id },
                { C::context_stack_next_pc, event.next_pc },
                { C::context_stack_msg_sender, event.msg_sender },
                { C::context_stack_contract_address, event.contract_addr },
                { C::context_stack_bytecode_id, event.bytecode_id },
                { C::context_stack_is_static, event.is_static },
                { C::context_stack_parent_calldata_addr, event.parent_cd_addr },
                { C::context_stack_parent_calldata_size, event.parent_cd_size },
                { C::context_stack_parent_l2_gas_limit, event.parent_gas_limit.l2Gas },
                { C::context_stack_parent_da_gas_limit, event.parent_gas_limit.daGas },
                { C::context_stack_parent_l2_gas_used, event.parent_gas_used.l2Gas },
                { C::context_stack_parent_da_gas_used, event.parent_gas_used.daGas },
                { C::context_stack_note_hash_tree_root, event.tree_states.noteHashTree.tree.root },
                { C::context_stack_note_hash_tree_size, event.tree_states.noteHashTree.tree.nextAvailableLeafIndex },
                { C::context_stack_num_note_hashes_emitted, event.tree_states.noteHashTree.counter },
                { C::context_stack_nullifier_tree_root, event.tree_states.nullifierTree.tree.root },
                { C::context_stack_nullifier_tree_size, event.tree_states.nullifierTree.tree.nextAvailableLeafIndex },
                { C::context_stack_num_nullifiers_emitted, event.tree_states.nullifierTree.counter },
                { C::context_stack_public_data_tree_root, event.tree_states.publicDataTree.tree.root },
                { C::context_stack_public_data_tree_size,
                  event.tree_states.publicDataTree.tree.nextAvailableLeafIndex },
                { C::context_stack_written_public_data_slots_tree_root,
                  event.written_public_data_slots_tree_snapshot.root },
                { C::context_stack_written_public_data_slots_tree_size,
                  event.written_public_data_slots_tree_snapshot.nextAvailableLeafIndex },
                { C::context_stack_num_unencrypted_log_fields, event.side_effect_states.numUnencryptedLogFields },
                { C::context_stack_num_l2_to_l1_messages, event.side_effect_states.numL2ToL1Messages },
            } });
        row++;
    }
}

} // namespace bb::avm2::tracegen

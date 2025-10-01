#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<ContextInterface> ContextProvider::make_nested_context(AztecAddress address,
                                                                       AztecAddress msg_sender,
                                                                       FF transaction_fee,
                                                                       ContextInterface& parent_context,
                                                                       MemoryAddress cd_offset_address,
                                                                       uint32_t cd_size,
                                                                       bool is_static,
                                                                       Gas gas_limit,
                                                                       SideEffectStates side_effect_states,
                                                                       TransactionPhase phase)
{
    merkle_db.create_checkpoint(); // Fork DB just like in TS.
    uint32_t context_id = next_context_id++;
    // Memory assumes that the space id is <= 16 bits.
    assert(context_id <= std::numeric_limits<uint16_t>::max());
    uint16_t space_id = static_cast<uint16_t>(context_id);
    return std::make_unique<NestedContext>(
        context_id,
        address,
        msg_sender,
        transaction_fee,
        is_static,
        gas_limit,
        parent_context.get_globals(),
        std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
        memory_provider.make_memory(space_id),
        internal_call_stack_manager_provider.make_internal_call_stack_manager(context_id),
        merkle_db,
        written_public_data_slots_tree,
        retrieved_bytecodes_tree,
        side_effect_states,
        phase,
        parent_context,
        cd_offset_address,
        cd_size);
}

std::unique_ptr<ContextInterface> ContextProvider::make_enqueued_context(AztecAddress address,
                                                                         AztecAddress msg_sender,
                                                                         FF transaction_fee,
                                                                         std::span<const FF> calldata,
                                                                         bool is_static,
                                                                         Gas gas_limit,
                                                                         Gas gas_used,
                                                                         SideEffectStates side_effect_states,
                                                                         TransactionPhase phase)
{

    uint32_t context_id = next_context_id++;
    // Memory assumes that the space id is <= 16 bits.
    assert(context_id <= std::numeric_limits<uint16_t>::max());
    uint16_t space_id = static_cast<uint16_t>(context_id);

    cd_hash_provider.make_calldata_hasher(context_id)->compute_calldata_hash(calldata);

    return std::make_unique<EnqueuedCallContext>(
        context_id,
        address,
        msg_sender,
        transaction_fee,
        is_static,
        gas_limit,
        gas_used,
        global_variables,
        std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
        memory_provider.make_memory(space_id),
        internal_call_stack_manager_provider.make_internal_call_stack_manager(context_id),
        merkle_db,
        written_public_data_slots_tree,
        retrieved_bytecodes_tree,
        side_effect_states,
        phase,
        calldata);
}

uint32_t ContextProvider::get_next_context_id() const
{
    return next_context_id;
}

} // namespace bb::avm2::simulation

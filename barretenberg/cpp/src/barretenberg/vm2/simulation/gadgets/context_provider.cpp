#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"

#include <cassert>
#include <limits>

#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Make a new nested context.
 *
 * @param address The address of the context.
 * @param msg_sender The message sender of the context.
 * @param transaction_fee The transaction fee of the context.
 * @param parent_context The parent context.
 * @param cd_offset_address The offset address of the calldata in the parent memory.
 * @param cd_size The size of the calldata.
 * @param is_static Whether the context is static.
 * @param gas_limit The gas limit of the context.
 * @param phase The transaction phase of the context.
 *
 * @return The new nested context.
 */
std::unique_ptr<ContextInterface> ContextProvider::make_nested_context(const AztecAddress& address,
                                                                       const AztecAddress& msg_sender,
                                                                       const FF& transaction_fee,
                                                                       ContextInterface& parent_context,
                                                                       MemoryAddress cd_offset_address,
                                                                       uint32_t cd_size,
                                                                       bool is_static,
                                                                       const Gas& gas_limit,
                                                                       TransactionPhase phase)
{
    merkle_db.create_checkpoint(); // Fork DB just like in TS.
    uint32_t context_id = next_context_id++;
    // Memory assumes that the space id is <= 16 bits.
    BB_ASSERT_LTE(context_id, std::numeric_limits<uint16_t>::max(), "Context ID out of bounds");
    uint16_t space_id = static_cast<uint16_t>(context_id);

    // Create the new nested context.
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
        side_effect_tracker,
        phase,
        parent_context,
        cd_offset_address,
        cd_size);
}

/**
 * @brief Make a new enqueued call context.
 *
 * @param address The address of the context.
 * @param msg_sender The message sender of the context.
 * @param transaction_fee The transaction fee of the context.
 * @param calldata The calldata of the context.
 * @param is_static Whether the context is static.
 * @param gas_limit The gas limit of the context.
 * @param gas_used The gas used at the start of the context.
 * @param phase The transaction phase of the context.
 *
 * @return The new enqueued call context.
 */
std::unique_ptr<ContextInterface> ContextProvider::make_enqueued_context(const AztecAddress& address,
                                                                         const AztecAddress& msg_sender,
                                                                         const FF& transaction_fee,
                                                                         std::span<const FF> calldata,
                                                                         const FF& calldata_hash,
                                                                         bool is_static,
                                                                         const Gas& gas_limit,
                                                                         const Gas& gas_used,
                                                                         TransactionPhase phase)
{

    uint32_t context_id = next_context_id++;
    // Memory assumes that the space id is <= 16 bits.
    BB_ASSERT_LTE(context_id, std::numeric_limits<uint16_t>::max(), "Context ID out of bounds");
    uint16_t space_id = static_cast<uint16_t>(context_id);

    cd_hash_provider.make_calldata_hasher(context_id)->assert_calldata_hash(calldata_hash, calldata);

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
        side_effect_tracker,
        phase,
        calldata);
}

uint32_t ContextProvider::get_next_context_id() const
{
    return next_context_id;
}

} // namespace bb::avm2::simulation

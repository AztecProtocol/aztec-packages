#include "barretenberg/vm2/simulation/context_provider.hpp"

#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<ContextInterface> ContextProvider::make_nested_context(AztecAddress address,
                                                                       AztecAddress msg_sender,
                                                                       ContextInterface& parent_context,
                                                                       MemoryAddress cd_offset_address,
                                                                       MemoryAddress cd_size_address,
                                                                       bool is_static,
                                                                       Gas gas_limit)
{
    uint32_t context_id = next_context_id++;
    return std::make_unique<NestedContext>(context_id,
                                           address,
                                           msg_sender,
                                           is_static,
                                           gas_limit,
                                           std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                           std::make_unique<Memory>(context_id, range_check, memory_events),
                                           parent_context,
                                           cd_offset_address,
                                           cd_size_address);
}

std::unique_ptr<ContextInterface> ContextProvider::make_enqueued_context(AztecAddress address,
                                                                         AztecAddress msg_sender,
                                                                         std::span<const FF> calldata,
                                                                         bool is_static,
                                                                         Gas gas_limit,
                                                                         Gas gas_used)
{

    uint32_t context_id = next_context_id++;
    return std::make_unique<EnqueuedCallContext>(context_id,
                                                 address,
                                                 msg_sender,
                                                 is_static,
                                                 gas_limit,
                                                 gas_used,
                                                 std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                                 std::make_unique<Memory>(context_id, range_check, memory_events),
                                                 calldata);
}

uint32_t ContextProvider::get_next_context_id() const
{
    return next_context_id;
}

} // namespace bb::avm2::simulation

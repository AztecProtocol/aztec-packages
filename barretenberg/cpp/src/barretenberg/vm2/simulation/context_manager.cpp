#include "barretenberg/vm2/simulation/context_manager.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/execution_components.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<ContextInterface> ContextProvider::make_nested_context(AztecAddress address,
                                                                       AztecAddress msg_sender,
                                                                       ContextInterface& parent_context,
                                                                       MemoryAddress cd_offset_address,
                                                                       MemoryAddress cd_size_address,
                                                                       bool is_static)
{
    uint32_t context_id = next_context_id++;
    return std::make_unique<NestedContext>(context_id,
                                           address,
                                           msg_sender,
                                           is_static,
                                           std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                           std::make_unique<Memory>(context_id, range_check, memory_events),
                                           parent_context,
                                           cd_offset_address,
                                           cd_size_address);
}

std::unique_ptr<ContextInterface> ContextProvider::make_enqueued_context(AztecAddress address,
                                                                         AztecAddress msg_sender,
                                                                         std::span<const FF> calldata,
                                                                         bool is_static)
{

    uint32_t context_id = next_context_id++;
    return std::make_unique<EnqueuedCallContext>(context_id,
                                                 address,
                                                 msg_sender,
                                                 is_static,
                                                 std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                                 std::make_unique<Memory>(context_id, range_check, memory_events),
                                                 calldata);
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/execution_components.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<ContextInterface> ExecutionComponentsProvider::make_context(AztecAddress address,
                                                                            AztecAddress msg_sender,
                                                                            std::span<const FF> calldata,
                                                                            bool is_static)
{
    uint32_t space_id = static_cast<uint32_t>(address); // FIXME: space id.

    return std::make_unique<Context>(address,
                                     msg_sender,
                                     calldata,
                                     is_static,
                                     std::make_unique<BytecodeManager>(address, tx_bytecode_manager),
                                     std::make_unique<Memory>(space_id, memory_events));
}

std::unique_ptr<AddressingInterface> ExecutionComponentsProvider::make_addressing(AddressingEvent& event)
{
    auto event_emitter = std::make_unique<OneShotEventEmitter<AddressingEvent>>(event);
    auto addressing = std::make_unique<Addressing>(instruction_info_db, *event_emitter);
    addressing_event_emitters.push_back(std::move(event_emitter));
    return addressing;
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"

#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<AddressingInterface> ExecutionComponentsProvider::make_addressing(AddressingEvent& event)
{
    auto event_emitter = std::make_unique<OneShotEventEmitter<AddressingEvent>>(event);
    auto addressing = std::make_unique<Addressing>(instruction_info_db, greater_than, *event_emitter);
    addressing_event_emitters.push_back(std::move(event_emitter));
    return addressing;
}

std::unique_ptr<GasTrackerInterface> ExecutionComponentsProvider::make_gas_tracker(GasEvent& gas_event,
                                                                                   const Instruction& instruction,
                                                                                   ContextInterface& context)
{
    return std::make_unique<GasTracker>(gas_event, instruction, instruction_info_db, context, greater_than);
}

} // namespace bb::avm2::simulation

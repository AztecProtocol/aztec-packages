#include "barretenberg/vm2/simulation/execution_components.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<AddressingInterface> ExecutionComponentsProvider::make_addressing(AddressingEvent& event)
{
    auto event_emitter = std::make_unique<OneShotEventEmitter<AddressingEvent>>(event);
    auto addressing = std::make_unique<Addressing>(instruction_info_db, *event_emitter);
    addressing_event_emitters.push_back(std::move(event_emitter));
    return addressing;
}

std::unique_ptr<GasTrackerInterface> ExecutionComponentsProvider::make_gas_tracker(ContextInterface& context)
{
    return std::make_unique<GasTracker>(instruction_info_db, context, range_check);
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/standalone/pure_execution_components.hpp"

#include <memory>

#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_addressing.hpp"

namespace bb::avm2::simulation {

std::unique_ptr<AddressingInterface> PureExecutionComponentsProvider::make_addressing(AddressingEvent&)
{
    return std::make_unique<PureAddressing>(instruction_info_db);
}

std::unique_ptr<GasTrackerInterface> PureExecutionComponentsProvider::make_gas_tracker(GasEvent& gas_event,
                                                                                       const Instruction& instruction,
                                                                                       ContextInterface& context)
{
    return std::make_unique<GasTracker>(gas_event, instruction, instruction_info_db, context, greater_than);
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"

#include <utility>

#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Create an addressing resolver that writes its resolution results into the given event.
 *
 * @param event The addressing event to populate during resolution.
 * @return A unique pointer to the addressing interface.
 */
std::unique_ptr<AddressingInterface> ExecutionComponentsProvider::make_addressing(AddressingEvent& event)
{
    auto event_emitter = std::make_unique<OneShotEventEmitter<AddressingEvent>>(event);
    auto addressing = std::make_unique<Addressing>(instruction_info_db, greater_than, *event_emitter);
    addressing_event_emitters.push_back(std::move(event_emitter));
    return addressing;
}

/**
 * @brief Create a gas tracker bound to the given event, instruction, and context.
 *
 * @param gas_event The gas event to populate during gas consumption.
 * @param instruction The current instruction (for gas cost lookup).
 * @param context The execution context (for gas limits and usage).
 * @return A unique pointer to the gas tracker interface.
 */
std::unique_ptr<GasTrackerInterface> ExecutionComponentsProvider::make_gas_tracker(GasEvent& gas_event,
                                                                                   const Instruction& instruction,
                                                                                   ContextInterface& context)
{
    return std::make_unique<GasTracker>(gas_event, instruction, instruction_info_db, context, greater_than);
}

} // namespace bb::avm2::simulation

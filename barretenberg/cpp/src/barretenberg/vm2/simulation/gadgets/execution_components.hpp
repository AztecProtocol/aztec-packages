#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution_components.hpp"

namespace bb::avm2::simulation {

class ExecutionComponentsProvider : public ExecutionComponentsProviderInterface {
  public:
    ExecutionComponentsProvider(GreaterThanInterface& greater_than,
                                const InstructionInfoDBInterface& instruction_info_db)
        : greater_than(greater_than)
        , instruction_info_db(instruction_info_db)
    {}
    std::unique_ptr<AddressingInterface> make_addressing(AddressingEvent& event) override;

    std::unique_ptr<GasTrackerInterface> make_gas_tracker(GasEvent& gas_event,
                                                          const Instruction& instruction,
                                                          ContextInterface& context) override;

  private:
    GreaterThanInterface& greater_than;
    const InstructionInfoDBInterface& instruction_info_db;

    // Sadly someone has to own these.
    // TODO(fcarreiro): We are creating one of these per execution row and only releasing them at
    // the end of the TX. Ideally we'd improve this.
    std::vector<std::unique_ptr<EventEmitterInterface<AddressingEvent>>> addressing_event_emitters;
};

} // namespace bb::avm2::simulation

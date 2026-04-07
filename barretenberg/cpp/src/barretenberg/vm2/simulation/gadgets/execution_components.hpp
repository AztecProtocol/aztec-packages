#pragma once

#include <memory>
#include <vector>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution_components.hpp"
#include "barretenberg/vm2/simulation/interfaces/gt.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"

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

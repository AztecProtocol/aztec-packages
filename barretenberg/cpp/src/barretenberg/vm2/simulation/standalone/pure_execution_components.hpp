#pragma once

#include <memory>

#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution_components.hpp"
#include "barretenberg/vm2/simulation/interfaces/gt.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"

namespace bb::avm2::simulation {

class PureExecutionComponentsProvider : public ExecutionComponentsProviderInterface {
  public:
    PureExecutionComponentsProvider(GreaterThanInterface& greater_than,
                                    const InstructionInfoDBInterface& instruction_info_db)
        : greater_than(greater_than)
        , instruction_info_db(instruction_info_db)
    {}
    std::unique_ptr<AddressingInterface> make_addressing(AddressingEvent& event) override;

    // FIXME: not pure yet.
    std::unique_ptr<GasTrackerInterface> make_gas_tracker(GasEvent& gas_event,
                                                          const Instruction& instruction,
                                                          ContextInterface& context) override;

  private:
    GreaterThanInterface& greater_than;
    const InstructionInfoDBInterface& instruction_info_db;
};

} // namespace bb::avm2::simulation

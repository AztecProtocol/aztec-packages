#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class ExecutionComponentsProviderInterface {
  public:
    virtual ~ExecutionComponentsProviderInterface() = default;
    virtual std::unique_ptr<AddressingInterface> make_addressing(AddressingEvent& event) = 0;
    virtual std::unique_ptr<GasTrackerInterface> make_gas_tracker(GasEvent& gas_event,
                                                                  const Instruction& instruction,
                                                                  ContextInterface& context) = 0;
};

class ExecutionComponentsProvider : public ExecutionComponentsProviderInterface {
  public:
    ExecutionComponentsProvider(RangeCheckInterface& range_check, const InstructionInfoDBInterface& instruction_info_db)
        : range_check(range_check)
        , instruction_info_db(instruction_info_db)
    {}
    std::unique_ptr<AddressingInterface> make_addressing(AddressingEvent& event) override;

    std::unique_ptr<GasTrackerInterface> make_gas_tracker(GasEvent& gas_event,
                                                          const Instruction& instruction,
                                                          ContextInterface& context) override;

  private:
    RangeCheckInterface& range_check;
    const InstructionInfoDBInterface& instruction_info_db;

    // Sadly someone has to own these.
    // TODO(fcarreiro): We are creating one of these per execution row and only releasing them at
    // the end of the TX. Ideally we'd improve this.
    std::vector<std::unique_ptr<EventEmitterInterface<AddressingEvent>>> addressing_event_emitters;
};

} // namespace bb::avm2::simulation

#pragma once

#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

class GasTrackerInterface {
  public:
    virtual ~GasTrackerInterface() = default;
    // @throws OutOfGasException.
    virtual void consume_base_gas() = 0;
    // @throws OutOfGasException.
    virtual void consume_dynamic_gas(Gas dynamic_gas_factor) = 0;

    // Events
    virtual GasEvent finish() = 0;
};

class GasTracker final : public GasTrackerInterface {
  public:
    GasTracker(const InstructionInfoDBInterface& instruction_info_db,
               ContextInterface& context,
               const Instruction& instruction)
        : instruction_info_db(instruction_info_db)
        , context(context)
        , instruction(instruction)
    {
        gas_event.prev_gas_used = context.get_gas_used();
    }

    void consume_base_gas() override;
    void consume_dynamic_gas(Gas dynamic_gas_factor) override;
    GasEvent finish() override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    ContextInterface& context;
    const Instruction& instruction;
    GasEvent gas_event = {};
};

} // namespace bb::avm2::simulation

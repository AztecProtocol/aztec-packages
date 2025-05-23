#pragma once

#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

class GasTrackerInterface {
  public:
    virtual ~GasTrackerInterface() = default;
    virtual void set_instruction(const Instruction& instruction) = 0;
    // @throws OutOfGasException.
    virtual void consume_base_gas() = 0;
    // @throws OutOfGasException.
    virtual void consume_dynamic_gas(Gas dynamic_gas_factor) = 0;

    // Events
    virtual GasEvent finish() = 0;
};

class GasTracker final : public GasTrackerInterface {
  public:
    GasTracker(const InstructionInfoDBInterface& instruction_info_db, ContextInterface& context)
        : instruction_info_db(instruction_info_db)
        , context(context)
    {}

    void set_instruction(const Instruction& instruction) override;
    void consume_base_gas() override;
    void consume_dynamic_gas(Gas dynamic_gas_factor) override;
    GasEvent finish() override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    ContextInterface& context;
    Instruction instruction;
    GasEvent gas_event = {};
};

} // namespace bb::avm2::simulation

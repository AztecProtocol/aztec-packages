#pragma once

#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

class GasTrackerInterface {
  public:
    virtual ~GasTrackerInterface() = default;
    // @throws OutOfGasException.
    virtual void consumeBaseGas() = 0;
    virtual void consumeDynamicGas(Gas dynamic_gas_factor) = 0;

    // Events
    virtual GasEvent finish() = 0;
};

class GasTracker final : public GasTrackerInterface {
  public:
    GasTracker(const InstructionInfoDBInterface& instruction_info_db,
               const AddressingInterface& addressing,
               ContextInterface& context,
               const Instruction& instruction)
        : instruction_info_db(instruction_info_db)
        , addressing(addressing)
        , context(context)
        , instruction(instruction)
    {}

    void consumeBaseGas() override;
    void consumeDynamicGas(Gas dynamic_gas_factor) override;
    GasEvent finish() override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    const AddressingInterface& addressing;
    ContextInterface& context;
    const Instruction& instruction;
    GasEvent gas_event;
};

} // namespace bb::avm2::simulation

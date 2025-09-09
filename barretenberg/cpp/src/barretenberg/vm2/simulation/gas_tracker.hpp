#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

class GasTrackerInterface {
  public:
    virtual ~GasTrackerInterface() = default;
    // @throws OutOfGasException.
    virtual void consume_gas(const Gas& dynamic_gas_factor = { 0, 0 }) = 0;

    virtual Gas compute_gas_limit_for_call(const Gas& allocated_gas) = 0;
};

class GasTracker final : public GasTrackerInterface {
  public:
    GasTracker(GasEvent& gas_event,
               const Instruction& instruction,
               const InstructionInfoDBInterface& instruction_info_db,
               ContextInterface& context,
               GreaterThanInterface& greater_than);

    void consume_gas(const Gas& dynamic_gas_factor = { 0, 0 }) override;
    Gas compute_gas_limit_for_call(const Gas& allocated_gas) override;

  private:
    ContextInterface& context;
    const ExecInstructionSpec& spec;
    GreaterThanInterface& greater_than;
    GasEvent& gas_event;
};

} // namespace bb::avm2::simulation

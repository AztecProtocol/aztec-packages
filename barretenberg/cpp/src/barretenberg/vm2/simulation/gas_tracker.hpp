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

    virtual Gas compute_gas_limit_for_call(Gas allocated_gas) = 0;

    // Events
    virtual GasEvent finish() = 0;
};

// Wider type used for intermediate gas calculations.
// Do NOT use externally to the gas tracker.
struct IntermediateGas {
    uint64_t l2Gas;
    uint64_t daGas;

    IntermediateGas operator+(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2Gas = l2Gas + other.l2Gas, .daGas = daGas + other.daGas };
    }

    IntermediateGas operator*(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2Gas = l2Gas * other.l2Gas, .daGas = daGas * other.daGas };
    }

    Gas to_gas() const
    {
        assert(l2Gas <= std::numeric_limits<uint32_t>::max());
        assert(daGas <= std::numeric_limits<uint32_t>::max());
        return Gas{ .l2Gas = static_cast<uint32_t>(l2Gas), .daGas = static_cast<uint32_t>(daGas) };
    }
};

class GasTracker final : public GasTrackerInterface {
  public:
    GasTracker(const InstructionInfoDBInterface& instruction_info_db,
               ContextInterface& context,
               RangeCheckInterface& range_check)
        : instruction_info_db(instruction_info_db)
        , context(context)
        , range_check(range_check)
    {}

    void set_instruction(const Instruction& instruction) override;
    void consume_base_gas() override;
    void consume_dynamic_gas(Gas dynamic_gas_factor) override;
    Gas compute_gas_limit_for_call(Gas allocated_gas) override;
    GasEvent finish() override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    ContextInterface& context;
    RangeCheckInterface& range_check;

    ExecutionOpCode exec_opcode;
    uint16_t indirect;
    // When we go out of gas, we set the limits in context instead of the actual gas used.
    // However we need the actual gas used due to some circuit constraints. See comment in finish()
    IntermediateGas actual_gas_used = {};

    GasEvent gas_event = {};
};

} // namespace bb::avm2::simulation

#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// A lightweight, stack-allocated gas tracker for pure simulation.
// Unlike GasTracker, this doesn't populate a GasEvent (no tracing overhead).
class PureGasTracker final : public GasTrackerInterface {
  public:
    PureGasTracker(const InstructionInfoDBInterface& instruction_info_db)
        : instruction_info_db(instruction_info_db)
    {}

    // Initialize for a new instruction. Call this before consume_gas().
    void init(const Instruction& instruction, ContextInterface& ctx)
    {
        context = &ctx;
        spec = &instruction_info_db.get(instruction.get_exec_opcode());
        addressing_gas = compute_addressing_gas(instruction.indirect);
    }

    void consume_gas(const Gas& dynamic_gas_factor = { 0, 0 }) override
    {
        // Base gas.
        Gas prev_gas_used = context->get_gas_used();
        const uint32_t base_da_gas = spec->gas_cost.base_da;

        // Compute base gas used (wider type for overflow safety).
        uint64_t base_l2 = static_cast<uint64_t>(prev_gas_used.l2_gas) + addressing_gas + spec->gas_cost.opcode_gas;
        uint64_t base_da = static_cast<uint64_t>(prev_gas_used.da_gas) + base_da_gas;

        Gas gas_limit = context->get_gas_limit();

        bool oog_base_l2 = base_l2 > gas_limit.l2_gas;
        bool oog_base_da = base_da > gas_limit.da_gas;

        // Dynamic gas.
        uint64_t total_l2 = base_l2 + static_cast<uint64_t>(spec->gas_cost.dyn_l2) * dynamic_gas_factor.l2_gas;
        uint64_t total_da = base_da + static_cast<uint64_t>(spec->gas_cost.dyn_da) * dynamic_gas_factor.da_gas;

        bool oog_total_l2 = total_l2 > gas_limit.l2_gas;
        bool oog_total_da = total_da > gas_limit.da_gas;

        if (oog_base_l2 || oog_base_da) {
            throw OutOfGasException(format("Out of gas (base): L2 used ",
                                           base_l2,
                                           " of ",
                                           gas_limit.l2_gas,
                                           ", DA used ",
                                           base_da,
                                           " of ",
                                           gas_limit.da_gas));
        }

        if (oog_total_l2 || oog_total_da) {
            throw OutOfGasException(format("Out of gas (dynamic): L2 used ",
                                           total_l2,
                                           " of ",
                                           gas_limit.l2_gas,
                                           ", DA used ",
                                           total_da,
                                           " of ",
                                           gas_limit.da_gas));
        }

        // Safe downcast since if we were over 32 bits, we would have OOG'd.
        context->set_gas_used(Gas{ static_cast<uint32_t>(total_l2), static_cast<uint32_t>(total_da) });
    }

    Gas compute_gas_limit_for_call(const Gas& allocated_gas) override
    {
        Gas gas_left = context->gas_left();
        return {
            .l2_gas = (gas_left.l2_gas > allocated_gas.l2_gas) ? allocated_gas.l2_gas : gas_left.l2_gas,
            .da_gas = (gas_left.da_gas > allocated_gas.da_gas) ? allocated_gas.da_gas : gas_left.da_gas,
        };
    }

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    ContextInterface* context = nullptr;
    const ExecInstructionSpec* spec = nullptr;
    uint32_t addressing_gas = 0;
};

} // namespace bb::avm2::simulation

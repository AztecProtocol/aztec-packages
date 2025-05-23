#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

void GasTracker::set_instruction(const Instruction& instruction)
{
    exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    indirect = instruction.indirect;

    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);
    gas_event.opcode_gas = spec.gas_cost.opcode_gas;
    gas_event.addressing_gas = compute_addressing_gas(indirect);

    gas_event.base_gas = Gas{
        gas_event.opcode_gas + gas_event.addressing_gas,
        spec.gas_cost.base_da,
    };

    gas_event.dynamic_gas = Gas{ spec.gas_cost.dyn_l2, spec.gas_cost.dyn_da };
}

void GasTracker::consume_base_gas()
{
    Gas prev_gas_used = context.get_gas_used();

    Gas gas_limit = context.get_gas_limit();

    Gas gas_used = prev_gas_used + gas_event.base_gas;

    gas_event.oog_base_l2 = gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_base_da = gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_base_l2 || gas_event.oog_base_da) {
        context.set_gas_used(gas_limit);

        throw OutOfGasException(GasPhase::BASE, gas_event.oog_base_l2 ? GasDimension::L2 : GasDimension::DA);
    }
    context.set_gas_used(gas_used);
}

void GasTracker::consume_dynamic_gas(Gas dynamic_gas_factor)
{
    gas_event.dynamic_gas_factor = dynamic_gas_factor;
    gas_event.dynamic_gas_used = Gas{
        .l2Gas = gas_event.dynamic_gas.l2Gas * dynamic_gas_factor.l2Gas,
        .daGas = gas_event.dynamic_gas.daGas * dynamic_gas_factor.daGas,
    };

    Gas prev_gas_used = context.get_gas_used();
    Gas gas_limit = context.get_gas_limit();

    Gas gas_used = prev_gas_used + gas_event.dynamic_gas_used;

    gas_event.oog_dynamic_l2 = gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_dynamic_da = gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_dynamic_l2 || gas_event.oog_dynamic_da) {
        context.set_gas_used(gas_limit);
        throw OutOfGasException(GasPhase::DYNAMIC, gas_event.oog_dynamic_l2 ? GasDimension::L2 : GasDimension::DA);
    }
    context.set_gas_used(gas_used);
}

GasEvent GasTracker::finish()
{
    return gas_event;
}

} // namespace bb::avm2::simulation

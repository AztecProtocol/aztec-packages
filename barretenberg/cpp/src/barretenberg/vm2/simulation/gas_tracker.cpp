#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

void GasTracker::consumeBaseGas()
{
    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    gas_event.opcode_gas = spec.gas_cost.base_l2;

    gas_event.addressing_gas = compute_addressing_gas(instruction.indirect);

    gas_event.base_gas = Gas{
        gas_event.opcode_gas + gas_event.addressing_gas,
        spec.gas_cost.base_da,
    };

    Gas prev_gas_used = context.get_gas_used();
    Gas gas_limit = context.get_gas_limit();

    Gas gas_used = prev_gas_used;
    gas_used.l2Gas += gas_event.base_gas.l2Gas;
    gas_used.daGas += gas_event.base_gas.daGas;

    std::cout << "gas used after base gas: l2=" << gas_used.l2Gas << " da=" << gas_used.daGas << std::endl;
    std::cout << "gas limit: l2=" << gas_limit.l2Gas << " da=" << gas_limit.daGas << std::endl;

    gas_event.oog_l2_base = gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_da_base = gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_l2_base || gas_event.oog_da_base) {
        context.set_gas_used(gas_limit);

        throw OutOfGasException(GasPhase::BASE, gas_event.oog_l2_base ? GasDimension::L2 : GasDimension::DA);
    }
    context.set_gas_used(gas_used);
}

void GasTracker::consumeDynamicGas(Gas dynamic_gas_factor)
{
    gas_event.dynamic_gas_factor = dynamic_gas_factor;
    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    gas_event.dynamic_gas = Gas{
        dynamic_gas_factor.l2Gas * spec.gas_cost.dyn_l2,
        dynamic_gas_factor.daGas * spec.gas_cost.dyn_da,
    };

    Gas prev_gas_used = context.get_gas_used();
    Gas gas_limit = context.get_gas_limit();
    Gas gas_used = prev_gas_used;
    gas_used.l2Gas += gas_event.dynamic_gas.l2Gas;
    gas_used.daGas += gas_event.dynamic_gas.daGas;

    gas_event.oog_l2_dynamic = gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_da_dynamic = gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_l2_dynamic || gas_event.oog_da_dynamic) {
        context.set_gas_used(gas_limit);
        throw OutOfGasException(GasPhase::DYNAMIC, gas_event.oog_l2_dynamic ? GasDimension::L2 : GasDimension::DA);
    }
    context.set_gas_used(gas_used);
}

GasEvent GasTracker::finish()
{
    return gas_event;
}

} // namespace bb::avm2::simulation

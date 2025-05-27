#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include <cstddef>

#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

namespace bb::avm2::simulation {

namespace {

IntermediateGas to_intermediate_gas(const Gas& gas)
{
    return IntermediateGas{ .l2Gas = static_cast<uint64_t>(gas.l2Gas), .daGas = static_cast<uint64_t>(gas.daGas) };
}

} // namespace

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

    // Previous gas used can be up to 2**32 - 1
    actual_gas_used = to_intermediate_gas(prev_gas_used) + to_intermediate_gas(gas_event.base_gas);

    IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    gas_event.oog_base_l2 = actual_gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_base_da = actual_gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_base_l2 || gas_event.oog_base_da) {
        context.set_gas_used(gas_limit.to_gas());

        throw OutOfGasException(GasPhase::BASE, gas_event.oog_base_l2 ? GasDimension::L2 : GasDimension::DA);
    }
    // Safe downcast since if we were over 32 bits, we would have OOG'd
    context.set_gas_used(actual_gas_used.to_gas());
}

void GasTracker::consume_dynamic_gas(Gas dynamic_gas_factor)
{
    gas_event.dynamic_gas_factor = dynamic_gas_factor;

    IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    actual_gas_used =
        actual_gas_used + (to_intermediate_gas(gas_event.dynamic_gas) * to_intermediate_gas(dynamic_gas_factor));

    gas_event.oog_dynamic_l2 = actual_gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_dynamic_da = actual_gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_dynamic_l2 || gas_event.oog_dynamic_da) {
        context.set_gas_used(gas_limit.to_gas());
        throw OutOfGasException(GasPhase::DYNAMIC, gas_event.oog_dynamic_l2 ? GasDimension::L2 : GasDimension::DA);
    }
    // Safe downcast since if we were over 32 bits, we would have OOG'd
    context.set_gas_used(actual_gas_used.to_gas());
}

GasEvent GasTracker::finish()
{
    // This is a bit of an abstraction leak from the circuit. We have optimized the circuit so gas is
    // checked against the limit only once. This means that we need to call the range check gadget
    // on finish, since if gas is fine on base we won't call the range check gadget, and then we might
    // not call consume_dynamic_gas.
    IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    gas_event.limit_used_l2_cmp_diff = gas_event.oog_base_l2 || gas_event.oog_dynamic_l2
                                           ? actual_gas_used.l2Gas - gas_limit.l2Gas - 1
                                           : gas_limit.l2Gas - actual_gas_used.l2Gas;
    gas_event.limit_used_da_cmp_diff = gas_event.oog_base_da || gas_event.oog_dynamic_da
                                           ? actual_gas_used.daGas - gas_limit.daGas - 1
                                           : gas_limit.daGas - actual_gas_used.daGas;

    range_check.assert_range(gas_event.limit_used_l2_cmp_diff, 64);
    range_check.assert_range(gas_event.limit_used_da_cmp_diff, 64);

    return gas_event;
}

} // namespace bb::avm2::simulation

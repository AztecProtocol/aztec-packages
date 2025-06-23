#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include <cstddef>
#include <cstdint>

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
    gas_event.addressing_gas = compute_addressing_gas(indirect);

    gas_event.base_l2_gas = spec.gas_cost.opcode_gas + gas_event.addressing_gas;
}

void GasTracker::consume_base_gas()
{
    Gas prev_gas_used = context.get_gas_used();
    const uint32_t base_da_gas = instruction_info_db.get(exec_opcode).gas_cost.base_da;

    // Previous gas used can be up to 2**32 - 1
    actual_gas_used = to_intermediate_gas(prev_gas_used) + to_intermediate_gas({ gas_event.base_l2_gas, base_da_gas });

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
    const uint32_t dynamic_l2_gas = instruction_info_db.get(exec_opcode).gas_cost.dyn_l2;
    const uint32_t dynamic_da_gas = instruction_info_db.get(exec_opcode).gas_cost.dyn_da;

    actual_gas_used = actual_gas_used + (to_intermediate_gas(Gas{ dynamic_l2_gas, dynamic_da_gas }) *
                                         to_intermediate_gas(dynamic_gas_factor));

    gas_event.oog_dynamic_l2 = actual_gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_dynamic_da = actual_gas_used.daGas > gas_limit.daGas;

    if (gas_event.oog_dynamic_l2 || gas_event.oog_dynamic_da) {
        context.set_gas_used(gas_limit.to_gas());
        throw OutOfGasException(GasPhase::DYNAMIC, gas_event.oog_dynamic_l2 ? GasDimension::L2 : GasDimension::DA);
    }
    // Safe downcast since if we were over 32 bits, we would have OOG'd
    context.set_gas_used(actual_gas_used.to_gas());
}

// Gas limit for call is the minimum between the gas allocated to the call by the user, and the gas left.
// This applies to both gas dimensions independently.
Gas GasTracker::compute_gas_limit_for_call(Gas allocated_gas)
{
    Gas gas_left = context.gas_left();

    bool is_l2_gas_allocated_lt_left = allocated_gas.l2Gas < gas_left.l2Gas;
    uint32_t l2_gas_comparison_witness =
        is_l2_gas_allocated_lt_left ? gas_left.l2Gas - allocated_gas.l2Gas - 1 : allocated_gas.l2Gas - gas_left.l2Gas;

    bool is_da_gas_allocated_lt_left = allocated_gas.daGas < gas_left.daGas;
    uint32_t da_gas_comparison_witness =
        is_da_gas_allocated_lt_left ? gas_left.daGas - allocated_gas.daGas - 1 : allocated_gas.daGas - gas_left.daGas;

    range_check.assert_range(l2_gas_comparison_witness, 32);
    range_check.assert_range(da_gas_comparison_witness, 32);

    return Gas{
        is_l2_gas_allocated_lt_left ? allocated_gas.l2Gas : gas_left.l2Gas,
        is_da_gas_allocated_lt_left ? allocated_gas.daGas : gas_left.daGas,
    };
}

GasEvent GasTracker::finish()
{
    // This is a bit of an abstraction leak from the circuit. We have optimized the circuit so gas is
    // checked against the limit only once. This means that we need to call the range check gadget
    // on finish, since if gas is fine on base we won't call the range check gadget, and then we might
    // not call consume_dynamic_gas.
    IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    gas_event.limit_used_l2_comparison_witness = gas_event.oog_base_l2 || gas_event.oog_dynamic_l2
                                                     ? actual_gas_used.l2Gas - gas_limit.l2Gas - 1
                                                     : gas_limit.l2Gas - actual_gas_used.l2Gas;
    gas_event.limit_used_da_comparison_witness = gas_event.oog_base_da || gas_event.oog_dynamic_da
                                                     ? actual_gas_used.daGas - gas_limit.daGas - 1
                                                     : gas_limit.daGas - actual_gas_used.daGas;

    range_check.assert_range(gas_event.limit_used_l2_comparison_witness, 64);
    range_check.assert_range(gas_event.limit_used_da_comparison_witness, 64);

    return gas_event;
}

} // namespace bb::avm2::simulation

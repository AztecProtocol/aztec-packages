#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/gas.hpp"

namespace bb::avm2::simulation {
namespace {

// Wider type used for intermediate gas calculations.
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

IntermediateGas to_intermediate_gas(const Gas& gas)
{
    return IntermediateGas{ .l2Gas = static_cast<uint64_t>(gas.l2Gas), .daGas = static_cast<uint64_t>(gas.daGas) };
}

} // namespace

GasTracker::GasTracker(GasEvent& gas_event,
                       const Instruction& instruction,
                       const InstructionInfoDBInterface& instruction_info_db,
                       ContextInterface& context,
                       RangeCheckInterface& range_check)
    : context(context)
    , spec(instruction_info_db.get(instruction.get_exec_opcode()))
    , range_check(range_check)
    , gas_event(gas_event)
{
    gas_event.addressing_gas = compute_addressing_gas(instruction.indirect);
}

void GasTracker::consume_gas(const Gas& dynamic_gas_factor)
{
    // Base.
    Gas prev_gas_used = context.get_gas_used();
    const uint32_t base_da_gas = spec.gas_cost.base_da;

    // Previous gas used can be up to 2**32 - 1
    IntermediateGas base_actual_gas_used =
        to_intermediate_gas(prev_gas_used) +
        to_intermediate_gas({ gas_event.addressing_gas + spec.gas_cost.opcode_gas, base_da_gas });
    IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    bool oog_base_l2 = base_actual_gas_used.l2Gas > gas_limit.l2Gas;
    bool oog_base_da = base_actual_gas_used.daGas > gas_limit.daGas;

    // Dynamic.
    gas_event.dynamic_gas_factor = dynamic_gas_factor;

    const uint32_t dynamic_l2_gas = spec.gas_cost.dyn_l2;
    const uint32_t dynamic_da_gas = spec.gas_cost.dyn_da;

    IntermediateGas total_gas_used =
        base_actual_gas_used +
        (to_intermediate_gas(Gas{ dynamic_l2_gas, dynamic_da_gas }) * to_intermediate_gas(dynamic_gas_factor));

    gas_event.oog_l2 = total_gas_used.l2Gas > gas_limit.l2Gas;
    gas_event.oog_da = total_gas_used.daGas > gas_limit.daGas;

    // This is a bit of an abstraction leak from the circuit. We have optimized the circuit so gas is
    // checked against the limit only once. This means that we need to call the range check gadget
    // on finish, since if gas is fine on base we won't call the range check gadget, and then we might
    // not call consume_dynamic_gas.
    gas_event.limit_used_l2_comparison_witness =
        gas_event.oog_l2 ? total_gas_used.l2Gas - gas_limit.l2Gas - 1 : gas_limit.l2Gas - total_gas_used.l2Gas;
    gas_event.limit_used_da_comparison_witness =
        gas_event.oog_da ? total_gas_used.daGas - gas_limit.daGas - 1 : gas_limit.daGas - total_gas_used.daGas;

    range_check.assert_range(gas_event.limit_used_l2_comparison_witness, 64);
    range_check.assert_range(gas_event.limit_used_da_comparison_witness, 64);

    if (oog_base_l2 || oog_base_da) {
        throw OutOfGasException(format("Out of gas (base): L2 used ",
                                       base_actual_gas_used.l2Gas,
                                       " of ",
                                       gas_limit.l2Gas,
                                       ", DA used ",
                                       base_actual_gas_used.daGas,
                                       " of ",
                                       gas_limit.daGas));
    } else if (gas_event.oog_l2 || gas_event.oog_da) {
        throw OutOfGasException(format("Out of gas (dynamic): L2 used ",
                                       total_gas_used.l2Gas,
                                       " of ",
                                       gas_limit.l2Gas,
                                       ", DA used ",
                                       total_gas_used.daGas,
                                       " of ",
                                       gas_limit.daGas));
    }

    // Safe downcast since if we were over 32 bits, we would have OOG'd.
    context.set_gas_used(total_gas_used.to_gas());
}

// Gas limit for call is the minimum between the gas allocated to the call by the user, and the gas left.
// This applies to both gas dimensions independently.
// This method does not emit a gas event.
Gas GasTracker::compute_gas_limit_for_call(const Gas& allocated_gas)
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

    return {
        .l2Gas = is_l2_gas_allocated_lt_left ? allocated_gas.l2Gas : gas_left.l2Gas,
        .daGas = is_da_gas_allocated_lt_left ? allocated_gas.daGas : gas_left.daGas,
    };
}

} // namespace bb::avm2::simulation

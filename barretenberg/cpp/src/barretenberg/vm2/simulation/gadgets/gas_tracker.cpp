#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/gas.hpp"

namespace bb::avm2::simulation {
namespace {

// Wider type used for intermediate gas calculations.
struct IntermediateGas {
    uint64_t l2_gas;
    uint64_t da_gas;

    IntermediateGas operator+(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2_gas = this->l2_gas + other.l2_gas, .da_gas = this->da_gas + other.da_gas };
    }

    IntermediateGas operator*(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2_gas = l2_gas * other.l2_gas, .da_gas = da_gas * other.da_gas };
    }

    Gas to_gas() const
    {
        assert(l2_gas <= std::numeric_limits<uint32_t>::max());
        assert(da_gas <= std::numeric_limits<uint32_t>::max());
        return Gas{ .l2_gas = static_cast<uint32_t>(l2_gas), .da_gas = static_cast<uint32_t>(da_gas) };
    }
};

IntermediateGas to_intermediate_gas(const Gas& gas)
{
    return IntermediateGas{ .l2_gas = static_cast<uint64_t>(gas.l2_gas), .da_gas = static_cast<uint64_t>(gas.da_gas) };
}

} // namespace

GasTracker::GasTracker(GasEvent& gas_event,
                       const Instruction& instruction,
                       const InstructionInfoDBInterface& instruction_info_db,
                       ContextInterface& context,
                       GreaterThanInterface& greater_than)
    : context(context)
    , spec(instruction_info_db.get(instruction.get_exec_opcode()))
    , greater_than(greater_than)
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

    bool oog_base_l2 = base_actual_gas_used.l2_gas > gas_limit.l2_gas;
    bool oog_base_da = base_actual_gas_used.da_gas > gas_limit.da_gas;

    // Dynamic.
    gas_event.dynamic_gas_factor = dynamic_gas_factor;

    const uint32_t dynamic_l2_gas = spec.gas_cost.dyn_l2;
    const uint32_t dynamic_da_gas = spec.gas_cost.dyn_da;

    IntermediateGas total_gas_used =
        base_actual_gas_used +
        (to_intermediate_gas(Gas{ dynamic_l2_gas, dynamic_da_gas }) * to_intermediate_gas(dynamic_gas_factor));

    gas_event.total_gas_used_l2 = total_gas_used.l2_gas;
    gas_event.total_gas_used_da = total_gas_used.da_gas;

    gas_event.oog_l2 = greater_than.gt(total_gas_used.l2_gas, gas_limit.l2_gas);
    gas_event.oog_da = greater_than.gt(total_gas_used.da_gas, gas_limit.da_gas);

    if (oog_base_l2 || oog_base_da) {
        throw OutOfGasException(format("Out of gas (base): L2 used ",
                                       base_actual_gas_used.l2_gas,
                                       " of ",
                                       gas_limit.l2_gas,
                                       ", DA used ",
                                       base_actual_gas_used.da_gas,
                                       " of ",
                                       gas_limit.da_gas));
    }

    if (gas_event.oog_l2 || gas_event.oog_da) {
        throw OutOfGasException(format("Out of gas (dynamic): L2 used ",
                                       total_gas_used.l2_gas,
                                       " of ",
                                       gas_limit.l2_gas,
                                       ", DA used ",
                                       total_gas_used.da_gas,
                                       " of ",
                                       gas_limit.da_gas));
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

    bool is_l2_gas_allocated_lt_left = greater_than.gt(gas_left.l2_gas, allocated_gas.l2_gas);
    bool is_da_gas_allocated_lt_left = greater_than.gt(gas_left.da_gas, allocated_gas.da_gas);

    return {
        .l2_gas = is_l2_gas_allocated_lt_left ? allocated_gas.l2_gas : gas_left.l2_gas,
        .da_gas = is_da_gas_allocated_lt_left ? allocated_gas.da_gas : gas_left.da_gas,
    };
}

} // namespace bb::avm2::simulation

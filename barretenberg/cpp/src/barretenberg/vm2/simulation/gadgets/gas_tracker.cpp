#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/gas.hpp"

namespace bb::avm2::simulation {
namespace {

// Wider type used for intermediate gas calculations.
struct IntermediateGas {
    uint64_t l2_gas = 0;
    uint64_t da_gas = 0;

    IntermediateGas operator+(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2_gas = this->l2_gas + other.l2_gas, .da_gas = this->da_gas + other.da_gas };
    }

    IntermediateGas operator*(const IntermediateGas& other) const
    {
        return IntermediateGas{ .l2_gas = this->l2_gas * other.l2_gas, .da_gas = this->da_gas * other.da_gas };
    }

    Gas to_gas() const
    {
        assert(l2_gas <= std::numeric_limits<uint32_t>::max());
        assert(da_gas <= std::numeric_limits<uint32_t>::max());
        return Gas{ .l2_gas = static_cast<uint32_t>(l2_gas), .da_gas = static_cast<uint32_t>(da_gas) };
    }
};

/**
 * @brief Converts a gas to an intermediate gas (wider type used for intermediate gas calculations).
 *
 * @param gas The gas to convert.
 * @return IntermediateGas The intermediate gas.
 */
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
    gas_event.addressing_gas = static_cast<uint32_t>(compute_addressing_gas(instruction.indirect));
}

/**
 * @brief Consumes gas for the current instruction.
 *
 * @param dynamic_gas_factor The dynamic gas factor. Defaults to { 0, 0 } if not provided.
 * @throws OutOfGasException if the gas is depleted.
 */
void GasTracker::consume_gas(const Gas& dynamic_gas_factor)
{
    // Previous gas used + base gas (for L2 is addressing gas + opcode gas, for DA is base DA gas) +
    // dynamic gas (for L2 is dyn_l2 * dynamic_gas_factor.l2_gas, for DA is dyn_da * dynamic_gas_factor.da_gas).
    const IntermediateGas total_gas_used =
        to_intermediate_gas(context.get_gas_used()) + // Previous gas used (can be up to 2**32 - 1).
        IntermediateGas{ gas_event.addressing_gas + spec.gas_cost.opcode_gas, spec.gas_cost.base_da } +
        (IntermediateGas{ spec.gas_cost.dyn_l2, spec.gas_cost.dyn_da } * // Dynamic gas.
         to_intermediate_gas(dynamic_gas_factor));

    // Base L2 gas (gas_event.addressing_gas + spec.gas_cost.opcode_gas) does not overflow uint32_t. It is guaranteed by
    // the static assert in compute_addressing_gas() that addressing gas fits in 16 bits and spec.gas_cost.opcode_gas is
    // uint16_t. Note also that dyn_l2 and dyn_da are uint16_t so that the product does not overflow uint64_t.

    const IntermediateGas gas_limit = to_intermediate_gas(context.get_gas_limit());

    // Populate gas event values.
    gas_event.dynamic_gas_factor = dynamic_gas_factor;
    gas_event.total_gas_used_l2 = total_gas_used.l2_gas;
    gas_event.total_gas_used_da = total_gas_used.da_gas;
    // Check whether we are out of gas.
    gas_event.oog_l2 = greater_than.gt(total_gas_used.l2_gas, gas_limit.l2_gas);
    gas_event.oog_da = greater_than.gt(total_gas_used.da_gas, gas_limit.da_gas);

    if (gas_event.oog_l2 || gas_event.oog_da) {
        throw OutOfGasException(format("Out of gas: total L2 used ",
                                       total_gas_used.l2_gas,
                                       " of ",
                                       gas_limit.l2_gas,
                                       ", total DA used ",
                                       total_gas_used.da_gas,
                                       " of ",
                                       gas_limit.da_gas));
    }

    // Safe downcast since if we were over 32 bits, we would have OOG'd.
    context.set_gas_used(total_gas_used.to_gas());
}

/**
 * @brief Computes the gas limit for a call (CALL and STATICCALL opcodes) as the minimum between the gas allocated to
 *        the call by the user, and the gas left. This applies to both gas dimensions independently. This method does
 *        not emit a gas event.
 *
 * @param allocated_gas The allocated gas.
 * @return Gas The gas limit.
 */
Gas GasTracker::compute_gas_limit_for_call(const Gas& allocated_gas)
{
    Gas gas_left = context.gas_left();

    bool is_l2_gas_left_gt_allocated = greater_than.gt(gas_left.l2_gas, allocated_gas.l2_gas);
    bool is_da_gas_left_gt_allocated = greater_than.gt(gas_left.da_gas, allocated_gas.da_gas);

    return {
        .l2_gas = is_l2_gas_left_gt_allocated ? allocated_gas.l2_gas : gas_left.l2_gas,
        .da_gas = is_da_gas_left_gt_allocated ? allocated_gas.da_gas : gas_left.da_gas,
    };
}

} // namespace bb::avm2::simulation

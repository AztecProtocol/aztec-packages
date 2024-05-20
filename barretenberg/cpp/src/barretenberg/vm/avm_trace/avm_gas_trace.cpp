#include "avm_gas_trace.hpp"

namespace bb::avm_trace {

AvmGasTraceBuilder::AvmGasTraceBuilder()
{
    gas_lookup_table = construct_gas_lookup_table();
}

void AvmGasTraceBuilder::reset()
{
    gas_lookup_table.clear();
    gas_trace.clear();
}

std::vector<AvmGasTraceBuilder::GasTraceEntry> AvmGasTraceBuilder::finalize()
{
    return std::move(gas_trace);
};

void AvmGasTraceBuilder::set_initial_gas(uint32_t l2_gas, uint32_t da_gas)
{
    initial_l2_gas = l2_gas;
    initial_da_gas = da_gas;

    // Remaning gas will be mutated on each opcode
    remaining_l2_gas = l2_gas;
    reamining_da_gas = da_gas;
}

void AvmGasTraceBuilder::constrain_gas_lookup(uint32_t clk, OpCode opcode)
{
    // TODO: increase lookup counter for the opcode we are looking up into
    uint32_t opcode_idx = static_cast<uint32_t>(opcode);
    gas_opcode_lookup_counter[opcode_idx]++;

    // TODO: change this to be a lookup per opcode
    // Get the gas prices for this opcode
    uint32_t l2_gas_cost = L2_GAS_PER_OPCODE;
    uint32_t da_gas_cost = DA_GAS_PER_OPCODE;

    remaining_l2_gas -= l2_gas_cost;
    reamining_da_gas -= da_gas_cost;

    // Decrease the gas left
    // Create a gas trace entry
    GasTraceEntry entry = {
        .clk = clk,
        .opcode_idx = opcode_idx,
        .l2_gas_cost = l2_gas_cost,
        .da_gas_cost = da_gas_cost,
        .remaining_l2_gas = remaining_l2_gas,
        .remaining_da_gas = reamining_da_gas,
    };

    gas_trace.push_back(entry);

} // namespace bb::avm_trace

std::vector<AvmGasTraceBuilder::GasTableEntry> AvmGasTraceBuilder::construct_gas_lookup_table()
{
    // For now we construct a table that has a constant l2 and da gas cost
    for (uint32_t i = 0; i < static_cast<uint32_t>(OpCode::LAST_OPCODE_SENTINEL); i++) {
        GasTableEntry entry = {
            .opcode_idx = i,
            .l2_fixed_gas_cost = L2_GAS_PER_OPCODE,
            .da_fixed_gas_cost = DA_GAS_PER_OPCODE,
        };
        gas_lookup_table.push_back(entry);
    }
    return gas_lookup_table;
}

} // namespace bb::avm_trace
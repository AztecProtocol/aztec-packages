#include "avm_gas_trace.hpp"

namespace bb::avm_trace {

void AvmGasTraceBuilder::reset()
{
    gas_lookup_table.clear();
    gas_trace.clear();
}

std::vector<AvmGasTraceBuilder::GasTraceEntry> AvmGasTraceBuilder::finalize()
{
    return std::move(gas_trace);
};

void AvmGasTraceBuilder::constrain_gas_lookup(uint32_t opcode_idx)
{
    // TODO: k
    opcode_lookup_counter[opcode_idx]++;

} // namespace bb::avm_trace

std::vector AvmGasTraceBuilder::construct_gas_lookup_table()
{
    // 1. Create the gas lookup table - for now with fixed for each opcode
    // TODO: could generate this code from the typescript version of the same file
    // 2. Add this at the same time as finailsed
    // 3.
}

} // namespace bb::avm_trace
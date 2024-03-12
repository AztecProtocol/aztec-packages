#include "subcircuits.hpp"

namespace smt_subcircuits {

CircuitProps get_standard_range_constraint_circuit(size_t n)
{
    bb::StandardCircuitBuilder builder = bb::StandardCircuitBuilder();
    uint32_t a_idx = builder.add_variable(bb::fr(0));
    builder.set_variable_name(a_idx, "a");

    size_t start_gate = builder.get_num_gates();
    builder.decompose_into_base4_accumulators(a_idx, n);
    size_t num_gates = builder.get_num_gates() - start_gate;

    CircuitSchema exported = unpack_from_buffer(builder.export_circuit());
    return { exported, start_gate, num_gates, { 2 }, { num_gates - 1 } };
}

CircuitProps get_standard_logic_circuit(size_t n, bool is_xor)
{
    bb::StandardCircuitBuilder builder = bb::StandardCircuitBuilder();
    uint32_t a_idx = builder.add_variable(bb::fr(0));
    uint32_t b_idx = builder.add_variable(bb::fr(0));
    builder.set_variable_name(a_idx, "a");
    builder.set_variable_name(b_idx, "b");

    size_t start_gate = builder.get_num_gates();
    auto acc = builder.create_logic_constraint(a_idx, b_idx, n, is_xor);
    size_t num_gates = builder.get_num_gates() - start_gate;

    builder.set_variable_name(acc.out.back(), "c");

    CircuitSchema exported = unpack_from_buffer(builder.export_circuit());
    return { exported, start_gate, num_gates, { 2, 2, 2 }, { num_gates - 3, num_gates - 2, num_gates - 1 } };
}
} // namespace smt_subcircuits
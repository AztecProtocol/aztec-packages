#include "test_values.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

using bool_ct = stdlib::bool_t<StandardCircuitBuilder>;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using byte_array_ct = stdlib::byte_array<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

TEST(uint, xor_unique_witness_check){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a ^ b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    std::vector<fr> w1;
    w1.reserve(xor_unique_witness.size());

    std::vector<fr> w2;
    w2.reserve(xor_unique_witness.size());

    for(const auto &w: xor_unique_witness){
        w1.push_back(w[0]);
        w2.push_back(w[1]);
    }
    ASSERT_TRUE(circuit.simulate_circuit_eval(w1));
    ASSERT_TRUE(circuit.simulate_circuit_eval(w2));
}
#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

using bool_ct = stdlib::bool_t<StandardCircuitBuilder>;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using byte_array_ct = stdlib::byte_array<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(uint, ror7_unique_output)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_ct b = a.ror(7);
    builder.set_variable_name(b.get_witness_index(), "b");

    info("Variables: ", builder.get_num_variables());
    info("gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    Solver s(circuit_info.modulus);

    auto cirs = unique_witness_ext(circuit_info, &s, TermType::FFTerm, { "a" }, { "b" });

    bool res = smt_timer(&s);
    if (!res) {
        default_model({ "a", "b" }, cirs.first, cirs.second, &s, "ror7_unique_output.out");
    }
}

TEST(uint, ror7_unique_witness)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_ct b = a.ror(7);
    builder.set_variable_name(b.get_witness_index(), "b");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    Solver s(circuit_info.modulus);

    auto cirs = unique_witness(circuit_info, &s, TermType::FFTerm, { "a" });

    bool res = smt_timer(&s);
    if (res) {
        default_model({ "a", "b" }, cirs.first, cirs.second, &s, "ror7_unique_witness.out");
    }
}

// TEST(uint, rorol){
//     StandardCircuitBuilder builder;
//     uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//     builder.set_variable_name(a.get_witness_index(), "a");
//     uint_ct b = a.ror(7);
//     builder.set_variable_name(b.get_witness_index(), "b");
//     uint_ct c = b.rol(7);
//     builder.set_variable_name(c.get_witness_index(), "c");
//
//     info("Variables: ", builder.get_num_variables());
//     info("Constraints: ", builder.num_gates);
//
//     CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
//
//     SolverConfiguration config = {true, 0};
//     Solver s(circuit_info.modulus, config, 16);
//
//     Circuit<FFTerm> circuit(circuit_info, &s);
//
//     circuit["c"] != circuit["a"];
//
//     bool res = smt_timer(&s);
//     if(!res){
//         return;
//     }
//     default_model_single({"a", "b", "c"}, circuit, &s, "rorol7.out");
// }
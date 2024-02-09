#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

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

TEST(uint, uint_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a"});
    info(cirs.first[a.get_witness_index()]);
    info(a.get_witness_index());

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({}, cirs.first, cirs.second, &s, "uint_unique_witness.txt");
}
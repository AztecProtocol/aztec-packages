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

TEST(uint, uint_unique_witness)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");

    info("Variables: ", builder.get_num_variables());
    info("Gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = default_solver_config;
    Solver s(circuit_info.modulus, config);

    auto cirs = unique_witness(circuit_info, &s, TermType::FFTerm, { "a" });

    bool res = smt_timer(&s);
    if (res) {
        default_model({}, cirs.first, cirs.second, &s, "uint_unique_witness.txt");
    }
}

TEST(uint, uint_unique_witness_split_gb)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");

    info("Variables: ", builder.get_num_variables());
    info("Gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = default_solver_config;
    config.ff_disjunctive_bit = true;
    config.ff_solver = "split";
    Solver s(circuit_info.modulus, config);

    auto cirs = unique_witness(circuit_info, &s, TermType::FFTerm, { "a" });

    bool res = smt_timer(&s);
    if (res) {
        default_model({}, cirs.first, cirs.second, &s, "uint_unique_witness.txt");
    }
}
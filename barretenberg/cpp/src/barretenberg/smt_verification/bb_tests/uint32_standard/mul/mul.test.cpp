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
// TODO(alex): Try with normalize
TEST(uint, mul_unique_witness)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    Solver s(circuit_info.modulus);

    auto cirs = unique_witness(circuit_info, &s, TermType::FFTerm, { "a", "b" });

    bool res = smt_timer(&s);
    if (res) {
        default_model({ "a", "b", "c" }, cirs.first, cirs.second, &s, "mul_unique_witness.out");
    }
}

TEST(uint, mul_unique_output)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    Solver s(circuit_info.modulus);

    std::vector<std::string> equal = { "a", "b" };
    auto cirs = unique_witness_ext(circuit_info, &s, TermType::FFTerm, { "a", "b" }, { "c" });

    bool res = smt_timer(&s);
    if (res) {
        default_model({ "a", "b", "c" }, cirs.first, cirs.second, &s, "mul_unique_output.out");
    }
}

// TODO(alex): try equating individual bits too
TEST(uint, mul_unique_random_solution)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Gates: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    Solver s(circuit_info.modulus);

    Circuit circuit(circuit_info, &s);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if (res) {
        default_model_single({ "a", "b", "c" }, circuit, &s, "mul_unique_random_solution.out");
    }
}
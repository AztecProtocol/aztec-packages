#include <chrono>

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

// TODO(alex): shifts, operations with constants

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

TEST(uint, xor_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a ^ b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    std::vector<std::string> equal = {"a", "b"};
    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a", "b"}, {"c"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "xor_unique_output.txt");
}

TEST(uint, xor_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a ^ b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a", "b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "xor_unique_witness.txt");
}

TEST(uint, xor_unique_random_solution){ // TODO(alex): weird stuff happening here
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

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "xor_unique_random_solution.txt");
}

TEST(uint, add_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a", "b"}, {"c"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "add_unique_output.txt");
} 

TEST(uint, add_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a", "b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "add_unique_witness.txt");
}

TEST(uint, add_unique_random_solution){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "add_unique_random_solution.txt");
}

TEST(uint, mul_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a", "b"}, {"c"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "mul_unique_output.txt");
} 

TEST(uint, mul_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a", "b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "mul_unique_witness.txt");
}

TEST(uint, mul_unique_random_solution){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a * b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "mul_unique_random_solution.txt");
}

TEST(uint, and_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a & b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    std::vector<std::string> equal = {"a", "b"};
    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a", "b"}, {"c"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "and_unique_output.txt");
}

TEST(uint, and_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a & b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a", "b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "and_unique_witness.txt");
}

TEST(uint, and_unique_random_solution){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a & b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "and_unique_random_solution.txt");
}

TEST(uint, or_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a | b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    std::vector<std::string> equal = {"a", "b"};
    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a", "b"}, {"c"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "or_unique_output.txt");
}

TEST(uint, or_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a | b;
    c.normalize();
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a", "b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b", "c"}, cirs.first, cirs.second, &s, "or_unique_witness.txt");
}

TEST(uint, or_unique_random_solution){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a | b;
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();
    circuit["c"] != c.get_value();

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "or_unique_random_solution.txt");
}
TEST(uint, ror7_unique_output){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_ct b = a.ror(7);
    builder.set_variable_name(b.get_witness_index(), "b");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness_ext<FFTerm>(circuit_info, &s, {"a"}, {"b"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b"}, cirs.first, cirs.second, &s, "ror7_unique_output.txt");
}

TEST(uint, ror7_unique_witness){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_ct b = a.ror(7);
    builder.set_variable_name(b.get_witness_index(), "b");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, {"a"});

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model({"a", "b"}, cirs.first, cirs.second, &s, "ror7_unique_witness.txt");
}

TEST(uint, rorol){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_ct b = a.ror(7);
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = b.rol(7);
    builder.set_variable_name(c.get_witness_index(), "c");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    circuit["c"] != circuit["a"];

    bool res = smt_timer(&s);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s, "rorol7.txt");
} // TODO(alex): didn't terminate in 2hrs
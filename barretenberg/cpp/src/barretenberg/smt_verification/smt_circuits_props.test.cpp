#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include <gtest/gtest.h>
#include <chrono>

using namespace bb;
using namespace smt_circuit;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using field_t = bb::stdlib::field_t<StandardCircuitBuilder>;
using witness_t = bb::stdlib::witness_t<StandardCircuitBuilder>;
using pub_witness_t = bb::stdlib::public_witness_t<StandardCircuitBuilder>;

void create_range_constrained_mul(size_t i, size_t j){
    StandardCircuitBuilder builder = StandardCircuitBuilder();

    fr tmp = uint256_t(fr::random_element()).slice(0, i);
    field_t a(witness_t(&builder, tmp));
    //field_t b(pub_witness_t(&builder, fr::random_element()));
    tmp = uint256_t(fr::random_element()).slice(0, j);
    field_t b(witness_t(&builder, tmp));
    
    field_t c = a * b;
    info(c);

    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    builder.set_variable_name(c.witness_index, "c");

    if(i != 254){
        a.create_range_constraint(i);
    }
    if(j != 254){
        b.create_range_constraint(j);
    }
    ASSERT_TRUE(builder.check_circuit());

    msgpack::sbuffer buf = builder.export_circuit();

    CircuitSchema circuit_info = unpack_from_buffer(buf);
    Solver solver(circuit_info.modulus, { true, 0 });
    Circuit<smt_terms::FFTerm> circuit(circuit_info, &solver);

    FFTerm a_s = circuit["a"];
    FFTerm b_s = circuit["b"];
    FFTerm c_s = circuit["c"];
    
    c_s == c.context->get_variable(c.witness_index);

    auto start = std::chrono::high_resolution_clock::now();
    ASSERT_TRUE(solver.check());
    auto stop = std::chrono::high_resolution_clock::now();
    double duration = static_cast<double>(duration_cast<std::chrono::milliseconds>(stop - start).count()) / 1000.0;
    
    std::unordered_map<std::string, cvc5::Term> tmpmap = {{"a", a_s}, {"b", b_s}, {"c", c_s}};
    std::unordered_map<std::string, std::string> mmap = solver.model(tmpmap);
    if(i != 254 && j != 254){
        info("Time taken ", i, ", ", j, " bits: ", duration, " seconds");
        info(mmap["a"], " ", mmap["b"], " ", mmap["c"]);
        info(solver.s.getAssertions().size());
    }else{
        info("Time taken no range constraint: ", duration, "seconds");
        info(mmap["a"], " ", mmap["b"], " ", mmap["c"]);
        info(solver.s.getAssertions().size());
    }
}

TEST(solver, range_constraints_mul){
    create_range_constrained_mul(10, 10);
}

TEST(solver, range_constraints){
    for(size_t i = 0; i < 256; i++){
        StandardCircuitBuilder builder = StandardCircuitBuilder();
        field_t a(witness_t(&builder, fr::random_element()));
        a.create_range_constraint(i);
        builder.set_variable_name(a.witness_index, "a");

        msgpack::sbuffer buf = builder.export_circuit();
        CircuitSchema circuit_info = unpack_from_buffer(buf);
        Solver solver(circuit_info.modulus, { true, 0 });
        Circuit<smt_terms::FFTerm> circuit(circuit_info, &solver);

        FFTerm a_s = circuit["a"];
        
        fr tmp = uint256_t(fr::random_element()).slice(0, i);
        a_s == tmp;

        auto start = std::chrono::high_resolution_clock::now();
        ASSERT_TRUE(solver.check());
        auto stop = std::chrono::high_resolution_clock::now();
        double duration = static_cast<double>(duration_cast<std::chrono::milliseconds>(stop - start).count()) / 1000;
        info(solver.s.getValue(a_s.term).isIntegerValue());
        std::unordered_map<std::string, cvc5::Term> tmpmap = {{"a", a_s}};
        std::unordered_map<std::string, std::string> mmap = solver.model(tmpmap);
        info("Time taken ", i, " bits: ", duration, " seconds");
        info(mmap["a"]);
        info(solver.s.getAssertions().size());       
    }
}

TEST(solver, range_constraints_int){
    for(size_t i = 0; i < 256; i++){
        StandardCircuitBuilder builder = StandardCircuitBuilder();
        field_t a(witness_t(&builder, fr::random_element()));
        a.create_range_constraint(i);
        builder.set_variable_name(a.witness_index, "a");

        msgpack::sbuffer buf = builder.export_circuit();
        CircuitSchema circuit_info = unpack_from_buffer(buf);
        Solver solver(circuit_info.modulus, { true, 0 });
        Circuit<smt_terms::FFITerm> circuit(circuit_info, &solver);

        FFITerm a_s = circuit["a"];
        
        fr tmp = uint256_t(fr::random_element()).slice(0, i);
        a_s == tmp;

        auto start = std::chrono::high_resolution_clock::now();
        ASSERT_TRUE(solver.check());
        auto stop = std::chrono::high_resolution_clock::now();
        double duration = static_cast<double>(duration_cast<std::chrono::milliseconds>(stop - start).count()) / 1000;
        info(solver.s.getValue(a_s.term).isIntegerValue());
        std::unordered_map<std::string, cvc5::Term> tmpmap = {{"a", a_s}};
        std::unordered_map<std::string, std::string> mmap = solver.model(tmpmap);
        info("Time taken ", i, " bits: ", duration, " seconds");
        info(mmap["a"]);
        info(solver.s.getAssertions().size());       
    }
}


TEST(solver, range_constraints_mul_integers){

    size_t i = 20, j = 10;

    StandardCircuitBuilder builder = StandardCircuitBuilder(); // TODO: create_range_constraint
    fr tmp = uint256_t(fr::random_element()).slice(0, i);
    field_t a(witness_t(&builder, tmp));
    tmp = uint256_t(fr::random_element()).slice(0, j);
    field_t b(witness_t(&builder, tmp));
    field_t c = a * b;

    ASSERT_TRUE(builder.check_circuit());

    msgpack::sbuffer buf = builder.export_circuit();

    CircuitSchema circuit_info = unpack_from_buffer(buf);
    Solver solver(circuit_info.modulus, { true, 0 });

    FFITerm a_s = FFITerm::Var("a", &solver);
    FFITerm b_s = FFITerm::Var("b", &solver);
    FFITerm c_s = FFITerm::Var("c", &solver);

    FFITerm aub = FFITerm::Const("100000", &solver, 16);
    FFITerm bub = FFITerm::Const("400", &solver, 16);
    solver.s.assertFormula(solver.s.mkTerm(cvc5::Kind::LT, {a_s, aub.term}));
    solver.s.assertFormula(solver.s.mkTerm(cvc5::Kind::LT, {b_s, bub.term}));
    c_s == c.context->get_variable(c.witness_index);
    a_s * b_s == c_s;

    auto start = std::chrono::high_resolution_clock::now();
    ASSERT_TRUE(solver.check());
    auto stop = std::chrono::high_resolution_clock::now();
    double duration = static_cast<double>(duration_cast<std::chrono::milliseconds>(stop - start).count()) / 1000;
    info(solver.s.getValue(a_s.term).isIntegerValue());
    std::unordered_map<std::string, cvc5::Term> tmpmap = {{"a", a_s}, {"b", b_s}, {"c", c_s}};
    std::unordered_map<std::string, std::string> mmap = solver.model(tmpmap);
    info("Time taken ", i, ", ", j, " bits: ", duration, " seconds");
    info(mmap["a"], " ", mmap["b"], " ", mmap["c"]);
    info(solver.s.getAssertions().size());       
}

TEST(solver, range_constraints_mul_integer){

    size_t i = 20;

    StandardCircuitBuilder builder = StandardCircuitBuilder();
    fr tmp = uint256_t(fr::random_element()).slice(0, i);
    field_t a(witness_t(&builder, tmp));
    field_t b(witness_t(&builder, fr::random_element()));
    field_t c = a * b;
    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    builder.set_variable_name(c.witness_index, "c");


    ASSERT_TRUE(builder.check_circuit());

    msgpack::sbuffer buf = builder.export_circuit();

    CircuitSchema circuit_info = unpack_from_buffer(buf);
    Solver solver(circuit_info.modulus, { true, 0 });

    FFITerm a_s = FFITerm::Var("a", &solver);
    FFITerm b_s = FFITerm::Var("b", &solver);
    FFITerm c_s = FFITerm::Var("c", &solver);

    FFITerm aub = FFITerm::Const("100000", &solver, 16);
    FFITerm bub = FFITerm::Const("400", &solver, 16);
    solver.s.assertFormula(solver.s.mkTerm(cvc5::Kind::LT, {a_s, aub.term}));
    solver.s.assertFormula(solver.s.mkTerm(cvc5::Kind::LT, {b_s, bub.term}));
    c_s == c.context->get_variable(c.witness_index);

    auto start = std::chrono::high_resolution_clock::now();
    ASSERT_TRUE(solver.check());
    auto stop = std::chrono::high_resolution_clock::now();
    double duration = static_cast<double>(duration_cast<std::chrono::milliseconds>(stop - start).count()) / 1000;
    info(solver.s.getValue(a_s.term).isIntegerValue());
    std::unordered_map<std::string, cvc5::Term> tmpmap = {{"a", a_s}, {"b", b_s}, {"c", c_s}};
    std::unordered_map<std::string, std::string> mmap = solver.model(tmpmap);
    info("Time taken ", i, " bits: ", duration, " seconds");
    info(mmap["a"], " ", mmap["b"], " ", mmap["c"]);
    info(solver.s.getAssertions().size());       
}

TEST(circuit, circuit_range_constraint){
    size_t i = 5;

    StandardCircuitBuilder builder = StandardCircuitBuilder();
    field_t a(witness_t(&builder, fr::random_element()));
    a.create_range_constraint(i);

    builder.set_variable_name(a.witness_index, "a");
    field_t b(witness_t(&builder, fr::random_element()));
    field_t c = a * b;
    builder.set_variable_name(b.witness_index, "b");
    builder.set_variable_name(c.witness_index, "c");


    msgpack::sbuffer buf = builder.export_circuit();

    CircuitSchema circuit_info = unpack_from_buffer(buf);
    schema_to_python(circuit_info);
}

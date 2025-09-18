#include <fstream>
#include <iostream>
#include <string>

#include "barretenberg/common/mem.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"

#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

namespace {
auto& engine = numeric::get_randomness();
}

using Builder = UltraCircuitBuilder;

using witness_t = stdlib::witness_t<UltraCircuitBuilder>;
using pub_witness_t = stdlib::public_witness_t<UltraCircuitBuilder>;

using field_t = stdlib::field_t<UltraCircuitBuilder>;
using bigfield_t = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;
using rom_table_t = bb::stdlib::rom_table<Builder>;
using ram_table_t = bb::stdlib::ram_table<Builder>;
using cycle_group_t = bb::stdlib::cycle_group<Builder>;

TEST(UltraCircuitSMT, AssertEqual)
{
    auto builder = UltraCircuitBuilder();

    field_t a(witness_t(&builder, fr::random_element()));
    field_t b(witness_t(&builder, fr::random_element()));
    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    field_t c = (a + a) / (b + b + b);
    builder.set_variable_name(c.witness_index, "c");

    field_t d(witness_t(&builder, a.get_value()));
    field_t e(witness_t(&builder, b.get_value()));
    field_t f(witness_t(&builder, c.get_value()));
    builder.assert_equal(d.get_witness_index(), a.get_witness_index());
    builder.assert_equal(e.get_witness_index(), b.get_witness_index());

    field_t g = d + d;
    field_t h = e + e + e;
    field_t i = g / h;
    builder.assert_equal(i.get_witness_index(), c.get_witness_index());
    field_t j(witness_t(&builder, i.get_value()));
    field_t k(witness_t(&builder, j.get_value()));
    builder.assert_equal(i.get_witness_index(), j.get_witness_index());
    builder.assert_equal(i.get_witness_index(), k.get_witness_index());

    auto buf = builder.export_circuit();
    CircuitSchema circuit_info = unpack_from_buffer(buf);
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit circuit(circuit_info, &s, TermType::FFTerm);

    ASSERT_EQ(circuit[k.get_witness_index()].term, circuit["c"].term);
    ASSERT_EQ(circuit[d.get_witness_index()].term, circuit["a"].term);
    ASSERT_EQ(circuit[e.get_witness_index()].term, circuit["b"].term);

    ASSERT_EQ(circuit[i.get_witness_index()].term, circuit[k.get_witness_index()].term);
    ASSERT_EQ(circuit[i.get_witness_index()].term, circuit[j.get_witness_index()].term);
}

TEST(UltraCircuitSMT, ArithmeticRelation)
{
    UltraCircuitBuilder builder;

    field_t a(witness_t(&builder, fr::random_element()));
    field_t b(witness_t(&builder, fr::random_element()));
    field_t c = a * a * b / (a + b * 3) - b / a;

    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    builder.set_variable_name(c.get_witness_index(), "c");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["a"] == a.get_value();
    cir["b"] == b.get_value();

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr c_solver_val = string_to_fr(s[cir["c"]], /*base=*/10);
    ASSERT_EQ(c_solver_val, c.get_value());
}

TEST(UltraCircuitSMT, EllipticRelationADD)
{
    UltraCircuitBuilder builder;

    auto p1 =
        cycle_group_t::from_witness(&builder, bb::stdlib::cycle_group<Builder>::Curve::AffineElement::random_element());
    auto p2 =
        cycle_group_t::from_witness(&builder, bb::stdlib::cycle_group<Builder>::Curve::AffineElement::random_element());
    auto p3 = p1.unconditional_add(p2);

    builder.set_variable_name(p1.x.get_witness_index(), "x1");
    builder.set_variable_name(p2.x.get_witness_index(), "x2");
    builder.set_variable_name(p3.x.get_witness_index(), "x3");
    builder.set_variable_name(p1.y.get_witness_index(), "y1");
    builder.set_variable_name(p2.y.get_witness_index(), "y2");
    builder.set_variable_name(p3.y.get_witness_index(), "y3");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["x1"] == p1.x.get_value();
    cir["x2"] == p2.x.get_value();
    cir["y1"] == p1.y.get_value();
    cir["y2"] == p2.y.get_value();

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr x3_solver_val = string_to_fr(s[cir["x3"]], /*base=*/10);
    bb::fr y3_solver_val = string_to_fr(s[cir["y3"]], /*base=*/10);

    bb::fr x3_builder_val = p3.x.get_value();
    bb::fr y3_builder_val = p3.y.get_value();

    ASSERT_EQ(x3_solver_val, x3_builder_val);
    ASSERT_EQ(y3_solver_val, y3_builder_val);

    ((Bool(cir["x3"]) != Bool(STerm(x3_builder_val, &s, TermType::FFTerm))) |
     (Bool(cir["y3"]) != Bool(STerm(y3_builder_val, &s, TermType::FFTerm))))
        .assert_term();
    res = s.check();
    ASSERT_FALSE(res);
}

TEST(UltraCircuitSMT, EllipticRelationDBL)
{
    UltraCircuitBuilder builder;

    auto p1 =
        cycle_group_t::from_witness(&builder, bb::stdlib::cycle_group<Builder>::Curve::AffineElement::random_element());
    auto p2 = p1.dbl();

    builder.set_variable_name(p1.x.get_witness_index(), "x1");
    builder.set_variable_name(p2.x.get_witness_index(), "x2");
    builder.set_variable_name(p1.y.get_witness_index(), "y1");
    builder.set_variable_name(p2.y.get_witness_index(), "y2");
    builder.set_variable_name(p1.is_point_at_infinity().get_normalized_witness_index(), "is_inf");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["x1"] == p1.x.get_value();
    cir["y1"] == p1.y.get_value();
    cir["is_inf"] == static_cast<size_t>(p1.is_point_at_infinity().get_value());

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr x2_solver_val = string_to_fr(s[cir["x2"]], /*base=*/10);
    bb::fr y2_solver_val = string_to_fr(s[cir["y2"]], /*base=*/10);

    bb::fr x2_builder_val = p2.x.get_value();
    bb::fr y2_builder_val = p2.y.get_value();

    ASSERT_EQ(x2_solver_val, x2_builder_val);
    ASSERT_EQ(y2_solver_val, y2_builder_val);

    ((Bool(cir["x2"]) != Bool(STerm(x2_builder_val, &s, TermType::FFTerm))) |
     (Bool(cir["y2"]) != Bool(STerm(y2_builder_val, &s, TermType::FFTerm))))
        .assert_term();
    res = s.check();
    ASSERT_FALSE(res);
}

TEST(UltraCircuitSMT, OptimizedDeltaRangeRelation)
{
    UltraCircuitBuilder builder;

    field_t a(witness_t(&builder, engine.get_random_uint32()));
    a.create_range_constraint(32);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.finalize_circuit(/*ensure_nonzero=*/false); // No need to add nonzero gates if we're not proving

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s, TermType::BVTerm);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["a"] == a.get_value();
    s.print_assertions();

    bool res = s.check();
    ASSERT_TRUE(res);
}

TEST(UltraCircuitSMT, LookupRelation1)
{
    UltraCircuitBuilder builder;

    field_t a(witness_t(&builder, engine.get_random_uint8()));
    field_t b(witness_t(&builder, engine.get_random_uint8()));
    field_t c = bb::stdlib::logic<UltraCircuitBuilder>::create_logic_constraint(a, b, 8, true);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    builder.set_variable_name(c.get_witness_index(), "c");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver slv(circuit_info.modulus, /*config=*/ultra_solver_config, /*base=*/16, /*bvsize=*/256);
    UltraCircuit cir(circuit_info, &slv, TermType::BVTerm);

    cir["a"] == a.get_value();
    cir["b"] == b.get_value();
    slv.print_assertions();

    ASSERT_TRUE(slv.check());
    bb::fr c_solver_val = string_to_fr(slv[cir["c"]], /*base=*/2);
    bb::fr c_builder_val = c.get_value();
    ASSERT_EQ(c_solver_val, c_builder_val);
}

TEST(UltraCircuitSMT, LookupRelation2)
{
    UltraCircuitBuilder builder;

    field_t a(witness_t(&builder, engine.get_random_uint32()));
    field_t b(witness_t(&builder, engine.get_random_uint32()));
    field_t c = bb::stdlib::logic<Builder>::create_logic_constraint(a, b, /*num_bits=*/32, /*is_xor_gate=*/true);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    builder.set_variable_name(c.get_witness_index(), "c");
    builder.finalize_circuit(/*ensure_nonzero=*/false); // No need to add nonzero gates if we're not proving

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config, /*base=*/16, /*bvsize=*/256);
    UltraCircuit cir(circuit_info, &s, TermType::BVTerm);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["a"] == a.get_value();
    cir["b"] == b.get_value();
    s.print_assertions();

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr c_solver_val = string_to_fr(s[cir["c"]], /*base=*/2, /*is_signed=*/false);
    bb::fr c_builder_val = c.get_value();
    ASSERT_EQ(c_solver_val, c_builder_val);
}

//// Due to ranges being huge it takes 5 min 32 sec to finish
// TODO(alex): Wait until the bug with large sets is resolved by cvc5
// TEST(UltraCircuitSMT, NNFRelation)
//{
//    UltraCircuitBuilder builder;
//
//    bigfield_t a = bigfield_t::from_witness(&builder, bb::fq::random_element());
//    bigfield_t b = bigfield_t::from_witness(&builder, bb::fq::random_element());
//    [[maybe_unused]] auto c = a * b;
//
//    auto circuit_info = unpack_from_buffer(builder.export_circuit());
//    Solver slv(circuit_info.modulus, /*config=*/debug_solver_config, /*base=*/16);
//    UltraCircuit cir(circuit_info, &slv, TermType::FFTerm);
//
//    for(uint32_t i = 0; i < builder.get_variables().size(); i++){
//        if (!cir.optimized[i]){
//            cir[i] == builder.get_variables()[i];
//        }
//    }
//
//    slv.print_assertions();
//    bool res = smt_timer(&slv);
//    ASSERT_TRUE(res);
//}

TEST(UltraCircuitSMT, ROMTables)
{
    Builder builder;

    field_t entry_1 = pub_witness_t(&builder, bb::fr::random_element());
    field_t entry_2 = pub_witness_t(&builder, bb::fr::random_element());
    field_t entry_3 = pub_witness_t(&builder, bb::fr::random_element());
    std::vector<field_t> table_values = { entry_1, entry_2, entry_3 };
    rom_table_t table(table_values);

    field_t i = witness_t(&builder, 2);
    builder.set_variable_name(i.get_witness_index(), "i");
    field_t entry_i = table[i];
    builder.set_variable_name(entry_i.get_witness_index(), "entry_i");

    field_t j = witness_t(&builder, 1);
    builder.set_variable_name(j.get_witness_index(), "j");
    field_t entry_j = table[j];
    builder.set_variable_name(entry_j.get_witness_index(), "entry_j");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver slv(circuit_info.modulus, /*config=*/ultra_solver_config, /*base=*/16);
    UltraCircuit cir(circuit_info, &slv, TermType::FFTerm);

    STerm i_s = cir["i"];
    STerm j_s = cir["j"];
    i_s != j_s;

    slv.print_assertions();

    ASSERT_TRUE(slv.check());

    bb::fr entry_i_cir = string_to_fr(slv[cir["entry_i"]], /*base=*/10);
    bb::fr entry_j_cir = string_to_fr(slv[cir["entry_j"]], /*base=*/10);
    bb::fr i_cir = string_to_fr(slv[cir["i"]], /*base=*/10);
    bb::fr j_cir = string_to_fr(slv[cir["j"]], /*base=*/10);

    ASSERT_EQ(table_values[static_cast<size_t>(i_cir)].get_value(), entry_i_cir);
    ASSERT_EQ(table_values[static_cast<size_t>(j_cir)].get_value(), entry_j_cir);
}

TEST(UltraCircuitSMT, ROMTablesRelaxed)
{
    Builder builder;

    field_t entry_1 = pub_witness_t(&builder, bb::fr::random_element());
    field_t entry_2 = pub_witness_t(&builder, bb::fr::random_element());
    field_t entry_3 = pub_witness_t(&builder, bb::fr::random_element());
    std::vector<field_t> table_values = { entry_1, entry_2, entry_3 };
    rom_table_t table(table_values);

    field_t i = witness_t(&builder, 2);
    builder.set_variable_name(i.get_witness_index(), "i");
    field_t entry_i = table[i];
    builder.set_variable_name(entry_i.get_witness_index(), "entry_i");

    field_t j = witness_t(&builder, 1);
    builder.set_variable_name(j.get_witness_index(), "j");
    field_t entry_j = table[j];
    builder.set_variable_name(entry_j.get_witness_index(), "entry_j");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver slv(circuit_info.modulus, /*config=*/ultra_solver_config, /*base=*/16);
    UltraCircuit cir(
        circuit_info, &slv, TermType::FFTerm, /*tag=*/"", /*enable_optimizations=*/true, /*rom_ram_relaxed=*/true);

    STerm i_s = cir["i"];
    STerm j_s = cir["j"];
    i_s != j_s;

    slv.print_assertions();

    ASSERT_TRUE(slv.check());

    bb::fr entry_i_cir = string_to_fr(slv[cir["entry_i"]], /*base=*/10);
    bb::fr entry_j_cir = string_to_fr(slv[cir["entry_j"]], /*base=*/10);
    bb::fr i_cir = string_to_fr(slv[cir["i"]], /*base=*/10);
    bb::fr j_cir = string_to_fr(slv[cir["j"]], /*base=*/10);

    ASSERT_EQ(table_values[static_cast<size_t>(i_cir)].get_value(), entry_i_cir);
    ASSERT_EQ(table_values[static_cast<size_t>(j_cir)].get_value(), entry_j_cir);
}

TEST(UltraCircuitSMT, RAMTables)
{
    Builder builder;

    size_t table_size = 3;
    ram_table_t table(&builder, table_size);
    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }

    field_t i = witness_t(&builder, 2);
    builder.set_variable_name(i.get_witness_index(), "i");

    bb::fr el0 = bb::fr::random_element();
    table.write(i, el0);
    field_t entry_i = table.read(i);
    builder.set_variable_name(entry_i.get_witness_index(), "entry_i");

    bb::fr el1 = bb::fr::random_element();
    table.write(i, el1);
    field_t entry_i_1 = table.read(i);
    builder.set_variable_name(entry_i_1.get_witness_index(), "entry_i_1");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver slv(circuit_info.modulus, /*config=*/ultra_solver_config, /*base=*/16);
    UltraCircuit cir(circuit_info, &slv, TermType::FFTerm);

    STerm i_s = cir["i"];
    STerm entry_i_s = cir["entry_i"];
    STerm entry_i_1_s = cir["entry_i_1"];
    entry_i_s != 0;

    slv.print_assertions();
    ASSERT_TRUE(slv.check());

    bb::fr entry_i_cir = string_to_fr(slv[entry_i_s], /*base=*/10);
    bb::fr entry_i_1_cir = string_to_fr(slv[entry_i_1_s], /*base=*/10);

    ASSERT_TRUE(entry_i_cir == el0);
    ASSERT_TRUE(entry_i_1_cir == el1);
}

TEST(UltraCircuitSMT, RAMTablesRelaxed)
{
    Builder builder;

    size_t table_size = 3;
    ram_table_t table(&builder, table_size);
    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }

    field_t i = witness_t(&builder, 2);
    builder.set_variable_name(i.get_witness_index(), "i");

    bb::fr el0 = bb::fr::random_element();
    table.write(i, el0);
    field_t entry_i = table.read(i);
    builder.set_variable_name(entry_i.get_witness_index(), "entry_i");

    bb::fr el1 = bb::fr::random_element();
    table.write(i, el1);
    field_t entry_i_1 = table.read(i);
    builder.set_variable_name(entry_i_1.get_witness_index(), "entry_i_1");

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver slv(circuit_info.modulus, /*config=*/ultra_solver_config, /*base=*/16);
    UltraCircuit cir(
        circuit_info, &slv, TermType::FFTerm, /*tag=*/"", /*enable_optimizations=*/true, /*rom_ram_relaxed=*/true);

    STerm i_s = cir["i"];
    STerm entry_i_s = cir["entry_i"];
    STerm entry_i_1_s = cir["entry_i_1"];
    entry_i_s != 0;

    slv.print_assertions();
    ASSERT_TRUE(slv.check());

    bb::fr entry_i_cir = string_to_fr(slv[entry_i_s], /*base=*/10);
    bb::fr entry_i_1_cir = string_to_fr(slv[entry_i_1_s], /*base=*/10);

    ASSERT_TRUE(entry_i_cir == el0);
    ASSERT_TRUE(entry_i_1_cir == el1);
}

TEST(UltraCircuitSMT, XorOptimization)
{
    UltraCircuitBuilder builder;
    field_t a(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(a.get_witness_index(), "a");
    field_t b(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(b.get_witness_index(), "b");
    field_t c = bb::stdlib::logic<Builder>::create_logic_constraint(a, b, /*num_bits=*/32, /*is_xor_gate=*/true);
    builder.set_variable_name(c.get_witness_index(), "c");

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    uint32_t modulus_base = 16;
    uint32_t bvsize = 256;
    Solver s(circuit_info.modulus, ultra_solver_config, modulus_base, bvsize);

    UltraCircuit circuit(circuit_info, &s, TermType::BVTerm);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();

    s.print_assertions();

    bool res = smt_timer(&s);
    ASSERT_TRUE(res);

    bb::fr c_sym = string_to_fr(s[circuit["c"]], /*base=*/2);
    bb::fr c_builder = c.get_value();
    ASSERT_EQ(c_sym, c_builder);
}

TEST(UltraCircuitSMT, AndOptimization)
{
    UltraCircuitBuilder builder;
    field_t a(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(a.get_witness_index(), "a");
    field_t b(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(b.get_witness_index(), "b");
    field_t c = bb::stdlib::logic<Builder>::create_logic_constraint(a, b, /*num_bits=*/32, /*is_xor_gate=*/false);
    builder.set_variable_name(c.get_witness_index(), "c");

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    uint32_t modulus_base = 16;
    uint32_t bvsize = 256;
    Solver s(circuit_info.modulus, ultra_solver_config, modulus_base, bvsize);

    UltraCircuit circuit(circuit_info, &s, TermType::BVTerm);

    circuit["a"] == a.get_value();
    circuit["b"] == b.get_value();

    s.print_assertions();

    bool res = smt_timer(&s);
    ASSERT_TRUE(res);

    bb::fr c_sym = string_to_fr(s[circuit["c"]], /*base=*/2);
    bb::fr c_builder = c.get_value();
    ASSERT_EQ(c_sym, c_builder);
}

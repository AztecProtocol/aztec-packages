#include <fstream>
#include <iostream>
#include <string>

#include "barretenberg/common/mem.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

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
using uint_t = stdlib::uint32<UltraCircuitBuilder>;
using rom_table_t = bb::stdlib::rom_table<Builder>;
using ram_table_t = bb::stdlib::ram_table<Builder>;

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

    bb::grumpkin::g1::affine_element p1 = bb::crypto::pedersen_commitment::commit_native({ bb::fr::one() }, 0);
    bb::grumpkin::g1::affine_element p2 = bb::crypto::pedersen_commitment::commit_native({ bb::fr::one() }, 1);
    bb::grumpkin::g1::affine_element p3 = bb::grumpkin::g1::element(p1) + bb::grumpkin::g1::element(p2);

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x2 = builder.add_variable(p2.x);
    uint32_t y2 = builder.add_variable(p2.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.set_variable_name(x1, "x1");
    builder.set_variable_name(x2, "x2");
    builder.set_variable_name(x3, "x3");
    builder.set_variable_name(y1, "y1");
    builder.set_variable_name(y2, "y2");
    builder.set_variable_name(y3, "y3");

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["x1"] == builder.get_variable(x1);
    cir["x2"] == builder.get_variable(x2);
    cir["y1"] == builder.get_variable(y1);
    cir["y2"] == builder.get_variable(y2);

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr x3_solver_val = string_to_fr(s[cir["x3"]], /*base=*/10);
    bb::fr y3_solver_val = string_to_fr(s[cir["y3"]], /*base=*/10);

    bb::fr x3_builder_val = builder.get_variable(x3);
    bb::fr y3_builder_val = builder.get_variable(y3);

    ASSERT_EQ(x3_solver_val, x3_builder_val);
    ASSERT_EQ(y3_solver_val, y3_builder_val);

    ((Bool(cir["x3"]) != Bool(STerm(builder.get_variable(x3), &s, TermType::FFTerm))) |
     (Bool(cir["y3"]) != Bool(STerm(builder.get_variable(y3), &s, TermType::FFTerm))))
        .assert_term();
    res = s.check();
    ASSERT_FALSE(res);
}

TEST(UltraCircuitSMT, EllipticRelationDBL)
{
    UltraCircuitBuilder builder;

    bb::grumpkin::g1::affine_element p1 = bb::crypto::pedersen_commitment::commit_native({ bb::fr::one() }, 0);
    bb::grumpkin::g1::affine_element p3 = bb::grumpkin::g1::element(p1).dbl();

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);
    builder.set_variable_name(x1, "x1");
    builder.set_variable_name(x3, "x3");
    builder.set_variable_name(y1, "y1");
    builder.set_variable_name(y3, "y3");

    builder.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config);
    UltraCircuit cir(circuit_info, &s);
    ASSERT_EQ(cir.get_num_gates(), builder.get_estimated_num_finalized_gates());

    cir["x1"] == builder.get_variable(x1);
    cir["y1"] == builder.get_variable(y1);

    bool res = s.check();
    ASSERT_TRUE(res);

    bb::fr x3_solver_val = string_to_fr(s[cir["x3"]], /*base=*/10);
    bb::fr y3_solver_val = string_to_fr(s[cir["y3"]], /*base=*/10);

    bb::fr x3_builder_val = builder.get_variable(x3);
    bb::fr y3_builder_val = builder.get_variable(y3);

    ASSERT_EQ(x3_solver_val, x3_builder_val);
    ASSERT_EQ(y3_solver_val, y3_builder_val);

    ((Bool(cir["x3"]) != Bool(STerm(builder.get_variable(x3), &s, TermType::FFTerm))) |
     (Bool(cir["y3"]) != Bool(STerm(builder.get_variable(y3), &s, TermType::FFTerm))))
        .assert_term();
    res = s.check();
    ASSERT_FALSE(res);
}

TEST(UltraCircuitSMT, OptimizedDeltaRangeRelation)
{
    UltraCircuitBuilder builder;

    uint_t a(witness_t(&builder, engine.get_random_uint32()));
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

    uint_t a(witness_t(&builder, engine.get_random_uint32()));
    uint_t b(witness_t(&builder, engine.get_random_uint32()));
    uint_t c = a ^ b;
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    builder.set_variable_name(c.get_witness_index(), "c");
    builder.finalize_circuit(/*ensure_nonzero=*/false); // No need to add nonzero gates if we're not proving

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s(circuit_info.modulus, ultra_solver_config, /*base=*/16, /*bvsize=*/32);
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

// Due to ranges being huge it takes 5 min 32 sec to finish
// TEST(UltraCircuitSMT, AuxRelation)
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
//    for(uint32_t i = 0; i < builder.variables.size(); i++){
//        cir[i] == builder.variables[i];
//    }
//
//    // slv.print_assertions();
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
    uint_t a(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_t b(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_t c = a ^ b;
    builder.set_variable_name(c.get_witness_index(), "c");

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    uint32_t modulus_base = 16;
    uint32_t bvsize = 35;
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
    uint_t a(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(a.get_witness_index(), "a");
    uint_t b(witness_t(&builder, engine.get_random_uint32()));
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_t c = a & b;
    builder.set_variable_name(c.get_witness_index(), "c");

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    uint32_t modulus_base = 16;
    uint32_t bvsize = 35;
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

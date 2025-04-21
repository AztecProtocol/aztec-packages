#include <fstream>
#include <iostream>
#include <string>

#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

namespace {
auto& engine = numeric::get_randomness();
}

using field_t = stdlib::field_t<UltraCircuitBuilder>;
using witness_t = stdlib::witness_t<UltraCircuitBuilder>;
using pub_witness_t = stdlib::public_witness_t<UltraCircuitBuilder>;
using uint_t = stdlib::uint32<UltraCircuitBuilder>;

TEST(Ultra_circuit, assert_equal)
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

TEST(Ultra_circuit, arithmetic)
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

TEST(Ultra_circuit, elliptic_add)
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

TEST(Ultra_circuit, elliptic_dbl)
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

TEST(Ultra_circuit, ranges)
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

TEST(Ultra_circuit, lookup_tables)
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
    uint32_t modulus_base = 16;
    uint32_t bvsize = 32;
    Solver s(circuit_info.modulus, ultra_solver_config, modulus_base, bvsize);
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

TEST(Ultra_circuit, xor_optimization)
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

TEST(Ultra_circuit, and_optimization)
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

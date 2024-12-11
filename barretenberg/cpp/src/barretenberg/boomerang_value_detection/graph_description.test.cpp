#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief this test checks graph description of the circuit with arithmetic gates
    the number of connected components = the number of pair (i, j), 0<=i, j <16, i.e 256
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_arithmetic_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(circuit_constructor);
    bool result = num_connected_components == 256;
    EXPECT_EQ(result, true);
}

/**
 * @brief This test checks graph description of Ultra Circuit Builder with arithmetic gates with shifts
 * It must be one connected component, cause all gates have shifts
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_arithmetic_gates_with_shifts)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) }, true);
        }
    }

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks graph description of the circuit with boolean gates.
    all variables must be isolated and the number of connected components = 0, all variables in one gate
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_boolean_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(circuit_constructor);
    bool result = num_connected_components == 0;
    EXPECT_EQ(result, true);
    EXPECT_EQ(variables_in_one_gate.size(), 20);
}

/**
 * @brief  this test checks graph decription for the circuit with one elliptic addition gate.
 *  The result is one connected component for 6 variables:
 *  x1, y1, x2, y2, x3, y3
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_add_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks graph description of the circuit with one elliptic double gate.
   The result is one connected component for 4 variables:
   x1, y1, x3, y3
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_double_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks the graph description of the circuit has elliptic addition and multiplication
   gates together. The result is 2 connected components:
   x1, y1, x2, y2, x3, y3, x4, y4
   x5, y5, x6, y6, x7, y7, x8, y8
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_together)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });
    affine_element p4(element(p3).dbl());
    uint32_t x4 = circuit_constructor.add_variable(p4.x);
    uint32_t y4 = circuit_constructor.add_variable(p4.y);
    circuit_constructor.create_ecc_dbl_gate({ x3, y3, x4, y4 });

    affine_element p5 = crypto::pedersen_commitment::commit_native({ bb::fr(2) }, 1);
    affine_element p6 = crypto::pedersen_commitment::commit_native({ bb::fr(3) }, 1);
    affine_element p7(element(p5) + element(p6));

    uint32_t x5 = circuit_constructor.add_variable(p5.x);
    uint32_t y5 = circuit_constructor.add_variable(p5.y);
    uint32_t x6 = circuit_constructor.add_variable(p6.x);
    uint32_t y6 = circuit_constructor.add_variable(p6.y);
    uint32_t x7 = circuit_constructor.add_variable(p7.x);
    uint32_t y7 = circuit_constructor.add_variable(p7.y);

    circuit_constructor.create_ecc_add_gate({ x5, y5, x6, y6, x7, y7, 1 });
    affine_element p8(element(p7).dbl());
    uint32_t x8 = circuit_constructor.add_variable(p8.x);
    uint32_t y8 = circuit_constructor.add_variable(p8.y);
    circuit_constructor.create_ecc_dbl_gate({ x7, y7, x8, y8 });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test check graph description of the circuit with 2 sort_constraint. The result is 2 connected components:
   a_idx, b_idx, c_idx, d_idx
   e_idx, f_idx, g_idx, h_idx
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_sort_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.create_sort_constraint({ e_idx, f_idx, g_idx, h_idx });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components[0].size(), 4);
    EXPECT_EQ(connected_components[1].size(), 4);
    EXPECT_EQ(connected_components.size(), 2);
}

/**
 * @brief this test checks graph description of the circuit with 2 sorted_constraints with edges.
    The result is 2 connected components:
    a_idx, b_idx, ... , h_idx
    a1_idx, b1_idx, ..., h1_idx
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_sort_constraints_with_edges)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    UltraCircuitBuilder circuit_constructor;
    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.create_sort_constraint_with_edges(
        { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);

    fr a1 = fr(9);
    fr b1 = fr(10);
    fr c1 = fr(11);
    fr d1 = fr(12);
    fr e1 = fr(13);
    fr f1 = fr(14);
    fr g1 = fr(15);
    fr h1 = fr(16);

    auto a1_idx = circuit_constructor.add_variable(a1);
    auto b1_idx = circuit_constructor.add_variable(b1);
    auto c1_idx = circuit_constructor.add_variable(c1);
    auto d1_idx = circuit_constructor.add_variable(d1);
    auto e1_idx = circuit_constructor.add_variable(e1);
    auto f1_idx = circuit_constructor.add_variable(f1);
    auto g1_idx = circuit_constructor.add_variable(g1);
    auto h1_idx = circuit_constructor.add_variable(h1);

    circuit_constructor.create_sort_constraint_with_edges(
        { a1_idx, b1_idx, c1_idx, d1_idx, e1_idx, f1_idx, g1_idx, h1_idx }, a1, h1);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks graph decription for circuit with gates that were created from plookup accumulators
   the result is one connected component
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_with_plookup_accumulators)
{
    UltraCircuitBuilder circuit_builder = UltraCircuitBuilder();

    fr input_value = fr::random_element();
    const fr input_lo = static_cast<uint256_t>(input_value).slice(0, plookup::fixed_base::table::BITS_PER_LO_SCALAR);
    const auto input_lo_index = circuit_builder.add_variable(input_lo);

    const auto sequence_data_lo = plookup::get_lookup_accumulators(plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    const auto lookup_witnesses = circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    const size_t num_lookups = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;

    EXPECT_EQ(num_lookups, lookup_witnesses[plookup::ColumnIdx::C1].size());

    Graph graph = Graph(circuit_builder);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variable gates counts for variable from arithmetic gates without shifts
    in circuit
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 25; ++i) {
        for (size_t j = 0; j < 25; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    Graph graph = Graph(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    bool result = true;
    for (const auto pair : variables_gate_counts) {
        result = result && (pair.first > 0 ? (pair.second == 1) : (pair.second == 0));
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variables gates count for variable in circuit with gates with shifts.
 * All variables except for zero index, which index == 0 mod 4 and index != 4 have gates count == 2.
 * Other variables have gates count = 1.
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate_with_shifts)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 25; ++i) {
        for (size_t j = 0; j < 25; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) }, true);
        }
    }

    Graph graph = Graph(circuit_constructor);
    bool result = true;
    auto variables_gate_counts = graph.get_variables_gate_counts();
    for (const auto& pair : variables_gate_counts) {
        if (pair.first > 0) {
            result = result && (pair.first % 4 == 0 && pair.first != 4 ? (pair.second == 2) : (pair.second == 1));
        } else {
            result = result && (pair.second == 0);
        }
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variables gates count for variables in circuit with boolean gates
 * all variables except for zero index must have gates count = 1.
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_boolean_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    Graph graph = Graph(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    bool result = true;
    for (const auto& part : variables_gate_counts) {
        result = result && (part.first == 0 ? (part.second == 0) : (part.second == 1));
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variables gate counts in circuit with sorted constraints.
 * all variables in 2 connected components must have gates count = 1
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.create_sort_constraint({ e_idx, f_idx, g_idx, h_idx });

    Graph graph = Graph(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 2);
    bool result = true;
    for (size_t i = 0; i < connected_components[0].size(); i++) {
        result = result && (variables_gate_counts[connected_components[0][i]] == 1);
    }

    for (size_t i = 0; i < connected_components[1].size(); i++) {
        result = result && (variables_gate_counts[connected_components[1][i]] == 1);
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variable gates count for variables in circuit with sorted constraints with edges
 * all variables in 2 connected components must have gates count = 1
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints_with_edges)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    UltraCircuitBuilder circuit_constructor;
    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.create_sort_constraint_with_edges(
        { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);

    fr a1 = fr(9);
    fr b1 = fr(10);
    fr c1 = fr(11);
    fr d1 = fr(12);
    fr e1 = fr(13);
    fr f1 = fr(14);
    fr g1 = fr(15);
    fr h1 = fr(16);

    auto a1_idx = circuit_constructor.add_variable(a1);
    auto b1_idx = circuit_constructor.add_variable(b1);
    auto c1_idx = circuit_constructor.add_variable(c1);
    auto d1_idx = circuit_constructor.add_variable(d1);
    auto e1_idx = circuit_constructor.add_variable(e1);
    auto f1_idx = circuit_constructor.add_variable(f1);
    auto g1_idx = circuit_constructor.add_variable(g1);
    auto h1_idx = circuit_constructor.add_variable(h1);

    circuit_constructor.create_sort_constraint_with_edges(
        { a1_idx, b1_idx, c1_idx, d1_idx, e1_idx, f1_idx, g1_idx, h1_idx }, a1, h1);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto variables_gate_counts = graph.get_variables_gate_counts();
    bool result = true;
    for (size_t i = 0; i < connected_components[0].size(); i++) {
        result = result && (variables_gate_counts[connected_components[0][i]] == 1);
    }

    for (size_t i = 0; i < connected_components[1].size(); i++) {
        result = result && (variables_gate_counts[connected_components[1][i]] == 1);
    }
    EXPECT_EQ(connected_components.size(), 2);
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variables gates count for variables in circuit with 1 elliptic addition gates
 * all variables in connected components must have gates count = 1
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_ecc_add_gates)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    Graph graph = Graph(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();
    bool result = (variables_gate_counts[connected_components[0][0]] == 1) &&
                  (variables_gate_counts[connected_components[0][1]] == 1) &&
                  (variables_gate_counts[connected_components[0][2]] == 1) &&
                  (variables_gate_counts[connected_components[0][3]] == 1) &&
                  (variables_gate_counts[connected_components[0][4]] == 1) &&
                  (variables_gate_counts[connected_components[0][5]] == 1);
    EXPECT_EQ(connected_components.size(), 1);
    EXPECT_EQ(result, true);
}

/**
 * @brief this test checks variables gates count for variables in circuit with 1 elliptic double gates
 * all variables in connected components must have gates count = 1.
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_ecc_dbl_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    Graph graph = Graph(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();

    bool result = (variables_gate_counts[connected_components[0][0]] == 1) &&
                  (variables_gate_counts[connected_components[0][1]] == 1) &&
                  (variables_gate_counts[connected_components[0][2]] == 1) &&
                  (variables_gate_counts[connected_components[0][3]] == 1);

    EXPECT_EQ(connected_components.size(), 1);
    EXPECT_EQ(result, true);
}

std::vector<uint32_t> add_variables(UltraCircuitBuilder& circuit_constructor, std::vector<fr> variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(circuit_constructor.add_variable(variables[i]));
    }
    return res;
}

/**
 * @brief this test checks graph description of circuit with range constraints.
 * all variables must be in one connected component.
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_range_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto indices = add_variables(circuit_constructor, { 1, 2, 3, 4 });
    for (size_t i = 0; i < indices.size(); i++) {
        circuit_constructor.create_new_range_constraint(indices[i], 5);
    }
    circuit_constructor.create_sort_constraint(indices);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

/**
 * @brief this checks graph description of circuit with decompose function.
 * all variables must be in one connected component
 */

TEST(boomerang_ultra_circuit_constructor, composed_range_constraint)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = circuit_constructor.add_variable(fr(e));
    circuit_constructor.create_add_gate(
        { a_idx, circuit_constructor.zero_idx, circuit_constructor.zero_idx, 1, 0, 0, -fr(e) });
    circuit_constructor.decompose_into_default_range(a_idx, 134);

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}
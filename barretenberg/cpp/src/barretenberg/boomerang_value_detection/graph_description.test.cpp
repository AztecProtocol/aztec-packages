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
using namespace cdg;

std::vector<uint32_t> add_variables(UltraCircuitBuilder& circuit_constructor, std::vector<fr> variables)
{
    std::vector<uint32_t> res;
    res.reserve(variables.size());
    for (const auto& var : variables) {
        res.emplace_back(circuit_constructor.add_variable(var));
    }
    return res;
}

/**
 * @brief Test graph description of circuit with arithmetic gates
 *
 * @details This test verifies that:
 * - The number of connected components equals the number of pairs (i,j), where 0<=i,j<16
 * - Each pair creates an isolated component, resulting in 256 total components
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
    auto variables_in_one_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_one_gate.size(), 1024);
    EXPECT_EQ(connected_components.size(), 256);
}

/**
 * @brief Test graph description of Ultra Circuit Builder with arithmetic gates with shifts
 *
 * @details This test verifies that:
 * - When all gates have shifts, they form a single connected component
 * - The shift operation connects all variables in the circuit
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
 * @brief Test graph description of circuit with boolean gates
 *
 * @details This test verifies that:
 * - All variables are isolated with boolean gates
 * - The number of connected components is 0
 * - All variables are in one gate
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
 * @brief Test graph description for circuit with one elliptic addition gate
 *
 * @details This test verifies that:
 * - The circuit forms one connected component containing 6 variables
 * - The variables represent the coordinates of three points: (x1,y1), (x2,y2), (x3,y3)
 * - Where (x3,y3) is the result of adding (x1,y1) and (x2,y2)
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
 * @brief Test graph description for circuit with one elliptic double gate
 *
 * @details This test verifies that:
 * - The circuit forms one connected component containing 4 variables
 * - The variables represent the coordinates of two points: (x1,y1) and (x3,y3)
 * - Where (x3,y3) is the result of doubling (x1,y1)
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
 * @brief Test graph description for circuit with elliptic addition and multiplication gates
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: x1, y1, x2, y2, x3, y3, x4, y4
 * - Second component contains: x5, y5, x6, y6, x7, y7, x8, y8
 * - Each component represents a separate elliptic curve operation sequence
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
 * @brief Test graph description for circuit with 2 sort constraints
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: a_idx, b_idx, c_idx, d_idx
 * - Second component contains: e_idx, f_idx, g_idx, h_idx
 * - Each sort constraint creates its own connected component
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
 * @brief Test graph description for circuit with 2 sorted constraints with edges
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: a_idx through h_idx
 * - Second component contains: a1_idx through h1_idx
 * - Each sort constraint with edges creates its own connected component
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
 * @brief Test graph description for circuit with gates created from plookup accumulators
 *
 * @details This test verifies that:
 * - The circuit forms one connected component
 * - Plookup accumulator gates connect all variables in the circuit
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
 * @brief Test variable gate counts for variables from arithmetic gates without shifts
 *
 * @details This test verifies that:
 * - Each variable (except index 0) appears in exactly one gate
 * - Variables with index 0 appear in no gates
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
 * @brief Test variable gate counts for variables in circuit with gates with shifts
 *
 * @details This test verifies that:
 * - Variables with index == 0 mod 4 and index != 4 have gate count == 2
 * - All other variables (except index 0) have gate count == 1
 * - Variables with index 0 have gate count == 0
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
 * @brief Test variable gate counts for variables in circuit with boolean gates
 *
 * @details This test verifies that:
 * - All variables (except index 0) have gate count == 1
 * - Variables with index 0 have gate count == 0
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
 * @brief Test variable gate counts in circuit with sorted constraints
 *
 * @details This test verifies that:
 * - All variables in both connected components have gate count == 1
 * - Each sort constraint creates a separate component with consistent gate counts
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    std::vector<fr> vars1{ fr::one(), fr(2), fr(3), fr(4) };
    std::vector<fr> vars2{ fr(5), fr(6), fr(7), fr(8) };

    auto vars_idx1 = add_variables(circuit_constructor, vars1);
    auto vars_idx2 = add_variables(circuit_constructor, vars2);
    circuit_constructor.create_sort_constraint(vars_idx1);
    circuit_constructor.create_sort_constraint(vars_idx2);

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
 * @brief Test variable gate counts for variables in circuit with sorted constraints with edges
 *
 * @details This test verifies that:
 * - All variables in both connected components have gate count == 1
 * - Each sort constraint with edges creates a separate component with consistent gate counts
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints_with_edges)
{
    UltraCircuitBuilder circuit_constructor;
    std::vector<fr> vars1 = { fr::one(), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7), fr(8) };
    std::vector<fr> vars2 = { fr(9), fr(10), fr(11), fr(12), fr(13), fr(14), fr(15), fr(16) };
    auto var_idx1 = add_variables(circuit_constructor, vars1);
    auto var_idx2 = add_variables(circuit_constructor, vars2);

    circuit_constructor.create_sort_constraint_with_edges(var_idx1, vars1[0], vars1[vars1.size() - 1]);

    circuit_constructor.create_sort_constraint_with_edges(var_idx2, vars2[0], vars2[vars2.size() - 1]);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto variables_gate_counts = graph.get_variables_gate_counts();
    EXPECT_EQ(connected_components.size(), 2);
    bool result = true;
    for (const auto& [key, value] : variables_gate_counts) {
        info("variable with index == ", key, " in ", value, " gates");
    }
    for (size_t i = 0; i < var_idx1.size(); i++) {
        if (i % 4 == 1 && i > 1) {
            result = variables_gate_counts[var_idx1[i]] == 2;
        } else {
            result = variables_gate_counts[var_idx1[i]] == 1;
        }
    }

    for (size_t i = 0; i < var_idx2.size(); i++) {
        if (i % 4 == 1 && i > 1) {
            result = variables_gate_counts[var_idx2[i]] == 2;
        } else {
            result = variables_gate_counts[var_idx1[i]] == 1;
        }
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description of circuit with range constraints
 *
 * @details This test verifies that:
 * - All variables must be in one connected component
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_range_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto indices = add_variables(circuit_constructor, { fr(1), fr(2), fr(3), fr(4) });
    for (size_t i = 0; i < indices.size(); i++) {
        circuit_constructor.create_new_range_constraint(indices[i], 5);
    }
    circuit_constructor.create_sort_constraint(indices);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    for (const auto& idx : indices) {
        info("gate count for variable with index ", idx, " == ", variables_gate_counts[idx]);
    }
}

/**
 * @brief Test variable gate counts for variables in circuit with elliptic addition gates
 *
 * @details This test verifies that:
 * - All variables in the connected component have gate count == 1
 * - The component contains the 6 variables representing the coordinates of the points
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
 * @brief Test variable gate counts for variables in circuit with elliptic double gates
 *
 * @details This test verifies that:
 * - All variables in the connected component have gate count == 1
 * - The component contains the 4 variables representing the coordinates of the point
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

/**
 * @brief Test graph description of circuit with decompose function
 *
 * @details This test verifies that:
 * - All variables must be in one connected component
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
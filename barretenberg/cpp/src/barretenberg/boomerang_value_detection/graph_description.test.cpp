#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(standard_circuit_constructor, test_empty_graph)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::one();
    circuit_constructor.add_public_variable(a);
    Graph graph = Graph(circuit_constructor);

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, test_graph_with_three_vertexes)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = a + b;
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
}

TEST(standard_circuit_constructor, test_graph_with_two_gates)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = fr::random_element();
    fr d = a + b;

    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_add_gate({ a_idx, b_idx, d_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr g = c * d;
    uint32_t g_idx = circuit_constructor.add_variable(g);
    circuit_constructor.create_mul_gate({ c_idx, d_idx, g_idx, fr::one(), fr::neg_one(), fr::zero() });
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
}

TEST(standard_circuit_constructor, test_graph_with_boomerang_variable)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::random_element();
    fr c = a + b;
    fr d = fr::random_element();
    fr e = d + a; //
    // uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    uint32_t e_idx = circuit_constructor.add_variable(e);
    uint32_t a_duplicate_idx = circuit_constructor.add_variable(a);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate(
        { a_duplicate_idx, d_idx, e_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    bool result1 = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    EXPECT_EQ(result1, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
}

TEST(standard_circuit_constructor, test_graph_connected_components)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = a + b;
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
    graph.print_connected_components();
}

TEST(standard_circuit_constructor, test_graph_with_two_connected_components)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::random_element();
    fr c = a + b;
    fr d = fr::random_element();
    fr e = d + a; //
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    uint32_t e_idx = circuit_constructor.add_variable(e);
    uint32_t a_duplicate_idx = circuit_constructor.add_variable(a);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate(
        { a_duplicate_idx, d_idx, e_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    bool result1 = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    EXPECT_EQ(result1, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_connected_components();
}

TEST(standard_circuit_builder, test_graph_connected_component_boomerang_variable)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = a + b;
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr d = fr::random_element();
    fr e = fr::random_element();
    fr f = d + e;
    uint32_t d_idx = circuit_constructor.add_variable(d);
    uint32_t e_idx = circuit_constructor.add_variable(e);
    uint32_t f_idx = circuit_constructor.add_variable(f);
    circuit_constructor.create_add_gate({ d_idx, e_idx, f_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr g = c * f;
    fr g1 = c + f;
    uint32_t g_idx = circuit_constructor.add_variable(g);
    uint32_t g1_idx = circuit_constructor.add_variable(g1);
    circuit_constructor.create_mul_gate({ c_idx, f_idx, g_idx, fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ c_idx, f_idx, g1_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr g_dupl = circuit_constructor.get_variable(g_idx);
    fr g_inv = g_dupl.invert();
    fr g_2 = g_inv + g1;
    uint32_t g_inv_idx = circuit_constructor.add_variable(g_inv);
    uint32_t g2_idx = circuit_constructor.add_variable(g_2);
    circuit_constructor.create_add_gate({ g_inv_idx, g1_idx, g2_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_connected_components();
}

TEST(standard_circuit_constructor, test_graph_for_logic_constraint)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr(1);
    fr b = fr(2);
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    size_t num_bits = 2;
    auto accumulators = circuit_constructor.create_logic_constraint(a_idx, b_idx, num_bits, true);
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_connected_components();
}

TEST(standard_circuit_constructor, test_logic_constraint_degree_one)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr(1);
    fr b = fr(2);
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    size_t num_bits = 2;
    auto accumulators = circuit_constructor.create_logic_constraint(a_idx, b_idx, num_bits, true);
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_dangerous_variables(circuit_constructor);
}

TEST(standard_circuit_constructor, test_logic_constraint_also_degree_two)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr(1);
    fr b = fr(2);
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    size_t num_bits = 2;
    auto accumulators = circuit_constructor.create_logic_constraint(a_idx, b_idx, num_bits, true);
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_dangerous_variables(circuit_constructor);
}

TEST(ultra_circuit_constructor, test_graph_for_arithmetic_gates)
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

    bool result = CircuitChecker::check(circuit_constructor);
    Graph graph = Graph(circuit_constructor);
    // graph.print_graph();
    graph.print_connected_components();
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_graph_for_bool_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_elliptic_add_gate)
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

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);
    graph.print_connected_components();
    graph.print_variables_gate_counts();
}

TEST(ultra_circuit_constructor, test_for_elliptic_double_gate)
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
    info("x1, y1, x3, y3 == ", x1, " ", y1, " ", x3, " ", y3);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);

    Graph graph = Graph(circuit_constructor);
    graph.print_connected_components();
    graph.print_variables_gate_counts();
}

TEST(ultra_circuit_constructor, test_graph_for_elliptic_gates_with_arithmetic_gates)
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
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);

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

    info("number of elliptic gates = ", circuit_constructor.blocks.elliptic.size());
    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
    graph.print_connected_components();
    graph.print_variables_gate_counts();
}

TEST(ultra_circuit_constructor, test_graph_with_sort_constraints)
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

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);

    Graph graph = Graph(circuit_constructor);
    graph.print_graph();
    graph.print_connected_components();
    graph.print_variables_gate_counts();
}

TEST(ultra_circuit_constructor, test_graph_with_sort_constraints_with_edges)
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
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_constructor);

    graph.print_graph();
    graph.print_connected_components();
    graph.print_variables_gate_counts();
}

TEST(ultra_circuit_constructor, create_gates_from_plookup_accumulators)
{

    UltraCircuitBuilder circuit_builder = UltraCircuitBuilder();

    fr input_value = fr::random_element();
    const fr input_lo = static_cast<uint256_t>(input_value)
                            .slice(0, plookup::fixed_base::table::BITS_PER_LO_SCALAR); // обрезал последние 128 бит
    const auto input_lo_index = circuit_builder.add_variable(input_lo); // добавил получившееся значение в схему

    const auto sequence_data_lo = plookup::get_lookup_accumulators(plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    const auto lookup_witnesses = circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    const size_t num_lookups = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;

    EXPECT_EQ(num_lookups, lookup_witnesses[plookup::ColumnIdx::C1].size());

    bool result = CircuitChecker::check(circuit_builder);
    EXPECT_EQ(result, true);
    Graph graph = Graph(circuit_builder);
    graph.print_connected_components();
}
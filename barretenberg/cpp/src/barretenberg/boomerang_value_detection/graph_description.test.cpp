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

TEST(ultra_circuit_constructor, test_graph_for_arithmetic_gates)
{
    // this test checks graph description for the circuit with arithmetic gates
    // the number of connected components = the number of pair (i, j), 0<=i, j <16, i.e 256
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
    info("number of connected components == ", num_connected_components);
    bool result = num_connected_components == 256;
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_graph_for_arithmetic_gates_with_shifts)
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
    info("number of the connected components == ", num_connected_components);
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_boolean_gates)
{
    // this test checks graph description for the circuit with boolean gates.
    //  all variables must be isolated and the number of connected components = 20
    //  number of the variables in the circuit
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    info("number of the connected components == ", num_connected_components);
    bool result = num_connected_components == 20;
    EXPECT_EQ(result, true);
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_elliptic_add_gate)
{
    // this test checks graph decription for the circuit with one elliptic addition gate.
    // The result is one connected component for 6 variables:
    // x1, y1, x2, y2, x3, y3
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
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_elliptic_double_gate)
{
    // this test checks graph description for the circuit with one elliptic double gate.
    // The result is one connected component for 4 variables:
    // x1, y1, x3, y3
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);
    info("string from the test: x1, y1, x3, y3 == ", x1, " ", y1, " ", x3, " ", y3);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_elliptic_together)
{
    // this test checks the graph description for the circuit has elliptic addition and multiplication
    // gates together. The result is 2 connected components:
    // x1, y1, x2, y2, x3, y3, x4, y4
    // x5, y5, x6, y6, x7, y7, x8, y8
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

    info("number of elliptic gates = ", circuit_constructor.blocks.elliptic.size());
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    info("size of the first connected component == ", connected_components[0].size());
    info("size of the second connected component == ", connected_components[1].size());
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_graph_for_sort_constraints)
{
    // this test check graph description for the circuit with 2 sort_constraint. The result is 2 connected components:
    // a_idx, b_idx, c_idx, d_idx
    // e_idx, f_idx, g_idx, h_idx
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
    info("size of the first connected component == ", connected_components[0].size());
    info("size of the second connected component == ", connected_components[1].size());
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
    // graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_sort_constraints_with_edges)
{
    // this test checks graph description for the circuit with 2 sorted_constraints with edges.
    // The result is 2 connected components:
    // a_idx, b_idx, ... , h_idx
    // a1_idx, b1_idx, ..., h1_idx
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
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_with_plookup_accumulators)
{
    // this test checks graph decription for circuit with grate that were created from plookup accumulators
    // the result is one connected component
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
    graph.print_connected_components();
}

TEST(ultra_circuit_constructor, test_graph_for_aes_64_bytes)
{
    typedef stdlib::field_t<UltraCircuitBuilder> field_pt;
    typedef stdlib::witness_t<bb::UltraCircuitBuilder> witness_pt;

    uint8_t key[16]{ 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
    uint8_t out[64]{ 0x76, 0x49, 0xab, 0xac, 0x81, 0x19, 0xb2, 0x46, 0xce, 0xe9, 0x8e, 0x9b, 0x12, 0xe9, 0x19, 0x7d,
                     0x50, 0x86, 0xcb, 0x9b, 0x50, 0x72, 0x19, 0xee, 0x95, 0xdb, 0x11, 0x3a, 0x91, 0x76, 0x78, 0xb2,
                     0x73, 0xbe, 0xd6, 0xb8, 0xe3, 0xc1, 0x74, 0x3b, 0x71, 0x16, 0xe6, 0x9e, 0x22, 0x22, 0x95, 0x16,
                     0x3f, 0xf1, 0xca, 0xa1, 0x68, 0x1f, 0xac, 0x09, 0x12, 0x0e, 0xca, 0x30, 0x75, 0x86, 0xe1, 0xa7 };
    uint8_t iv[16]{ 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };
    uint8_t in[64]{ 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a,
                    0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03, 0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51,
                    0x30, 0xc8, 0x1c, 0x46, 0xa3, 0x5c, 0xe4, 0x11, 0xe5, 0xfb, 0xc1, 0x19, 0x1a, 0x0a, 0x52, 0xef,
                    0xf6, 0x9f, 0x24, 0x45, 0xdf, 0x4f, 0x9b, 0x17, 0xad, 0x2b, 0x41, 0x7b, 0xe6, 0x6c, 0x37, 0x10 };

    const auto convert_bytes = [](uint8_t* data) {
        uint256_t converted(0);
        for (uint64_t i = 0; i < 16; ++i) {
            uint256_t to_add = uint256_t((uint64_t)(data[i])) << uint256_t((15 - i) * 8);
            converted += to_add;
        }
        return converted;
    };

    auto builder = UltraCircuitBuilder();

    std::vector<field_pt> in_field{
        witness_pt(&builder, fr(convert_bytes(in))),
        witness_pt(&builder, fr(convert_bytes(in + 16))),
        witness_pt(&builder, fr(convert_bytes(in + 32))),
        witness_pt(&builder, fr(convert_bytes(in + 48))),
    };

    field_pt key_field(witness_pt(&builder, fr(convert_bytes(key))));
    field_pt iv_field(witness_pt(&builder, fr(convert_bytes(iv))));

    std::vector<fr> expected{
        convert_bytes(out), convert_bytes(out + 16), convert_bytes(out + 32), convert_bytes(out + 48)
    };

    const auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);

    for (size_t i = 0; i < 4; ++i) {
        EXPECT_EQ(result[i].get_value(), expected[i]);
    }

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool graph_result = num_connected_components == 1;
    EXPECT_EQ(graph_result, true);
    std::cout << "num gates = " << builder.get_num_gates() << std::endl;
    std::cout << "number of arithmetic gates = " << builder.blocks.arithmetic.size() << std::endl;
    std::cout << "number of sorted gates = " << builder.blocks.delta_range.size() << std::endl;
    std::cout << "number of plookup gates = " << builder.blocks.lookup.size() << std::endl;
    std::cout << "number of elliptic gates = " << builder.blocks.elliptic.size() << std::endl;
}

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate)
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

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate_with_shifts)
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

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_boolean_gates)
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
        info(part.first, " ", part.second);
        result = result && (part.first == 0 ? (part.second == 0) : (part.first == 1));
    }
    // EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints)
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
    bool result = true;
    for (size_t i = 0; i < connected_components[0].size(); i++) {
        result = result &&
                 (i == connected_components[0].size() - 1 ? variables_gate_counts[connected_components[0][i]] == 2
                                                          : variables_gate_counts[connected_components[0][i]] == 1);
        /* info("result == ", result);
        info(i, " ", connected_components[0][i], " ", variables_gate_counts[connected_components[0][i]]); */
    }

    for (size_t i = 0; i < connected_components[1].size(); i++) {
        result = result &&
                 (i == connected_components[1].size() - 1 ? variables_gate_counts[connected_components[1][i]] == 2
                                                          : variables_gate_counts[connected_components[1][i]] == 1);
        /* info("result == ", result);
        info(i, " ", connected_components[1][i], " ", variables_gate_counts[connected_components[1][i]]); */
    }
    for (const auto& pair : variables_gate_counts) {
        info(pair.first, " ", pair.second);
    }
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints_with_edges)
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
    // graph.print_connected_components();
    bool result = true;
    for (size_t i = 0; i < connected_components[0].size(); i++) {
        result = result &&
                 (i == connected_components[0].size() - 1 ? variables_gate_counts[connected_components[0][i]] == 2
                                                          : variables_gate_counts[connected_components[0][i]] == 1);
    }

    for (size_t i = 0; i < connected_components[1].size(); i++) {
        result = result &&
                 (i == connected_components[1].size() - 1 ? variables_gate_counts[connected_components[1][i]] == 2
                                                          : variables_gate_counts[connected_components[1][i]] == 1);
    }
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_ecc_add_gates)
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
                  (variables_gate_counts[connected_components[0][2]] == 2) &&
                  (variables_gate_counts[connected_components[0][3]] == 2) &&
                  (variables_gate_counts[connected_components[0][4]] == 2) &&
                  (variables_gate_counts[connected_components[0][5]] == 2);
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_variables_gates_counts_for_ecc_dbl_gate)
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
    // info("string from the test: x1, y1, x3, y3 == ", x1, " ", y1, " ", x3, " ", y3);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto variables_gate_counts = graph.get_variables_gate_counts();

    bool result = (variables_gate_counts[connected_components[0][0]] == 1) &&
                  (variables_gate_counts[connected_components[0][1]] == 1) &&
                  (variables_gate_counts[connected_components[0][2]] == 2) &&
                  (variables_gate_counts[connected_components[0][3]] == 2);

    for (const auto& pair : variables_gate_counts) {
        info(pair.first, " ", pair.second);
    }
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

TEST(ultra_circuit_constructor, test_graph_for_range_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto indices = add_variables(circuit_constructor, { 1, 2, 3, 4 });
    for (size_t i = 0; i < indices.size(); i++) {
        circuit_constructor.create_new_range_constraint(indices[i], 5);
    }
    // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
    circuit_constructor.create_sort_constraint(indices);
    Graph graph = Graph(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

TEST(ultra_circuit_constructor, composed_range_constraint)
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
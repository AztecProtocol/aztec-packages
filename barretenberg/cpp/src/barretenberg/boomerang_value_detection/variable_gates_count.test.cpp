#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(boomerang_ultra_circuit_constructor, test_variable_gates_count_for_decompose)
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
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_on_gate.size(), 1);
}

TEST(boomerang_ultra_circuit_constructor, test_variable_gates_count_for_decompose2)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 41);
    auto e = fr(d);
    auto a_idx = circuit_constructor.add_variable(fr(e));
    circuit_constructor.create_add_gate(
        { a_idx, circuit_constructor.zero_idx, circuit_constructor.zero_idx, 1, 0, 0, -fr(e) });
    circuit_constructor.decompose_into_default_range(a_idx, 42);

    Graph graph = Graph(circuit_constructor);
    auto variables_in_on_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_on_gate.size(), 1);
}

TEST(boomerang_utils, test_selectors_for_decompose)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    const uint64_t target_range_bitnum = 14;
    size_t i = 0;
    const uint64_t shifts[3]{
        target_range_bitnum * (3 * i),
        target_range_bitnum * (3 * i + 1),
        target_range_bitnum * (3 * i + 2),
    };
    uint256_t q_1 = uint256_t(1) << shifts[0];
    uint256_t q_2 = uint256_t(1) << shifts[1];
    uint256_t q_3 = uint256_t(1) << shifts[2];
    bool q_1_is_power_two = is_power_two(q_1);
    bool q_2_is_power_two = is_power_two(q_2);
    bool q_3_is_power_two = is_power_two(q_3);
    EXPECT_EQ(q_2 * q_2, q_1 * q_3);
    EXPECT_EQ(q_1_is_power_two, true);
    EXPECT_EQ(q_2_is_power_two, true);
    EXPECT_EQ(q_3_is_power_two, true);
}

TEST(boomerang_ultra_circuit_constructor, test_variable_gates_count_for_two_decomposes)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c1 = fr::random_element();
    auto c2 = fr::random_element();
    auto d1 = uint256_t(c1).slice(0, 41);
    auto d2 = uint256_t(c2).slice(0, 41);
    auto e1 = fr(d1);
    auto e2 = fr(d2);
    auto a1_idx = circuit_constructor.add_variable(fr(e1));
    auto a2_idx = circuit_constructor.add_variable(fr(e2));
    circuit_constructor.create_add_gate(
        { a1_idx, circuit_constructor.zero_idx, circuit_constructor.zero_idx, 1, 0, 0, -fr(e1) });
    circuit_constructor.create_add_gate(
        { a2_idx, circuit_constructor.zero_idx, circuit_constructor.zero_idx, 1, 0, 0, -fr(e2) });
    circuit_constructor.decompose_into_default_range(a1_idx, 42);
    circuit_constructor.decompose_into_default_range(a2_idx, 42);

    Graph graph = Graph(circuit_constructor);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_one_gate.size(), 2);
}

TEST(boomerang_ultra_circuit_constructor, test_decompose_with_boolean_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c1 = fr::random_element();
    auto c2 = fr::random_element();
    auto d1 = uint256_t(c1).slice(0, 41);
    auto d2 = uint256_t(c2).slice(0, 41);
    auto e1 = fr(d1);
    auto e2 = fr(d2);
    auto a1_idx = circuit_constructor.add_variable(fr(e1));
    auto a2_idx = circuit_constructor.add_variable(fr(e2));
    circuit_constructor.decompose_into_default_range(a1_idx, 42);
    circuit_constructor.decompose_into_default_range(a2_idx, 42);

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    Graph graph = Graph(circuit_constructor);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_one_gate.size(), 22);
}

TEST(boomerang_ultra_circuit_constructor, test_decompose_for_6_bit_number)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 5);
    auto e = fr(d);
    auto a_idx = circuit_constructor.add_variable(fr(d));
    circuit_constructor.create_add_gate(
        { a_idx, circuit_constructor.zero_idx, circuit_constructor.zero_idx, 1, 0, 0, -fr(e) });
    circuit_constructor.decompose_into_default_range(a_idx, 6);

    Graph graph = Graph(circuit_constructor);
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(circuit_constructor);
    EXPECT_EQ(variables_in_on_gate.size(), 1);
}

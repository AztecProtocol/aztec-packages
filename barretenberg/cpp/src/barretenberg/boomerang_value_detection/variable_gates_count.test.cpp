#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(ultra_circuit_constructor, test_variable_gates_count_for_decompose)
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

TEST(ultra_circuit_constructor, test_variable_gates_count_for_decompose2)
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

TEST(utils, test_selectors_for_decompose)
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

TEST(ultra_circuit_constructor, test_variable_gates_count_for_two_decomposes)
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

TEST(ultra_circuit_constructor, test_decompose_with_boolean_gates)
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

TEST(ultra_circuit_constructor, test_decompose_for_6_bit_number)
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

TEST(ultra_circuit_constructor, test_decompose_for_aes_64bytes)
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
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_on_gate) {
        info("elem == ", elem);
    }
}
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;
typedef stdlib::field_t<UltraCircuitBuilder> field_pt;
typedef stdlib::witness_t<bb::UltraCircuitBuilder> witness_pt;

bool check_in_vector(const std::vector<field_pt>& input_vector, const uint32_t& real_var_index)
{
    for (const auto& elem : input_vector) {
        if (elem.witness_index == real_var_index) {
            return true;
        }
    }
    return false;
}

/**
 * @brief this test checks graph description of circuit for AES128CBC
 * graph must be consist from one connected component
 */

TEST(boomerang_stdlib_aes, test_graph_for_aes_64_bytes)
{
    uint8_t key[16]{ 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
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

    auto builder = Builder();

    std::vector<field_pt> in_field{
        witness_pt(&builder, fr(convert_bytes(in))),
        witness_pt(&builder, fr(convert_bytes(in + 16))),
        witness_pt(&builder, fr(convert_bytes(in + 32))),
        witness_pt(&builder, fr(convert_bytes(in + 48))),
    };

    field_pt key_field(witness_pt(&builder, fr(convert_bytes(key))));
    field_pt iv_field(witness_pt(&builder, fr(convert_bytes(iv))));

    const auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool graph_result = num_connected_components == 1;

    EXPECT_EQ(graph_result, true);
}

/**
 * @brief this test checks variables gate counts for variables in circuit for AES128CBC
 * Some variables can be from input/output vectors, or they are key and iv, and they have variable
 * gates count = 1, because it's the circuit for test. So, we can ignore these variables
 */

TEST(boomerang_stdlib_aes, test_variable_gates_count_for_aes128cbc)
{

    uint8_t key[16]{ 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
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

    auto builder = Builder();

    std::vector<field_pt> in_field{
        witness_pt(&builder, fr(convert_bytes(in))),
        witness_pt(&builder, fr(convert_bytes(in + 16))),
        witness_pt(&builder, fr(convert_bytes(in + 32))),
        witness_pt(&builder, fr(convert_bytes(in + 48))),
    };

    field_pt key_field(witness_pt(&builder, fr(convert_bytes(key))));
    field_pt iv_field(witness_pt(&builder, fr(convert_bytes(iv))));

    const auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);

    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        bool result1 = check_in_vector(in_field, elem);
        bool result2 = check_in_vector(result, elem);
        bool check =
            (result1 == 1) || (result2 == 1) || (elem == key_field.witness_index) || (elem == iv_field.witness_index);
        EXPECT_EQ(check, true);
    }
}
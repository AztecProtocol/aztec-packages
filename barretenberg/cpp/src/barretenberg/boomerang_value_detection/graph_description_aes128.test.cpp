#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using field_pt = stdlib::field_t<UltraCircuitBuilder>;
using witness_pt = stdlib::witness_t<bb::UltraCircuitBuilder>;

/**
 * @brief Fix witness values in a vector to ensure they appear in multiple gates
 *
 * Static analyzer typically identifies variables in only one gate. For test input/output variables,
 * we can filter them by fixing their witness values, which adds them to a second gate
 * and prevents them from being flagged as potentially dangerous.
 *
 * @param input_vector Vector of field elements to fix
 */
void fix_vector_witness(std::vector<field_pt>& input_vector)
{
    for (auto& elem : input_vector) {
        elem.fix_witness();
    }
}

namespace {
auto& engine = numeric::get_debug_randomness();

constexpr size_t AES_BLOCK_BYTES = 16;
constexpr size_t AES_DUPLICATE_TEST_BLOCKS = 2;

struct AesCbcDuplicateTestInput {
    std::array<uint8_t, AES_BLOCK_BYTES> key;
    std::array<uint8_t, AES_BLOCK_BYTES> iv;
    std::array<uint8_t, AES_BLOCK_BYTES * AES_DUPLICATE_TEST_BLOCKS> plaintext;
};

uint256_t convert_aes_block(const uint8_t* data)
{
    uint256_t converted(0);
    for (uint64_t i = 0; i < AES_BLOCK_BYTES; ++i) {
        uint256_t to_add = uint256_t(static_cast<uint64_t>(data[i])) << uint256_t((AES_BLOCK_BYTES - 1 - i) * 8);
        converted += to_add;
    }
    return converted;
}

void build_aes_32_byte_circuit(Builder& builder, const AesCbcDuplicateTestInput& input)
{
    std::vector<field_pt> in_field;
    in_field.reserve(AES_DUPLICATE_TEST_BLOCKS);
    for (size_t block_idx = 0; block_idx < AES_DUPLICATE_TEST_BLOCKS; block_idx++) {
        in_field.emplace_back(
            witness_pt(&builder, fr(convert_aes_block(input.plaintext.data() + block_idx * AES_BLOCK_BYTES))));
    }

    fix_vector_witness(in_field);

    field_pt key_field(witness_pt(&builder, fr(convert_aes_block(input.key.data()))));
    field_pt iv_field(witness_pt(&builder, fr(convert_aes_block(input.iv.data()))));
    key_field.fix_witness();
    iv_field.fix_witness();

    auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);
    fix_vector_witness(result);
}

template <typename Container> void fill_random_bytes(Container& bytes)
{
    for (auto& byte : bytes) {
        byte = static_cast<uint8_t>(engine.get_random_uint32() & 0xff);
    }
}

AesCbcDuplicateTestInput make_random_aes_32_byte_input()
{
    AesCbcDuplicateTestInput input;
    fill_random_bytes(input.key);
    fill_random_bytes(input.iv);
    fill_random_bytes(input.plaintext);
    return input;
}

std::unordered_set<fr> get_aes_rerun_varying_duplicate_values(const AesCbcDuplicateTestInput& baseline_input)
{
    Builder baseline_builder;
    build_aes_32_byte_circuit(baseline_builder, baseline_input);
    StaticAnalyzer baseline_graph(baseline_builder);
    baseline_graph.fill_witness_duplicate_map();

    Builder rerun_builder_0;
    build_aes_32_byte_circuit(rerun_builder_0, make_random_aes_32_byte_input());
    Builder rerun_builder_1;
    build_aes_32_byte_circuit(rerun_builder_1, make_random_aes_32_byte_input());
    Builder rerun_builder_2;
    build_aes_32_byte_circuit(rerun_builder_2, make_random_aes_32_byte_input());

    return baseline_graph.get_rerun_varying_duplicate_values({ &rerun_builder_0, &rerun_builder_1, &rerun_builder_2 });
}
} // namespace

/**
 * @brief Test graph description of AES128CBC circuit with 64 bytes of data
 *
 * @details This test verifies that:
 * - The graph consists of one connected component
 * - No variables are in only one gate
 */
TEST(boomerang_stdlib_aes, test_graph_for_aes_64_bytes)
{
    uint8_t key[16]{ 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
    uint8_t iv[16]{ 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };
    uint8_t in[64]{ 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a,
                    0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03, 0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51,
                    0x30, 0xc8, 0x1c, 0x46, 0xa3, 0x5c, 0xe4, 0x11, 0xe5, 0xfb, 0xc1, 0x19, 0x1a, 0x0a, 0x52, 0xef,
                    0xf6, 0x9f, 0x24, 0x45, 0xdf, 0x4f, 0x9b, 0x17, 0xad, 0x2b, 0x41, 0x7b, 0xe6, 0x6c, 0x37, 0x10 };

    auto convert_bytes = [](uint8_t* data) {
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

    fix_vector_witness(in_field);

    field_pt key_field(witness_pt(&builder, fr(convert_bytes(key))));
    field_pt iv_field(witness_pt(&builder, fr(convert_bytes(iv))));
    key_field.fix_witness();
    iv_field.fix_witness();

    auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);
    fix_vector_witness(result);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test graph description of AES128CBC circuit with 32 bytes of data
 *
 * @details This test verifies that:
 * - The graph consists of one connected component
 * - No variables are in only one gate
 */
TEST(boomerang_stdlib_aes, test_duplicate_witnesses)
{
    const AesCbcDuplicateTestInput input{
        { 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c },
        { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f },
        { 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a,
          0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03, 0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51 }
    };
    const auto rerun_varying_filter_values = get_aes_rerun_varying_duplicate_values(input);
    EXPECT_FALSE(rerun_varying_filter_values.empty());

    auto builder = Builder();
    build_aes_32_byte_circuit(builder, input);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    graph.fill_witness_duplicate_map(
        {}, cdg::WitnessDuplicateFilterMode::EXPLANATION_ONLY, rerun_varying_filter_values);
    EXPECT_TRUE(graph.get_witness_duplicate_map().empty());
}
/**
 * @brief Test variable gate counts for AES128CBC circuit
 *
 * @details This test verifies that:
 * - The graph consists of one connected component
 * - No variables appear in only one gate
 *
 * Note: Input/output vectors, key, and IV variables might normally appear in only one gate,
 * but we fix their witness values to ensure they appear in multiple gates.
 */
TEST(boomerang_stdlib_aes, test_variable_gates_count_for_aes128cbc)
{
    uint8_t key[16]{ 0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c };
    uint8_t iv[16]{ 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f };
    uint8_t in[64]{ 0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a,
                    0xae, 0x2d, 0x8a, 0x57, 0x1e, 0x03, 0xac, 0x9c, 0x9e, 0xb7, 0x6f, 0xac, 0x45, 0xaf, 0x8e, 0x51,
                    0x30, 0xc8, 0x1c, 0x46, 0xa3, 0x5c, 0xe4, 0x11, 0xe5, 0xfb, 0xc1, 0x19, 0x1a, 0x0a, 0x52, 0xef,
                    0xf6, 0x9f, 0x24, 0x45, 0xdf, 0x4f, 0x9b, 0x17, 0xad, 0x2b, 0x41, 0x7b, 0xe6, 0x6c, 0x37, 0x10 };

    auto convert_bytes = [](uint8_t* data) {
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

    fix_vector_witness(in_field);

    field_pt key_field(witness_pt(&builder, fr(convert_bytes(key))));
    field_pt iv_field(witness_pt(&builder, fr(convert_bytes(iv))));
    key_field.fix_witness();
    iv_field.fix_witness();

    auto result = stdlib::aes128::encrypt_buffer_cbc(in_field, iv_field, key_field);
    fix_vector_witness(result);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

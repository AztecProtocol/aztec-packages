#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s_plookup.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"

using namespace bb;
using namespace cdg;
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using byte_array_ct = stdlib::byte_array<Builder>;
using public_witness_t = stdlib::public_witness_t<Builder>;

/**
 * @brief Test graph description for Blake2s hash with single block input
 *
 * @details This test verifies that:
 * - The graph has one connected component
 * - No variables are in one gate
 * - The plookup implementation correctly processes a single block input
 */
TEST(boomerang_stdlib_blake2s, graph_description_single_block_plookup)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::blake2s<Builder>(input_arr);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test graph description for Blake2s hash with double block input
 *
 * @details This test verifies that:
 * - The graph has one connected component
 * - No variables are in one gate
 * - The plookup implementation correctly processes a multi-block input
 * - The output matches the expected cryptographic hash
 */
TEST(boomerang_stdlib_blake2s, graph_description_double_block_plookup)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::blake2s<Builder>(input_arr);

    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

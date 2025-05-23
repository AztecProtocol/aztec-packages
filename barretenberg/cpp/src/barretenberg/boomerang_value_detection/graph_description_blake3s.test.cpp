#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s_plookup.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "graph.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace cdg;

using byte_array_plookup = stdlib::byte_array<bb::UltraCircuitBuilder>;
using public_witness_t_plookup = stdlib::public_witness_t<bb::UltraCircuitBuilder>;
using UltraBuilder = UltraCircuitBuilder;

/**
 * @brief Test graph description for blake3s hash with different block sizes
 *
 * These tests verify that the graph description of circuits for blake3s hash
 * always produces a single connected component, regardless of input size.
 */

/**
 * @brief Test graph description for blake3s with a single block input
 *
 * The result should be one connected component with no variables in one gate,
 * verifying proper connectivity through the hash operation
 */
TEST(boomerang_stdlib_blake3s, test_single_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());
    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);
    std::vector<uint8_t> expected = blake3::blake3s(input_v);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test graph description for blake3s with a double block input
 *
 * The result should be one connected component with no variables in one gate,
 * verifying that multi-block processing maintains proper connectivity
 */
TEST(boomerang_stdlib_blake3s, test_double_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

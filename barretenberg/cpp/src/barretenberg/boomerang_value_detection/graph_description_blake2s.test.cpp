#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s_plookup.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "graph.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;
using byte_array_ct = byte_array<Builder>;
using byte_array_plookup = byte_array<Builder>;
using public_witness_t = public_witness_t<Builder>;

/**
 * @brief this tests check graph description of circuit for blake2s for one and two blocks.
 * all graphs must have one connected component.
 */

TEST(boomerang_stdlib_blake2s, test_graph_for_blake2s_single_block_plookup)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = blake2s<Builder>(input_arr);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

TEST(boomerang_stdlib_blake2s, test_graph_for_blake2s_double_block_plookup)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = blake2s<Builder>(input_arr);

    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

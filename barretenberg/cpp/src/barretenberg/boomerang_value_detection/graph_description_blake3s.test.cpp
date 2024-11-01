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

using byte_array = stdlib::byte_array<bb::StandardCircuitBuilder>;
using public_witness_t = stdlib::public_witness_t<bb::StandardCircuitBuilder>;
using byte_array_plookup = stdlib::byte_array<bb::UltraCircuitBuilder>;
using public_witness_t_plookup = stdlib::public_witness_t<bb::UltraCircuitBuilder>;
using UltraBuilder = UltraCircuitBuilder;

/**
 * @brief this tests check that graph description of circuit for blake3s for different blocks.
 * All graphs must have one connected component
 */

TEST(boomerang_stdlib_blake3s, test_single_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

TEST(boomerang_stdlib_blake3s, test_double_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}
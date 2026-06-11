#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "graph.hpp"
#include <cstdint>
#include <gtest/gtest.h>

using namespace bb;
using namespace cdg;

using byte_array_plookup = stdlib::byte_array<bb::UltraCircuitBuilder>;
using public_witness_t_plookup = stdlib::public_witness_t<bb::UltraCircuitBuilder>;
using UltraBuilder = UltraCircuitBuilder;

namespace {
auto& engine = numeric::get_debug_randomness();

std::vector<uint8_t> random_bytes(size_t length)
{
    std::vector<uint8_t> bytes(length);
    for (auto& byte : bytes) {
        byte = static_cast<uint8_t>(engine.get_random_uint32() & 0xff);
    }
    return bytes;
}

void build_blake3s_circuit(UltraBuilder& builder, const std::vector<uint8_t>& input)
{
    byte_array_plookup input_arr(&builder, input);
    [[maybe_unused]] byte_array_plookup output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);
}

std::unordered_set<fr> get_blake3s_rerun_varying_duplicate_values(const std::vector<uint8_t>& baseline_input)
{
    UltraBuilder baseline_builder;
    build_blake3s_circuit(baseline_builder, baseline_input);
    StaticAnalyzer baseline_graph(baseline_builder);
    baseline_graph.fill_witness_duplicate_map();

    UltraBuilder rerun_builder_0;
    build_blake3s_circuit(rerun_builder_0, random_bytes(baseline_input.size()));
    UltraBuilder rerun_builder_1;
    build_blake3s_circuit(rerun_builder_1, random_bytes(baseline_input.size()));
    UltraBuilder rerun_builder_2;
    build_blake3s_circuit(rerun_builder_2, random_bytes(baseline_input.size()));

    return baseline_graph.get_rerun_varying_duplicate_values({ &rerun_builder_0, &rerun_builder_1, &rerun_builder_2 });
}
} // namespace

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
    byte_array_plookup output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);
    std::vector<uint8_t> expected = blake3::blake3s(input_v);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
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
    byte_array_plookup output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_blake3s, duplicate_witnesses_are_rerun_varying)
{
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());
    const auto rerun_varying_filter_values = get_blake3s_rerun_varying_duplicate_values(input_v);
    EXPECT_FALSE(rerun_varying_filter_values.empty());

    auto builder = UltraBuilder();
    build_blake3s_circuit(builder, input_v);

    StaticAnalyzer graph(builder);
    graph.fill_witness_duplicate_map({}, WitnessDuplicateFilterMode::EXPLANATION_ONLY, rerun_varying_filter_values);
    EXPECT_TRUE(graph.get_witness_duplicate_map().empty());
}

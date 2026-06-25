#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

#include <cstdint>

using namespace bb;
using namespace cdg;
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using byte_array_ct = stdlib::byte_array<Builder>;
using public_witness_t = stdlib::public_witness_t<Builder>;

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

void build_blake2s_circuit(Builder& builder, const std::vector<uint8_t>& input)
{
    byte_array_ct input_arr(&builder, input);
    [[maybe_unused]] byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);
}

std::unordered_set<fr> get_blake2s_rerun_varying_duplicate_values(const std::vector<uint8_t>& baseline_input)
{
    Builder baseline_builder;
    build_blake2s_circuit(baseline_builder, baseline_input);
    StaticAnalyzer baseline_graph(baseline_builder);
    baseline_graph.fill_witness_duplicate_map();

    Builder rerun_builder_0;
    build_blake2s_circuit(rerun_builder_0, random_bytes(baseline_input.size()));
    Builder rerun_builder_1;
    build_blake2s_circuit(rerun_builder_1, random_bytes(baseline_input.size()));
    Builder rerun_builder_2;
    build_blake2s_circuit(rerun_builder_2, random_bytes(baseline_input.size()));

    return baseline_graph.get_rerun_varying_duplicate_values({ &rerun_builder_0, &rerun_builder_1, &rerun_builder_2 });
}
} // namespace

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
    byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
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
    byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_blake2s, duplicate_witnesses_are_rerun_varying)
{
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());
    const auto rerun_varying_filter_values = get_blake2s_rerun_varying_duplicate_values(input_v);
    EXPECT_FALSE(rerun_varying_filter_values.empty());

    Builder builder;
    build_blake2s_circuit(builder, input_v);

    StaticAnalyzer graph(builder);
    graph.fill_witness_duplicate_map({}, WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS, rerun_varying_filter_values);
    EXPECT_TRUE(graph.get_witness_duplicate_map().empty());
}

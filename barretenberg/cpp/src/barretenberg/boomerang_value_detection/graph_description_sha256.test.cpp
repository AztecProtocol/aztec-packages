#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using namespace bb::stdlib;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;

/**
 * @brief Fix witness for an array of field elements
 *
 * Static analyzer prints variables that only appear in one gate. By fixing witnesses,
 * we ensure variables appear in at least 2 gates, filtering out false positives.
 */
template <size_t N> void fix_field_array(std::array<field_ct, N>& arr)
{
    for (auto& elem : arr) {
        elem.fix_witness();
    }
}

/**
 * @brief Test SHA256 compression circuit graph analysis (single block)
 *
 * This test verifies the graph structure of a sha256_block circuit.
 * The test checks that:
 * - The circuit consists of exactly 1 connected component
 * - No variables appear in only one gate after witness fixing
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_block_single)
{
    auto builder = Builder();

    // SHA-256 initial hash values
    constexpr std::array<uint32_t, 8> H_INIT = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    // Create h_init witnesses
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, H_INIT[i]);
    }
    fix_field_array(h_init);

    // Create block witnesses (zeros)
    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_ct(&builder, 0);
    }
    fix_field_array(block);

    // Run compression
    auto output = SHA256<Builder>::sha256_block(h_init, block);
    fix_field_array(output);

    // Analyze graph structure
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test SHA256 compression circuit graph analysis (chained blocks)
 *
 * This test verifies the graph structure when multiple sha256_block calls
 * are chained together, simulating multi-block message hashing.
 *
 * The test checks that:
 * - The circuit consists of exactly 1 connected component
 * - No variables appear in only one gate after witness fixing
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_block_chained)
{
    auto builder = Builder();

    // SHA-256 initial hash values
    constexpr std::array<uint32_t, 8> H_INIT = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    // Create h_init witnesses
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, H_INIT[i]);
    }
    fix_field_array(h_init);

    // Create two blocks
    std::array<field_ct, 16> block1;
    std::array<field_ct, 16> block2;
    for (size_t i = 0; i < 16; i++) {
        block1[i] = witness_ct(&builder, i);      // Some arbitrary values
        block2[i] = witness_ct(&builder, i + 16); // Different arbitrary values
    }
    fix_field_array(block1);
    fix_field_array(block2);

    // Chain two compression calls
    auto h_mid = SHA256<Builder>::sha256_block(h_init, block1);
    auto output = SHA256<Builder>::sha256_block(h_mid, block2);
    fix_field_array(output);

    // Analyze graph structure
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

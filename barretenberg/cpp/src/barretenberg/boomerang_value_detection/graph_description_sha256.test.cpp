#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace bb;
using namespace bb::stdlib;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using byte_array_ct = byte_array<Builder>;
using field_ct = field_t<Builder>;

/**
 * @brief Given a `byte_array` object, slice it into chunks of size `num_bytes_in_chunk` and compute field elements
 * reconstructed from these chunks.
 */

std::vector<field_ct> pack_bytes_into_field_elements(const byte_array_ct& input, size_t num_bytes_in_chunk = 4)
{
    std::vector<field_t<Builder>> result;
    const size_t byte_len = input.size();

    for (size_t i = 0; i < byte_len; i += num_bytes_in_chunk) {
        byte_array_ct chunk = input.slice(i, std::min(num_bytes_in_chunk, byte_len - i));
        result.emplace_back(static_cast<field_ct>(chunk));
    }

    return result;
}

/**
 static analyzer usually prints input and output variables as variables in one gate. In tests these variables
 are not dangerous and usually we can filter them by adding gate for fixing witness. Then these variables will be
 in 2 gates, and static analyzer won't print them. functions fix_vector and fix_byte_array do it
 for vector of variables and byte_array respectively
*/

void fix_vector(std::vector<field_ct>& vector)
{
    for (auto& elem : vector) {
        elem.fix_witness();
    }
}

void fix_byte_array(byte_array_ct& input)
{
    for (size_t idx = 0; idx < input.size(); idx++) {
        input[idx].fix_witness();
    }
}

/**
 * @brief Test for SHA256 circuit graph analysis
 *
 * These tests verify that SHA256 circuits have the expected graph structure:
 * - Each circuit should consist of exactly 1 connected component
 * - Each variable should appear in multiple gates after witness fixing
 * The test mirrors the test in stdlib.
 */

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_55_bytes)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
    byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");
    fix_byte_array(input);

    byte_array_ct output_bytes = stdlib::SHA256<Builder>::hash(input);

    std::vector<field_ct> output = pack_bytes_into_field_elements(output_bytes);
    fix_vector(output);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test SHA256 circuit graph analysis with NIST test vector 5
 *
 * This test verifies the graph structure of a SHA256 circuit when processing
 * a large input of 1000 repeated 'A' characters (NIST test vector 5).
 *
 * The test checks that:
 * - The circuit consists of exactly 1 connected component
 * - No variables appear in only one gate after witness fixing
 *
 * This is marked as a HEAVY_TEST due to the large input size requiring
 * significant computation.
 */
HEAVY_TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_five)
{
    auto builder = Builder();

    byte_array_ct input(
        &builder,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAA");

    fix_byte_array(input);
    byte_array_ct output_bytes = stdlib::SHA256<bb::UltraCircuitBuilder>::hash(input);

    std::vector<field_ct> output = pack_bytes_into_field_elements(output_bytes);
    fix_vector(output);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    EXPECT_EQ(connected_components.size(), 1);
}

/**
 * @brief Test SHA256 circuit graph analysis with NIST test vector 1
 *
 * This test verifies the graph structure of a SHA256 circuit when processing
 * the input string "abc" (NIST test vector 1).
 *
 * The test checks that:
 * - The circuit consists of exactly 1 connected component
 * - No variables appear in only one gate after witness fixing
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_one)
{
    auto builder = Builder();
    byte_array_ct input(&builder, "abc");
    fix_byte_array(input);
    byte_array_ct output_bytes = stdlib::SHA256<Builder>::hash(input);
    fix_byte_array(output_bytes);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test SHA256 circuit graph analysis with NIST test vector 2
 *
 * This test verifies the graph structure of a SHA256 circuit when processing
 * the input string "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (NIST test vector 2).
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_two)
{
    auto builder = Builder();
    byte_array_ct input(&builder, "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
    fix_byte_array(input);
    byte_array_ct output_bytes = stdlib::SHA256<Builder>::hash(input);
    fix_byte_array(output_bytes);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test SHA256 circuit graph analysis with NIST test vector 3
 *
 * This test verifies the graph structure of a SHA256 circuit when processing
 * the input byte 0xbd
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_three)
{
    auto builder = Builder();

    // one byte, 0xbd
    byte_array_ct input(&builder, std::vector<uint8_t>{ 0xbd });
    fix_byte_array(input);
    byte_array_ct output_bytes = stdlib::SHA256<Builder>::hash(input);
    fix_byte_array(output_bytes);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test SHA256 circuit graph analysis with NIST test vector 4
 *
 * This test verifies the graph structure of a SHA256 circuit when processing
 * 4 bytes "c98c8e55" (NIST test vector 4).
 */
TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_four)
{
    auto builder = Builder();

    // 4 bytes, 0xc98c8e55
    byte_array_ct input(&builder, std::vector<uint8_t>{ 0xc9, 0x8c, 0x8e, 0x55 });
    fix_byte_array(input);
    byte_array_ct output_bytes = stdlib::SHA256<Builder>::hash(input);
    fix_byte_array(output_bytes);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

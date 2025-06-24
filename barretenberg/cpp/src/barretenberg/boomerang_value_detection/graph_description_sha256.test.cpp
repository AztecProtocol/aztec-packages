#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace bb;
using namespace bb::stdlib;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using byte_array_pt = byte_array<Builder>;
using packed_byte_array_pt = packed_byte_array<Builder>;
using field_pt = field_t<Builder>;

/**
 static analyzer usually prints input and output variables as variables in one gate. In tests these variables
 are not dangerous and usually we can filter them by adding gate for fixing witness. Then these variables will be
 in 2 gates, and static analyzer won't print them. functions fix_vector and fix_byte_array do it
 for vector of variables and packed_byte_array respectively
*/

void fix_vector(std::vector<field_pt>& vector)
{
    for (auto& elem : vector) {
        elem.fix_witness();
    }
}

void fix_byte_array(packed_byte_array_pt& input)
{
    std::vector<field_pt> limbs = input.get_limbs();
    fix_vector(limbs);
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
    packed_byte_array_pt input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");
    fix_byte_array(input);

    packed_byte_array_pt output_bits = stdlib::sha256(input);

    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);
    fix_vector(output);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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

    packed_byte_array_pt input(
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
    packed_byte_array_pt output_bits = stdlib::sha256<bb::UltraCircuitBuilder>(input);

    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);
    fix_vector(output);

    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
    packed_byte_array_pt input(&builder, "abc");
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
    packed_byte_array_pt input(&builder, "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
    packed_byte_array_pt input(&builder, std::vector<uint8_t>{ 0xbd });
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
    packed_byte_array_pt input(&builder, std::vector<uint8_t>{ 0xc9, 0x8c, 0x8e, 0x55 });
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256<Builder>(input);
    fix_byte_array(output_bits);
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

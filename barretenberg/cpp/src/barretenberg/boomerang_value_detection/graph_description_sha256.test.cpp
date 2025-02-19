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
<<<<<<< HEAD
using namespace cdg;

using Builder = UltraCircuitBuilder;
using byte_array_pt = byte_array<Builder>;
using packed_byte_array_pt = packed_byte_array<Builder>;
using field_pt = field_t<Builder>;

void fix_vector(std::vector<field_pt>& vector) {
    for (auto& elem: vector) {
        elem.fix_witness();
    }
}

void fix_byte_array(packed_byte_array_pt& input) {
    std::vector<field_pt> limbs = input.get_limbs();
    fix_vector(limbs);
}

=======

using Builder = UltraCircuitBuilder;

using byte_array_ct = byte_array<Builder>;
using packed_byte_array_ct = packed_byte_array<Builder>;
using field_ct = field_t<Builder>;
>>>>>>> a86b797d059502fbd402550492f9ad13bd4ede1c

/**
 all these tests check graph description for sha256 circuits. All circuits have to consist from 1 connected component
 */

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_55_bytes)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
<<<<<<< HEAD
    packed_byte_array_pt input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");
    fix_byte_array(input);

    packed_byte_array_pt output_bits = stdlib::sha256(input);

    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);
    fix_vector(output);
=======
    packed_byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");

    packed_byte_array_ct output_bits = stdlib::sha256(input);

    std::vector<field_ct> output = output_bits.to_unverified_byte_slices(4);
>>>>>>> a86b797d059502fbd402550492f9ad13bd4ede1c

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
<<<<<<< HEAD
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    if (variables_in_one_gate.size() > 0) {
        for (const auto& elem: variables_in_one_gate) {
            info("elem == ", elem);
        }
    }
=======
>>>>>>> a86b797d059502fbd402550492f9ad13bd4ede1c
}

HEAVY_TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_five)
{
<<<<<<< HEAD
    auto builder = Builder();
=======
    typedef stdlib::field_t<UltraCircuitBuilder> field_pt;
    typedef stdlib::packed_byte_array<UltraCircuitBuilder> packed_byte_array_pt;

    auto builder = UltraCircuitBuilder();
>>>>>>> a86b797d059502fbd402550492f9ad13bd4ede1c

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

<<<<<<< HEAD
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256<bb::UltraCircuitBuilder>(input);
    
    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);
    fix_vector(output);

    info("start creating the Graph");
    Graph graph = Graph(builder);
    info("graph creating is ended");
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    EXPECT_EQ(connected_components.size(), 1);
}

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_one)
{
    auto builder = Builder();
    packed_byte_array_pt input(&builder, "abc");
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_two)
{
    auto builder = Builder();
    packed_byte_array_pt input(&builder, "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_three)
{
    auto builder = Builder();

    // one byte, 0xbd
    packed_byte_array_pt input(&builder, std::vector<uint8_t>{ 0xbd });
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256(input);
    fix_byte_array(output_bits);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

TEST(boomerang_stdlib_sha256, test_graph_for_sha256_NIST_vector_four)
{
    auto builder = Builder();

    // 4 bytes, 0xc98c8e55
    packed_byte_array_pt input(&builder, std::vector<uint8_t>{ 0xc9, 0x8c, 0x8e, 0x55 });
    fix_byte_array(input);
    packed_byte_array_pt output_bits = stdlib::sha256<Builder>(input);
    fix_byte_array(output_bits);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
=======
    packed_byte_array_pt output_bits = stdlib::sha256<bb::UltraCircuitBuilder>(input);

    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
>>>>>>> a86b797d059502fbd402550492f9ad13bd4ede1c
}
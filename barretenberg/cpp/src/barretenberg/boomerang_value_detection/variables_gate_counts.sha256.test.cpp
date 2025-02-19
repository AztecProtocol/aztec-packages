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

#include <array>

#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using byte_array_ct = byte_array<Builder>;
using packed_byte_array_ct = packed_byte_array<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using field_ct = field_t<Builder>;

bool check_in_byte_array(const uint32_t& real_var_index, const packed_byte_array_ct& byte_array)
{
    std::vector<field_t<Builder>> limbs = byte_array.get_limbs();
    for (const auto& elem : limbs) {
        if (elem.witness_index == real_var_index) {
            return true;
        }
    }
    return false;
}

bool check_in_range_lists(const uint32_t& real_var_index, const uint64_t& target_range, const Builder& builder)
{
    auto range_lists = builder.range_lists;
    auto target_list = range_lists[target_range];
    for (const auto elem : target_list.variable_indices) {
        if (elem == real_var_index) {
            return true;
        }
    }
    return false;
}

/**
 * @brief all these tests check circuits for sha256 NIST VECTORS to find variables that won't properly constrained,
 * i.e. have variable gates count = 1. Some variables can be from input/output vectors or from range_constraints,
 * and they are not dangerous.
 */

TEST(boomerang_stdlib_sha256, test_variables_gate_counts_for_sha256_55_bytes)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
    packed_byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");

    packed_byte_array_ct output_bits = stdlib::sha256(input);

    // std::vector<field_ct> output = output_bits.to_unverified_byte_slices(4);

    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(builder);
    std::vector<uint32_t> vector_variables_in_on_gate(variables_in_on_gate.begin(), variables_in_on_gate.end());
    std::sort(vector_variables_in_on_gate.begin(), vector_variables_in_on_gate.end());
    for (const auto& elem : vector_variables_in_on_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}

TEST(boomerang_stdlib_sha256, test_variable_gates_count_for_sha256_NIST_vector_one)
{
    auto builder = Builder();
    packed_byte_array_ct input(&builder, "abc");
    packed_byte_array_ct output_bits = stdlib::sha256(input);

    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}

TEST(boomerang_stdlib_sha256, test_variable_gates_count_for_sha256_NIST_vector_two)
{
    auto builder = Builder();

    packed_byte_array_ct input(&builder, "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");

    packed_byte_array_ct output_bits = stdlib::sha256(input);
    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}

TEST(boomerang_stdlib_sha256, test_variable_gates_count_sha256_NIST_vector_three)
{
    auto builder = Builder();

    // one byte, 0xbd
    packed_byte_array_ct input(&builder, std::vector<uint8_t>{ 0xbd });
    packed_byte_array_ct output_bits = stdlib::sha256(input);
    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}

TEST(boomerang_stdlib_sha256, test_variable_gates_count_sha256_NIST_vector_four)
{
    auto builder = Builder();

    // 4 bytes, 0xc98c8e55
    packed_byte_array_ct input(&builder, std::vector<uint8_t>{ 0xc9, 0x8c, 0x8e, 0x55 });
    packed_byte_array_ct output_bits = stdlib::sha256<Builder>(input);
    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}

HEAVY_TEST(boomerang_stdlib_sha256, test_variable_gates_count_for_sha256_NIST_vector_five)
{
    auto builder = Builder();

    packed_byte_array_ct input(
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

    packed_byte_array_ct output_bits = stdlib::sha256(input);
    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_on_gate) {
        bool result1 = check_in_byte_array(elem, input);
        bool result2 = check_in_byte_array(elem, output_bits);
        bool result3 = check_in_range_lists(elem, 3, builder);
        bool check = (result1 == 1) || (result2 == 1) || (result3 == 1);
        EXPECT_EQ(check, true);
    }
}
#include "barretenberg/boomerang_value_detection/graph.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"

#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
using namespace bb;
using namespace cdg;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Params = crypto::Poseidon2Bn254ScalarFieldParams;
using Builder = UltraCircuitBuilder;
using Permutation = stdlib::Poseidon2Permutation<Params, Builder>;
using field_t = stdlib::field_t<Builder>;
using witness_t = stdlib::witness_t<Builder>;
using _curve = stdlib::bn254<Builder>;
using byte_array_ct = _curve::byte_array_ct;
using fr_ct = typename _curve::ScalarField;
using witness_ct = typename _curve::witness_ct;

/**
 * @brief Check if a variable index is present in the input vector
 *
 * Static analyzer usually prints input and output variables as variables in one gate. In these tests output variables
 * are not dangerous. We can filter them by checking that difference between their witness indexes and witness index
 * of result <= 3
 *
 * @param input_vector Vector of field elements to check against
 * @param real_var_index Variable index to find
 * @return true if the variable index is found in the input vector
 * @return false if the variable index is not found
 */
bool check_in_input_vector(const std::vector<field_t>& input_vector, const uint32_t& real_var_index)
{
    for (const auto& elem : input_vector) {
        if (elem.witness_index == real_var_index) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Test graph description for poseidon2 hash with random inputs
 *
 * The result should be one connected component, and only output variables must be in one gate
 *
 * @param num_inputs Number of random inputs to generate
 */
void test_poseidon2s_circuit(size_t num_inputs = 5)
{
    auto builder = Builder();
    std::vector<field_t> inputs;

    for (size_t i = 0; i < num_inputs; ++i) {
        auto element = fr::random_element(&engine);
        inputs.emplace_back(field_t(witness_t(&builder, element)));
    }

    for (auto& elem : inputs) {
        elem.fix_witness();
    }
    [[maybe_unused]] auto result = stdlib::poseidon2<Builder>::hash(builder, inputs);
    auto graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    std::unordered_set<uint32_t> outputs{
        result.witness_index, result.witness_index + 1, result.witness_index + 2, result.witness_index + 3
    };
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(outputs.contains(elem), true);
    }
}

/**
 * @brief Test graph description for poseidon2 hash with byte array input
 *
 * The result should be one connected component, and only output variables must be in one gate
 *
 * @param num_inputs Number of random bytes to generate
 */
void test_poseidon2s_hash_byte_array(size_t num_inputs = 5)
{
    Builder builder;

    std::vector<uint8_t> input;
    input.reserve(num_inputs);
    for (size_t i = 0; i < num_inputs; ++i) {
        input.push_back(engine.get_random_uint8());
    }

    byte_array_ct circuit_input(&builder, input);
    auto result = stdlib::poseidon2<Builder>::hash_buffer(builder, circuit_input);
    auto graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    std::unordered_set<uint32_t> outputs{
        result.witness_index, result.witness_index + 1, result.witness_index + 2, result.witness_index + 3
    };
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(outputs.contains(elem), true);
    }
}

/**
 * @brief Test graph description for repeated poseidon2 hash operations
 *
 * The result should be one connected component with repeated hashing of pairs,
 * only output variables from each hash operation must be in one gate
 *
 * @param num_inputs Number of hash iterations to perform
 */
void test_poseidon2s_hash_repeated_pairs(size_t num_inputs = 5)
{
    Builder builder;

    fr left_in = fr::random_element();
    fr right_in = fr::random_element();

    fr_ct left = witness_ct(&builder, left_in);
    fr_ct right = witness_ct(&builder, right_in);
    right.fix_witness();
    std::unordered_set<uint32_t> outputs{ left.witness_index };
    // num_inputs - 1 iterations since the first hash hashes two elements
    for (size_t i = 0; i < num_inputs - 1; ++i) {
        left = stdlib::poseidon2<Builder>::hash(builder, { left, right });
        outputs.insert(left.witness_index + 1);
        outputs.insert(left.witness_index + 2);
        outputs.insert(left.witness_index + 3);
    }
    left.fix_witness();

    auto graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(outputs.contains(elem), true);
    }
}

/**
 * @brief Test graph description for a single poseidon2 permutation
 *
 * The result should be one connected component with no variables in one gate,
 * as permutation connects all variables through its internal structure
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_one_permutation)
{
    std::array<field_t, Params::t> inputs;
    auto builder = Builder();

    for (size_t i = 0; i < Params::t; ++i) {
        const auto element = fr::random_element(&engine);
        inputs[i] = field_t(witness_t(&builder, element));
    }

    auto poseidon2permutation = Permutation();
    [[maybe_unused]] auto new_state = poseidon2permutation.permutation(&builder, inputs);
    for (auto& elem : new_state) {
        elem.fix_witness();
    }

    auto graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test graph description for two separate poseidon2 permutations
 *
 * The result should be two connected components (one for each permutation) with no variables in one gate,
 * verifying that different input sets create separate components
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_two_permutations)
{
    // we want to check that 2 permutations for different inputs give different connected components
    std::array<field_t, Params::t> input1;
    std::array<field_t, Params::t> input2;
    auto builder = Builder();

    for (size_t i = 0; i < Params::t; ++i) {
        const auto el1 = fr::random_element(&engine);
        input1[i] = field_t(witness_t(&builder, el1));
        const auto el2 = fr::random_element(&engine);
        input2[i] = field_t(witness_t(&builder, el2));
    }

    auto poseidon2permutation = Permutation();
    [[maybe_unused]] auto state1 = poseidon2permutation.permutation(&builder, input1);
    [[maybe_unused]] auto state2 = poseidon2permutation.permutation(&builder, input2);
    for (auto& elem : state1) {
        elem.fix_witness();
    }
    for (auto& elem : state2) {
        elem.fix_witness();
    }
    auto graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 2);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Test graph for poseidon2s with varying input sizes
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s)
{
    for (size_t num_inputs = 6; num_inputs < 100; num_inputs++) {
        test_poseidon2s_circuit(num_inputs);
    }
}

/**
 * @brief Test graph for poseidon2s with default input size
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_for_one_input_size)
{
    test_poseidon2s_circuit();
}

/**
 * @brief Test graph for poseidon2s hash with byte arrays of varying sizes
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_hash_byte_array)
{
    for (size_t num_inputs = 6; num_inputs < 100; num_inputs++) {
        test_poseidon2s_hash_byte_array(num_inputs);
    }
}

/**
 * @brief Test graph for poseidon2s with repeated hash operations
 */
TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_hash_repeated_pairs)
{
    test_poseidon2s_hash_repeated_pairs();
}

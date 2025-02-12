#include "barretenberg/boomerang_value_detection/graph.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"

#include "barretenberg/plonk_honk_shared/arithmetization/gate_data.hpp"
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

bool check_in_input_vector(const std::vector<field_t>& input_vector, const uint32_t& real_var_index)
{
    for (const auto& elem : input_vector) {
        if (elem.witness_index == real_var_index) {
            return true;
        }
    }
    return false;
}

void test_poseidon2s_circuit(size_t num_inputs = 5)
{
    auto builder = Builder();
    std::vector<field_t> inputs;

    for (size_t i = 0; i < num_inputs; ++i) {
        const auto element = fr::random_element(&engine);
        inputs.emplace_back(field_t(witness_t(&builder, element)));
    }

    auto result = stdlib::poseidon2<Builder>::hash(builder, inputs);
    auto res_index = result.witness_index;
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        info("elem = ", elem);
        if (!check_in_input_vector(inputs, elem) && elem != res_index) {
            bool check = (elem - res_index == 1) || (elem - res_index == 2) || (elem - res_index == 3);
            EXPECT_EQ(check, true);
        }
    }
}

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
    //(void)new_state;

    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    graph.print_connected_components();
}

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
    poseidon2permutation.permutation(&builder, input1);
    poseidon2permutation.permutation(&builder, input2);
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 2);
    graph.print_connected_components();
}

TEST(boomerang_poseidon2s, test_graph_for_poseidon2s)
{
    for (size_t num_inputs = 6; num_inputs < 100; num_inputs++) {
        test_poseidon2s_circuit(num_inputs);
    }
}

TEST(boomerang_poseidon2s, test_graph_for_poseidon2s_for_one_input_size)
{
    test_poseidon2s_circuit(5);
}

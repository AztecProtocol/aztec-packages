#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/memory/dynamic_array.hpp"

using namespace bb;
namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

// Defining ultra-specific types for local testing.
using Builder = UltraCircuitBuilder;
using bool_ct = stdlib::bool_t<Builder>;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using DynamicArray_ct = stdlib::DynamicArray<Builder>;

TEST(boomerang_stdlib_dynamic_array, graph_description_dynamic_array_method_resize_test)
{

    Builder builder;
    const size_t max_size = 10;

    DynamicArray_ct array(&builder, max_size);

    field_ct next_size = field_ct(witness_ct(&builder, (uint256_t)(max_size - 1)));
    for (size_t i = 0; i < max_size; ++i) {
        array.push(field_ct::from_witness(&builder, i));
    }

    array.resize(next_size, 7);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    if (variables_in_one_gate.size() > 0) {
        for (const auto& elem : variables_in_one_gate) {
            info("elem = ", elem);
        }
    } else {
        info("variables_in_one_gate is empty");
    }
    EXPECT_EQ(connected_components.size(), 1);
}

TEST(boomerang_stdlib_dynamic_array, graph_description_dynamic_array_consistency_methods) 
{
    Builder builder;
    const size_t max_size = 10;

    DynamicArray_ct array(&builder, max_size);

    for (size_t i = 0; i < max_size; ++i) {
        array.push(field_ct::from_witness(&builder, i));
    }

    for (size_t i = 0; i < max_size; ++i) {
        array.pop();
    }

    array.resize(max_size - 1, 7);

    array.conditional_push(false, 100);
    array.conditional_push(true, 100);
    array.conditional_pop(false);
    array.conditional_pop(true);
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    graph.print_variables_in_one_gate();
}
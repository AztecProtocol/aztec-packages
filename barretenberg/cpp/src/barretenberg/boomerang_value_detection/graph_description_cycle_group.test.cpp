#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "./graph.hpp"
#include "barretenberg/common/test.hpp"

using Builder = bb::UltraCircuitBuilder;
using bool_t = typename bb::stdlib::bool_t<Builder>;
using field_t = typename bb::stdlib::field_t<Builder>;
using witness_t = typename bb::stdlib::witness_t<Builder>;
using public_witness_t = typename bb::stdlib::public_witness_t<Builder>;
using cycle_group_t = typename bb::stdlib::cycle_group<Builder>;
using cycle_scalar_t = typename cycle_group_t::cycle_scalar;
using Curve = typename bb::stdlib::cycle_group<Builder>::Curve;
using GroupElement = typename Curve::Element;
using AffineElement = typename Curve::AffineElement;
using ScalarField = typename Curve::ScalarField;
using BaseField = typename Curve::BaseField;
using namespace cdg;

TEST(boomerang_cycle_group, sasha_test)
{
    Builder builder;
    auto left = cycle_group_t::from_witness(&builder, AffineElement::random_element());
    auto right = cycle_group_t::from_witness(&builder, AffineElement::random_element());
    [[maybe_unused]]auto res = left + right;
    [[maybe_unused]]auto res2 = res * cycle_scalar_t(ScalarField(7));
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    if (variables_in_one_gate.size() > 0) {
        for (const auto& elem: variables_in_one_gate) {
            info("elem == ", elem);
        }
    }
}

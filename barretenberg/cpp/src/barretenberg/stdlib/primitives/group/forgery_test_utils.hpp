#pragma once

#include "barretenberg/numeric/general/general.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <memory>
#include <span>
#include <type_traits>

namespace bb::stdlib::test_utils {

// Equal-operand ADD gates leave their output unconstrained. Forge the first such output and replay later elliptic
// gates, leaving other constraints untouched. Return false if no such gate exists.
template <typename Builder> bool forge_degenerate_ecc_add(Builder& builder)
{
    using Curve = typename cycle_group<Builder>::Curve;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    auto& block = builder.blocks.elliptic;
    const auto& q_elliptic = block.gate_selector_for(GateKind::Elliptic);
    bool forged = false;
    for (size_t i = 0; i + 1 < block.size(); ++i) {
        if (q_elliptic[i] != 1) {
            continue;
        }
        const bool is_double = block.q_m()[i] == 1;
        const AffineElement p1(builder.get_variable(block.w_r()[i]), builder.get_variable(block.w_o()[i]));
        const AffineElement p2(builder.get_variable(block.w_l()[i + 1]),
                               block.q_1()[i] * builder.get_variable(block.w_4()[i + 1]));
        AffineElement output;
        if (!forged && !is_double && p1 == p2) {
            output = AffineElement(Element::random_element(&numeric::get_debug_randomness()));
            forged = true;
        } else if (!forged) {
            continue;
        } else {
            output = is_double ? AffineElement(Element(p1).dbl()) : AffineElement(Element(p1) + Element(p2));
        }
        builder.set_variable(block.w_r()[i + 1], output.x);
        builder.set_variable(block.w_o()[i + 1], output.y);
    }
    return forged;
}

// set_variable requires write-VK mode.
template <typename Builder> Builder make_forgeable_builder()
{
    if constexpr (std::is_constructible_v<Builder, bool>) {
        return Builder(/*is_write_vk_mode=*/true);
    } else {
        return Builder(std::make_shared<ECCOpQueue>(), /*is_write_vk_mode=*/true);
    }
}

// Reproduce the Straus offset to construct collisions with its accumulator.
template <typename Builder>
typename cycle_group<Builder>::Element variable_base_offset(
    std::span<const typename cycle_group<Builder>::AffineElement> offset_generators, size_t num_points)
{
    using Element = typename cycle_group<Builder>::Element;
    constexpr size_t table_bits = cycle_group<Builder>::ROM_TABLE_BITS;
    constexpr size_t num_rounds = numeric::ceil_div(cycle_group<Builder>::cycle_scalar::NUM_BITS, table_bits);
    Element accumulator = offset_generators[0];
    for (size_t round = 0; round < num_rounds; ++round) {
        if (round != 0) {
            for (size_t j = 0; j < table_bits; ++j) {
                accumulator = accumulator.dbl();
            }
        }
        for (size_t j = 0; j < num_points; ++j) {
            accumulator += Element(offset_generators[j + 1]);
        }
    }
    return accumulator;
}

} // namespace bb::stdlib::test_utils

#pragma once

#include "barretenberg/stdlib/primitives/bool/bool.hpp"

namespace cdg {

template <typename CircuitBuilder> struct Bool {
    uint32_t witness_index;
    bb::stdlib::bool_t<CircuitBuilder> witness;
};

/**
 * @brief Get the result of the normalization gate from the circuit
 * @param builder The builder
 * @param a_bool The boolean_t
 * @return The resulting (witness_index, witness) of the normalization gate
 * @throws std::runtime_error if no normalization gate exists
 */
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_normalization_result(CircuitBuilder& builder, const Bool<CircuitBuilder>& a_bool)
{
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;
    auto a_idx = a_bool.witness_index;
    auto a = a_bool.witness;
    if (a.is_constant() || !a.is_inverted()) {
        return Bool<CircuitBuilder>{ a_idx, a };
    }
    const int inverted = static_cast<int>(a.is_inverted());
    FF q_l{ 1 - (2 * inverted) };
    FF q_c{ inverted };
    FF q_o = FF::neg_one();
    FF q_m = FF::zero();
    FF q_r = FF::zero();
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == q_l;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == q_r;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == q_o;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == q_c;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == q_m;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_o()[gate_idx];
            return Bool<CircuitBuilder>{ result_idx, bool_ct::from_witness_index_unsafe(&builder, result_idx) };
        }
    }
    throw std::runtime_error("No normalization gate found for bool " + std::to_string(a_idx));
}

/**
 * @brief Get the result of the and gate from the circuit
 * @param builder The builder
 * @param a_bool The first boolean_t
 * @param b_bool The second boolean_t
 * @return The resulting (witness_index, witness) of the and gate
 * @throws std::runtime_error if no and gate exists
 */
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_and_result(CircuitBuilder& builder,
                                    const Bool<CircuitBuilder>& a_bool,
                                    const Bool<CircuitBuilder>& b_bool)
{
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;
    auto a_idx = a_bool.witness_index;
    auto b_idx = b_bool.witness_index;
    auto a = a_bool.witness;
    auto b = b_bool.witness;
    if (a.is_constant() || b.is_constant()) {
        return Bool<CircuitBuilder>{ a_idx, a && b };
    }

    int i_a = static_cast<int>(a.is_inverted());
    int i_b = static_cast<int>(b.is_inverted());
    FF q_m{ 1 - (2 * i_b) - (2 * i_a) + (4 * i_a * i_b) };
    FF q_l{ i_b * (1 - (2 * i_a)) };
    FF q_r{ i_a * (1 - (2 * i_b)) };
    FF q_o{ FF::neg_one() };
    FF q_c{ i_a * i_b };
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == q_l;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == q_r;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == q_o;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == q_c;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == q_m;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_o()[gate_idx];
            return Bool<CircuitBuilder>{ result_idx, bool_ct::from_witness_index_unsafe(&builder, result_idx) };
        }
    }
    throw std::runtime_error("No and gate found for bools " + std::to_string(a_idx) + " and " + std::to_string(b_idx));
}

/**
 * @brief Get the result of the or gate from the circuit
 * @param builder The builder
 * @param a_bool The first boolean_t
 * @param b_bool The second boolean_t
 * @return The resulting (witness_index, witness) of the or gate
 * @throws std::runtime_error if no or gate exists
 */
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_or_result(CircuitBuilder& builder,
                                   const Bool<CircuitBuilder>& a_bool,
                                   const Bool<CircuitBuilder>& b_bool)
{
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;
    auto a_idx = a_bool.witness_index;
    auto b_idx = b_bool.witness_index;
    auto a = a_bool.witness;
    auto b = b_bool.witness;
    if (a.is_constant() || b.is_constant()) {
        return Bool<CircuitBuilder>{ a_idx, a || b };
    }
    const int rhs_inverted = static_cast<int>(b.is_inverted());
    const int lhs_inverted = static_cast<int>(a.is_inverted());

    FF q_m{ -((1 - (2 * rhs_inverted)) * (1 - (2 * lhs_inverted))) };
    FF q_l{ (1 - (2 * lhs_inverted)) * (1 - rhs_inverted) };
    FF q_r{ (1 - lhs_inverted) * (1 - 2 * rhs_inverted) };
    FF q_o{ FF::neg_one() };
    FF q_c{ rhs_inverted + lhs_inverted - (rhs_inverted * lhs_inverted) };
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == q_l;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == q_r;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == q_o;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == q_c;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == q_m;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_o()[gate_idx];
            return Bool<CircuitBuilder>{ result_idx, bool_ct::from_witness_index_unsafe(&builder, result_idx) };
        }
    }
    throw std::runtime_error("No or gate found for bools " + std::to_string(a_idx) + " and " + std::to_string(b_idx));
}

/**
 * @brief Get the result of the boolean conditional assign gate from the circuit
 * @param builder The builder
 * @param predicate_bool The predicate boolean_t
 * @param a_bool The left boolean_t
 * @param b_bool The right boolean_t
 * @return The resulting (witness_index, witness) of the boolean conditional assign gate
 * @throws std::runtime_error if no boolean conditional assign gate exists
 */
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_boolean_conditional_assign_result(CircuitBuilder& builder,
                                                           const Bool<CircuitBuilder>& predicate_bool,
                                                           const Bool<CircuitBuilder>& a_bool,
                                                           const Bool<CircuitBuilder>& b_bool)
{
    if (predicate_bool.witness.is_constant()) {
        return get_normalization_result<FF>(builder, predicate_bool.witness.get_value() ? a_bool : b_bool);
    }

    bool same = a_bool.witness_index == b_bool.witness_index;
    bool witness_same =
        same && !a_bool.witness.is_constant() && (a_bool.witness.is_inverted() == b_bool.witness.is_inverted());
    bool const_same =
        same && a_bool.witness.is_constant() && (a_bool.witness.get_value() == b_bool.witness.get_value());
    if (witness_same || const_same) {
        return get_normalization_result<FF, CircuitBuilder>(builder, a_bool);
    }

    auto inverted_predicate = Bool<CircuitBuilder>{ predicate_bool.witness_index, !predicate_bool.witness };

    auto predicate_and_a = get_and_result<FF, CircuitBuilder>(builder, predicate_bool, a_bool);
    auto not_predicate_and_b = get_and_result<FF, CircuitBuilder>(builder, inverted_predicate, b_bool);
    auto result = get_or_result<FF, CircuitBuilder>(builder, predicate_and_a, not_predicate_and_b);
    return get_normalization_result<FF, CircuitBuilder>(builder, result);
}
} // namespace cdg

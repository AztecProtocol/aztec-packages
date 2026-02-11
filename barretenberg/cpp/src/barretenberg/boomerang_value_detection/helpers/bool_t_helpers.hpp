#pragma once

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/helpers/filter_function_builder.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"

namespace cdg {

template <typename CircuitBuilder> struct Bool {
    uint32_t witness_index;
    bb::stdlib::bool_t<CircuitBuilder> witness;
};

// Takes block_idx, gate_idx from FilterFunctionBuilder::filter_gates result and returns the Bool from w_o
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_bool_from_w_o(CircuitBuilder& builder, std::pair<size_t, size_t> gate_location)
{
    auto block_idx = gate_location.first;
    auto gate_idx = gate_location.second;
    auto result_idx = builder.blocks.get()[block_idx].w_o()[gate_idx];
    return Bool<CircuitBuilder>{ result_idx,
                                 bb::stdlib::bool_t<CircuitBuilder>::from_witness_index_unsafe(&builder, result_idx) };
}

// Takes block_idx, gate_idx from FilterFunctionBuilder::filter_gates result and returns the Bool from w_4
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_bool_from_w_4(CircuitBuilder& builder, std::pair<size_t, size_t> gate_location)
{
    auto block_idx = gate_location.first;
    auto gate_idx = gate_location.second;
    auto result_idx = builder.blocks.get()[block_idx].w_4()[gate_idx];
    return Bool<CircuitBuilder>{ result_idx,
                                 bb::stdlib::bool_t<CircuitBuilder>::from_witness_index_unsafe(&builder, result_idx) };
}

/**
 * @brief Get the result of the normalization gate from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_bool The boolean_t
 * @return The resulting (witness_index, witness) of the normalization gate
 */
template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> get_normalization_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                              CircuitBuilder& builder,
                                              const Bool<CircuitBuilder>& a_bool)
{
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

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_r(builder.zero_idx())
                             .set_w_4(builder.zero_idx())
                             .set_q_1(q_l)
                             .set_q_2(q_r)
                             .set_q_3(q_o)
                             .set_q_4(FF::zero())
                             .set_q_c(q_c)
                             .set_q_m(q_m)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        throw std::runtime_error("No normalization gate found for bool " + std::to_string(a_idx));
    }

    return get_bool_from_w_o<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of the and gate from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_bool The first boolean_t
 * @param b_bool The second boolean_t
 * @return The resulting (witness_index, witness) of the and gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Bool<CircuitBuilder>> get_and_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                   CircuitBuilder& builder,
                                                   const Bool<CircuitBuilder>& a_bool,
                                                   const Bool<CircuitBuilder>& b_bool)
{
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

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_r(b_idx)
                             .set_w_4(builder.zero_idx())
                             .set_q_m(q_m)
                             .set_q_1(q_l)
                             .set_q_2(q_r)
                             .set_q_3(q_o)
                             .set_q_4(FF::zero())
                             .set_q_c(q_c)
                             .set_q_m(q_m)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        return std::nullopt;
    }

    return get_bool_from_w_o<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of the or gate from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_bool The first boolean_t
 * @param b_bool The second boolean_t
 * @return The resulting (witness_index, witness) of the or gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Bool<CircuitBuilder>> get_or_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                  CircuitBuilder& builder,
                                                  const Bool<CircuitBuilder>& a_bool,
                                                  const Bool<CircuitBuilder>& b_bool)
{
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

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_r(b_idx)
                             .set_w_4(builder.zero_idx())
                             .set_q_m(q_m)
                             .set_q_1(q_l)
                             .set_q_2(q_r)
                             .set_q_3(q_o)
                             .set_q_4(FF::zero())
                             .set_q_c(q_c)
                             .set_q_m(q_m)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No or gate found for bools ", a_idx, " and ", b_idx);
        return std::nullopt;
    }

    return get_bool_from_w_o<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of the boolean conditional assign gate from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param predicate_bool The predicate boolean_t
 * @param a_bool The left boolean_t
 * @param b_bool The right boolean_t
 * @return The resulting (witness_index, witness) of the boolean conditional assign gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Bool<CircuitBuilder>> get_boolean_conditional_assign_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                          CircuitBuilder& builder,
                                                                          const Bool<CircuitBuilder>& predicate_bool,
                                                                          const Bool<CircuitBuilder>& a_bool,
                                                                          const Bool<CircuitBuilder>& b_bool)
{
    if (predicate_bool.witness.is_constant()) {
        return get_normalization_result<FF, CircuitBuilder>(
            analyzer, builder, predicate_bool.witness.get_value() ? a_bool : b_bool);
    }

    bool same = a_bool.witness_index == b_bool.witness_index;
    bool witness_same =
        same && !a_bool.witness.is_constant() && (a_bool.witness.is_inverted() == b_bool.witness.is_inverted());
    bool const_same =
        same && a_bool.witness.is_constant() && (a_bool.witness.get_value() == b_bool.witness.get_value());
    if (witness_same || const_same) {
        return get_normalization_result<FF, CircuitBuilder>(analyzer, builder, a_bool);
    }

    auto inverted_predicate = Bool<CircuitBuilder>{ predicate_bool.witness_index, !predicate_bool.witness };

    auto predicate_and_a = get_and_result<FF, CircuitBuilder>(analyzer, builder, predicate_bool, a_bool);
    if (!predicate_and_a.has_value()) {
        return std::nullopt;
    }
    auto not_predicate_and_b = get_and_result<FF, CircuitBuilder>(analyzer, builder, inverted_predicate, b_bool);
    if (!not_predicate_and_b.has_value()) {
        return std::nullopt;
    }
    auto result = get_or_result<FF, CircuitBuilder>(analyzer, builder, *predicate_and_a, *not_predicate_and_b);
    if (!result.has_value()) {
        return std::nullopt;
    }
    return get_normalization_result<FF, CircuitBuilder>(analyzer, builder, *result);
}
} // namespace cdg

#pragma once

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/filter_function_builder.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace cdg {

template <typename CircuitBuilder> struct Field {
    uint32_t witness_index;
    bb::stdlib::field_t<CircuitBuilder> witness;
};

template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> witness_or_constant_to_field(const acir_format::WitnessOrConstant<FF>& witness_or_constant,
                                                   CircuitBuilder& builder)
{
    auto field_t = acir_format::to_field_ct(witness_or_constant, builder);
    auto res_field = Field<CircuitBuilder>{ .witness = field_t };
    if (field_t.is_constant()) {
        res_field.witness_index = bb::stdlib::IS_CONSTANT;
    } else {
        res_field.witness_index = witness_or_constant.index;
    }
    return res_field;
}

template <typename FF, typename CircuitBuilder>
Bool<CircuitBuilder> witness_or_constant_to_bool(const acir_format::WitnessOrConstant<FF>& witness_or_constant,
                                                 CircuitBuilder& builder)
{
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    if (witness_or_constant.is_constant) {
        return Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, bool_ct(static_cast<bool>(witness_or_constant.value)) };
    }
    return Bool<CircuitBuilder>{ witness_or_constant.index,
                                 bool_ct::from_witness_index_unsafe(&builder, witness_or_constant.index) };
}

// Takes block_idx, gate_idx from FilterFunctionBuilder::filter_gates result and returns the Field from w_o
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_field_from_w_o(CircuitBuilder& builder, std::pair<size_t, size_t> gate_location)
{
    auto block_idx = gate_location.first;
    auto gate_idx = gate_location.second;
    auto result_idx = builder.blocks.get()[block_idx].w_o()[gate_idx];
    return Field<CircuitBuilder>{ result_idx,
                                  bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx) };
}

// Takes block_idx, gate_idx from FilterFunctionBuilder::filter_gates result and returns the Field from w_4
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_field_from_w_4(CircuitBuilder& builder, std::pair<size_t, size_t> gate_location)
{
    auto block_idx = gate_location.first;
    auto gate_idx = gate_location.second;
    auto result_idx = builder.blocks.get()[block_idx].w_4()[gate_idx];
    return Field<CircuitBuilder>{ result_idx,
                                  bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx) };
}

template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> find_fixed_witness_field(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                              CircuitBuilder& builder,
                                                              const FF& value)
{
    const auto witness_idx = analyzer.get_fixed_witness_index(value);
    if (!witness_idx.has_value()) {
        log_error("Cannot find fixed witness for constant ", value);
        return std::nullopt;
    }
    return Field<CircuitBuilder>{
        witness_idx.value(), bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, witness_idx.value())
    };
}

/**
 * @brief Get the result of field_t * field_t from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @return The resulting (witness_index, witness) of field_t * field_t
 * @note a and b should not be constants, otherwise field_t * field_t does not create a gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_mul_gate_output(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                         CircuitBuilder& builder,
                                                         const Field<CircuitBuilder>& a_field,
                                                         const Field<CircuitBuilder>& b_field)
{
    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    if (a.is_constant() && b.is_constant()) {
        return Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, a * b };
    }
    if (a.is_constant()) {
        return Field<CircuitBuilder>{ b_idx, a * b };
    }
    if (b.is_constant()) {
        return Field<CircuitBuilder>{ a_idx, a * b };
    }
    auto q_c = a.additive_constant * b.additive_constant;
    auto q_r = a.additive_constant * b.multiplicative_constant;
    auto q_l = a.multiplicative_constant * b.additive_constant;
    auto q_m = a.multiplicative_constant * b.multiplicative_constant;

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_r(b_idx)
                             .set_w_4(builder.zero_idx())
                             .set_q_m(q_m)
                             .set_q_1(q_l)
                             .set_q_2(q_r)
                             .set_q_3(FF::neg_one())
                             .set_q_c(q_c)
                             .set_q_4(FF::zero())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No multiplication gate found between ", a_idx, " and ", b_idx);
        return std::nullopt;
    }

    return get_field_from_w_o<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of field_t + field_t from the circuit
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @return The resulting (witness_index, witness) of field_t + field_t
 * @note a and b should not be constants, otherwise field_t + field_t does not create a gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_add_gate_output(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                         CircuitBuilder& builder,
                                                         const Field<CircuitBuilder>& a_field,
                                                         const Field<CircuitBuilder>& b_field)
{
    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    if (a.is_constant() && b.is_constant()) {
        return Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, a + b };
    }
    if (a.is_constant()) {
        return Field<CircuitBuilder>{ b_idx, a + b };
    }
    if (b.is_constant()) {
        return Field<CircuitBuilder>{ a_idx, a + b };
    }

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_r(b_idx)
                             .set_w_4(builder.zero_idx())
                             .set_q_1(a.multiplicative_constant)
                             .set_q_2(b.multiplicative_constant)
                             .set_q_4(FF::zero())
                             .set_q_c(a.additive_constant + b.additive_constant)
                             .set_q_m(FF::zero())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No addition gate found between ", a_idx, " and ", b_idx);
        return std::nullopt;
    }

    return get_field_from_w_o<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of field_t.madd(field_t, field_t) from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @param c The third field_t
 * @return The resulting (witness_index, witness) of field_t.madd(field_t, field_t)
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_madd_gate_output(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                          CircuitBuilder& builder,
                                                          const Field<CircuitBuilder>& a_field,
                                                          const Field<CircuitBuilder>& b_field,
                                                          const Field<CircuitBuilder>& c_field)
{

    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto c_idx = c_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    auto c = c_field.witness;
    if (a.is_constant()) {
        auto const_mul_res = Field<CircuitBuilder>{ b_idx, (a * b) };
        return get_add_gate_output<FF>(analyzer, builder, const_mul_res, c_field);
    }
    if (b.is_constant()) {
        auto const_mul_res = Field<CircuitBuilder>{ a_idx, (a * b) };
        return get_add_gate_output<FF>(analyzer, builder, const_mul_res, c_field);
    }

    FF mul_scaling = a.multiplicative_constant * b.multiplicative_constant;
    FF a_scaling = a.multiplicative_constant * b.additive_constant;
    FF b_scaling = b.multiplicative_constant * a.additive_constant;
    FF c_scaling = c.multiplicative_constant;
    FF const_scaling = (a.additive_constant * b.additive_constant) + c.additive_constant;
    auto w_l = a.is_constant() ? builder.zero_idx() : a_idx;
    auto w_r = b.is_constant() ? builder.zero_idx() : b_idx;
    auto w_o = c.is_constant() ? builder.zero_idx() : c_idx;
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(w_l)
                             .set_w_r(w_r)
                             .set_w_o(w_o)
                             .set_q_m(mul_scaling)
                             .set_q_1(a_scaling)
                             .set_q_2(b_scaling)
                             .set_q_3(c_scaling)
                             .set_q_4(FF::neg_one())
                             .set_q_c(const_scaling)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No madd gate found between ", a_idx, " and ", b_idx, " and ", c_idx);
        return std::nullopt;
    }

    return get_field_from_w_4<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Get the result of field_t.add_two(field_t, field_t) from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @param c The third field_t
 * @return The resulting (witness_index, witness) of field_t.add_two(field_t, field_t)
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_add_two_gate_output(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                             CircuitBuilder& builder,
                                                             const Field<CircuitBuilder>& a_field,
                                                             const Field<CircuitBuilder>& b_field,
                                                             const Field<CircuitBuilder>& c_field)
{
    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto c_idx = c_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    auto c = c_field.witness;
    // Process the cases where one of the summands is a constant
    // I have no idea how to make it smarter
    if (a.is_constant()) {
        auto const_add_res = Field<CircuitBuilder>{ b_idx, a + b };
        return get_add_gate_output<FF>(analyzer, builder, const_add_res, c_field);
    }
    if (b.is_constant()) {
        auto const_add_res = Field<CircuitBuilder>{ a_idx, a + b };
        return get_add_gate_output<FF>(analyzer, builder, const_add_res, c_field);
    }
    if (c.is_constant()) {
        auto const_add_res = Field<CircuitBuilder>{ b_idx, b + c };
        return get_add_gate_output<FF>(analyzer, builder, a_field, const_add_res);
    }

    FF a_scaling = a.multiplicative_constant;
    FF b_scaling = b.multiplicative_constant;
    FF c_scaling = c.multiplicative_constant;
    FF const_scaling = a.additive_constant + b.additive_constant + c.additive_constant;

    auto w_l = a.is_constant() ? builder.zero_idx() : a_idx;
    auto w_r = b.is_constant() ? builder.zero_idx() : b_idx;
    auto w_o = c.is_constant() ? builder.zero_idx() : c_idx;

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(w_l)
                             .set_w_r(w_r)
                             .set_w_o(w_o)
                             .set_q_m(FF::zero())
                             .set_q_1(a_scaling)
                             .set_q_2(b_scaling)
                             .set_q_3(c_scaling)
                             .set_q_c(const_scaling)
                             .set_q_4(FF::neg_one())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No add two gate found between ", a_idx, " and ", b_idx, " and ", c_idx);
        return std::nullopt;
    }

    return get_field_from_w_4<FF>(builder, filtered_gates[0]);
}

/**
 * @brief Check if the assert zero gate exists for the field_t
 * @param analyzer The analyzer
 * @param builder The builder
 * @param field The field_t
 * @return True if the all gates needed for the assert zero check exist, false otherwise
 */
template <typename FF, typename CircuitBuilder>
bool is_assert_zero_gate_exists(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                CircuitBuilder& builder,
                                const Field<CircuitBuilder>& field)
{
    auto witness_idx = field.witness_index;
    auto witness = field.witness;
    if (witness.is_constant()) {
        return witness.get_value() == FF::zero();
    }
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(witness_idx)
                             .set_w_r(builder.zero_idx())
                             .set_w_o(builder.zero_idx())
                             .set_w_4(builder.zero_idx())
                             .set_q_m(FF::zero())
                             .set_q_1(witness.multiplicative_constant)
                             .set_q_2(FF::zero())
                             .set_q_3(FF::zero())
                             .set_q_c(witness.additive_constant)
                             .set_q_4(FF::zero())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(witness_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No assert zero gate found for ", witness_idx);
        return false;
    }

    return true;
}

/**
 * @brief Get the result of the conditional assign gate from the circuit
 * @param analyzer The analyzer
 * @param builder The builder
 * @param predicate_field The predicate field_t
 * @param lhs_field The left field_t
 * @param rhs_field The right field_t
 * @return The resulting (witness_index, witness) of the conditional assign gate
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_the_result_of_conditional_assign_gate(
    StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    CircuitBuilder& builder,
    const Field<CircuitBuilder>& predicate_field,
    const Field<CircuitBuilder>& lhs_field,
    const Field<CircuitBuilder>& rhs_field)
{
    auto lhs_idx = lhs_field.witness_index;
    auto rhs_idx = rhs_field.witness_index;
    auto predicate = predicate_field.witness;
    auto lhs = lhs_field.witness;
    auto rhs = rhs_field.witness;

    if (predicate.is_constant()) {
        return predicate.get_value() ? lhs_field : rhs_field;
    }

    if (lhs_idx == rhs_idx && (lhs.additive_constant == rhs.additive_constant) &&
        (lhs.multiplicative_constant == rhs.multiplicative_constant)) {
        return lhs_field;
    }

    Field<CircuitBuilder> lhs_minus_rhs;
    if (rhs.is_constant()) {
        lhs_minus_rhs = Field<CircuitBuilder>{ lhs_idx, lhs - rhs };
    } else {
        auto minus_rhs = Field<CircuitBuilder>{ rhs_idx, -rhs };
        auto lhs_minus_rhs_tmp = get_add_gate_output<FF>(analyzer, builder, lhs_field, minus_rhs);
        if (!lhs_minus_rhs_tmp.has_value()) {
            return std::nullopt;
        }
        lhs_minus_rhs = *lhs_minus_rhs_tmp;
    }

    return get_madd_gate_output<FF>(analyzer, builder, lhs_minus_rhs, predicate_field, rhs_field);
}

/**
 * @brief Get the result of field_t::is_zero() from the circuit
 * @details is_zero() creates two evaluate_polynomial_identity gates. The first gate constrains:
 *          diff * inverse + is_zero - 1 = 0 (gate pattern: w_l=diff, w_r=inverse, w_o=is_zero, w_4=zero)
 *          We find this gate and return the is_zero Bool from w_o.
 * @param analyzer The analyzer
 * @param builder The builder
 * @param diff_field The field whose is_zero result we want
 * @return The Bool representing is_zero, or nullopt if not found
 */
template <typename FF, typename CircuitBuilder>
std::optional<Bool<CircuitBuilder>> get_is_zero_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                       CircuitBuilder& builder,
                                                       const Field<CircuitBuilder>& diff_field)
{
    auto diff_idx = diff_field.witness_index;
    auto diff = diff_field.witness;
    if (diff.is_constant()) {
        bool is_zero_val = diff.get_value() == FF::zero();
        return Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT,
                                     bb::stdlib::bool_t<CircuitBuilder>(diff.get_context(), is_zero_val) };
    }

    // Gate 1 of is_zero: evaluate_polynomial_identity(diff, inverse, is_zero, -1)
    // inverse is a fresh witness: mul=1, add=0
    // is_zero is a fresh witness: mul=1, add=0
    // -1 is constant: d = zero_idx, d_scaling = 1
    // Selectors: q_m = diff.mul, q_1 = 0, q_2 = diff.add, q_3 = 1, q_4 = 1, q_c = -1
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(diff_idx)
                             .set_w_4(builder.zero_idx())
                             .set_q_m(diff.multiplicative_constant)
                             .set_q_1(FF::zero())
                             .set_q_2(diff.additive_constant)
                             .set_q_3(FF::one())
                             .set_q_4(FF::one())
                             .set_q_c(FF::neg_one())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(diff_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No is_zero gate found for ", diff_idx);
        return std::nullopt;
    }

    auto block_idx = filtered_gates[0].first;
    auto gate_idx = filtered_gates[0].second;
    auto is_zero_idx = builder.blocks.get()[block_idx].w_o()[gate_idx];
    return Bool<CircuitBuilder>{ is_zero_idx,
                                 bb::stdlib::bool_t<CircuitBuilder>::from_witness_index_unsafe(&builder, is_zero_idx) };
}

/**
 * @brief Get the result of field_t::operator== from the circuit
 * @details operator== calls (a - b).is_zero(). This function computes the subtraction
 *          and then finds the is_zero result.
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_field The first field_t
 * @param b_field The second field_t
 * @return The Bool representing (a == b), or nullopt if not found
 */
template <typename FF, typename CircuitBuilder>
std::optional<Bool<CircuitBuilder>> get_equality_result(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                        CircuitBuilder& builder,
                                                        const Field<CircuitBuilder>& a_field,
                                                        const Field<CircuitBuilder>& b_field)
{
    auto a = a_field.witness;
    auto b = b_field.witness;

    if (a.is_constant() && b.is_constant()) {
        bool eq = a.get_value() == b.get_value();
        return Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, bb::stdlib::bool_t<CircuitBuilder>(a.get_context(), eq) };
    }

    // Compute diff = a - b. operator- negates b's constants then calls operator+
    auto neg_b = Field<CircuitBuilder>{ b_field.witness_index, -b };
    Field<CircuitBuilder> diff;

    if (a.is_constant()) {
        // a is constant: diff = a + (-b) doesn't create a gate, just updates scaling
        diff = Field<CircuitBuilder>{ b_field.witness_index, a + neg_b.witness };
    } else if (b.is_constant()) {
        // b is constant: diff = a + (-b) doesn't create a gate
        diff = Field<CircuitBuilder>{ a_field.witness_index, a - b };
    } else if (a_field.witness_index == b_field.witness_index) {
        // Same witness index: diff updates scaling without a gate
        diff = Field<CircuitBuilder>{ a_field.witness_index, a - b };
    } else {
        // Both non-constant, different witnesses: creates an add_gate
        auto diff_opt = get_add_gate_output<FF>(analyzer, builder, a_field, neg_b);
        if (!diff_opt.has_value()) {
            log_error("No subtraction gate found for equality check between ",
                      a_field.witness_index,
                      " and ",
                      b_field.witness_index);
            return std::nullopt;
        }
        diff = *diff_opt;
    }

    return get_is_zero_result<FF>(analyzer, builder, diff);
}

/**
 * @brief Find operand b (w_r) from an evaluate_polynomial_identity(a, b, c, d) gate
 * @details evaluate_polynomial_identity creates a big_mul_add_gate constraining a*b + c + d = 0.
 *          Given a, c, d, this finds b from w_r. Used for finding lambda in EC addition.
 *          Assumes b is a fresh witness (mul=1, add=0).
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_field Operand a (w_l)
 * @param c_field Operand c (w_o)
 * @param d_field Operand d (w_4)
 * @return The Field representing b, or nullopt if not found
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> get_evaluate_polynomial_identity_b(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                        CircuitBuilder& builder,
                                                                        const Field<CircuitBuilder>& a_field,
                                                                        const Field<CircuitBuilder>& c_field,
                                                                        const Field<CircuitBuilder>& d_field)
{
    auto a_idx = a_field.witness.is_constant() ? builder.zero_idx() : a_field.witness_index;
    auto c_idx = c_field.witness.is_constant() ? builder.zero_idx() : c_field.witness_index;
    auto d_idx = d_field.witness.is_constant() ? builder.zero_idx() : d_field.witness_index;
    auto a = a_field.witness;
    auto c = c_field.witness;
    auto d = d_field.witness;

    // b is a fresh witness: mul=1, add=0
    // Gate selectors:
    //   q_m = a.mul * b.mul = a.mul * 1 = a.mul
    //   q_1 = a.mul * b.add = a.mul * 0 = 0
    //   q_2 = b.mul * a.add = 1 * a.add = a.add
    //   q_3 = c.mul
    //   q_4 = d.mul
    //   q_c = a.add * b.add + c.add + d.add = 0 + c.add + d.add
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_idx)
                             .set_w_o(c_idx)
                             .set_w_4(d_idx)
                             .set_q_m(a.multiplicative_constant)
                             .set_q_1(FF::zero())
                             .set_q_2(a.additive_constant)
                             .set_q_3(c.multiplicative_constant)
                             .set_q_4(d.multiplicative_constant)
                             .set_q_c(c.additive_constant + d.additive_constant)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No evaluate_polynomial_identity gate found for a=", a_idx);
        return std::nullopt;
    }

    auto block_idx = filtered_gates[0].first;
    auto gate_idx = filtered_gates[0].second;
    auto b_idx = builder.blocks.get()[block_idx].w_r()[gate_idx];
    return Field<CircuitBuilder>{ b_idx, bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, b_idx) };
}

/**
 * @brief Check if field_t::assert_equal constraint exists between two fields
 * @details assert_equal either creates a copy constraint (merging real_variable_index) or
 *          an arithmetic gate (a*q_l - b*q_r + q_c = 0) depending on whether both are normalized.
 * @param analyzer The analyzer
 * @param builder The builder
 * @param a_field The first field_t
 * @param b_field The second field_t
 * @return True if the assert_equal constraint exists
 */
template <typename FF, typename CircuitBuilder>
bool is_assert_equal_exists(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                            CircuitBuilder& builder,
                            const Field<CircuitBuilder>& a_field,
                            const Field<CircuitBuilder>& b_field)
{
    auto a = a_field.witness;
    auto b = b_field.witness;

    if (a.is_constant() && b.is_constant()) {
        return a.get_value() == b.get_value();
    }
    if (a.is_constant()) {
        // assert_equal_constant: check that real variable value equals constant
        return builder.get_variable(b_field.witness_index) * b.multiplicative_constant + b.additive_constant ==
               a.get_value();
    }
    if (b.is_constant()) {
        return builder.get_variable(a_field.witness_index) * a.multiplicative_constant + a.additive_constant ==
               b.get_value();
    }

    // Check copy constraint: both normalized, same real_variable_index
    if (analyzer.to_real(a_field.witness_index) == analyzer.to_real(b_field.witness_index)) {
        return true;
    }

    // Check arithmetic gate: a*q_l - b*q_r + q_c = 0
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(a_field.witness_index)
                             .set_w_r(b_field.witness_index)
                             .set_w_o(builder.zero_idx())
                             .set_q_m(FF::zero())
                             .set_q_1(a.multiplicative_constant)
                             .set_q_2(-b.multiplicative_constant)
                             .set_q_3(FF::zero())
                             .set_q_c(a.additive_constant - b.additive_constant)
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(a_field.witness_index);
    auto filtered_gates = filter_helper.filter_gates(gates);
    return !filtered_gates.empty();
}
} // namespace cdg

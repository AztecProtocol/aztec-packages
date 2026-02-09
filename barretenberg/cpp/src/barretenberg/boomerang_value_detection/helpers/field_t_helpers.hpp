#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace cdg {

template <typename CircuitBuilder> struct Field {
    uint32_t witness_index;
    bb::stdlib::field_t<CircuitBuilder> witness;
};

/**
 * @brief Get the result of field_t * field_t from the circuit
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @return The resulting (witness_index, witness) of field_t * field_t
 * @throws std::runtime_error if no gate exists
 * @note a and b should not be constants, otherwise field_t * field_t does not create a gate
 */
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_mul_gate_output(CircuitBuilder& builder,
                                          const Field<CircuitBuilder>& a_field,
                                          const Field<CircuitBuilder>& b_field)
{
    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    if (a.is_constant() && b.is_constant()) {
        return Field<CircuitBuilder>{ builder.zero_idx(), a * b };
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

    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == q_m;
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == q_l;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == q_r;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == FF::neg_one();
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == q_c;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_o()[gate_idx];
            return Field<CircuitBuilder>{
                result_idx, bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx)
            };
        }
    }
    log_error("No multiplication gate found between ", a_idx, " and ", b_idx);
    throw std::runtime_error("No multiplication gate found between " + std::to_string(a_idx) + " and " +
                             std::to_string(b_idx));
}

/**
 * @brief Get the result of field_t + field_t from the circuit
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @return The resulting (witness_index, witness) of field_t + field_t
 * @throws std::runtime_error if no gate exists
 * @note a and b should not be constants, otherwise field_t + field_t does not create a gate
 */
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_add_gate_output(CircuitBuilder& builder,
                                          const Field<CircuitBuilder>& a_field,
                                          const Field<CircuitBuilder>& b_field)
{
    auto a_idx = a_field.witness_index;
    auto b_idx = b_field.witness_index;
    auto a = a_field.witness;
    auto b = b_field.witness;
    if (a.is_constant() && b.is_constant()) {
        return Field<CircuitBuilder>{ builder.zero_idx(), a + b };
    }
    if (a.is_constant()) {
        return Field<CircuitBuilder>{ b_idx, a + b };
    }
    if (b.is_constant()) {
        return Field<CircuitBuilder>{ a_idx, a + b };
    }
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == a.multiplicative_constant;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == b.multiplicative_constant;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == a.additive_constant + b.additive_constant;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_o()[gate_idx];
            return Field<CircuitBuilder>{
                result_idx, bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx)
            };
        }
    }
    log_error("No addition gate found between ", a_idx, " and ", b_idx);
    throw std::runtime_error("No addition gate found between " + std::to_string(a_idx) + " and " +
                             std::to_string(b_idx));
}

/**
 * @brief Get the result of field_t.madd(field_t, field_t) from the circuit
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @param c The third field_t
 * @return The resulting (witness_index, witness) of field_t.madd(field_t, field_t)
 * @throws std::runtime_error if no gate exists
 */
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_madd_gate_output(CircuitBuilder& builder,
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
    if (a.is_constant() || b.is_constant()) {
        return Field<CircuitBuilder>{ a_idx, (a * b) + c };
    }
    FF mul_scaling = a.multiplicative_constant * b.multiplicative_constant;
    FF a_scaling = a.multiplicative_constant * b.additive_constant;
    FF b_scaling = b.multiplicative_constant * a.additive_constant;
    FF c_scaling = c.multiplicative_constant;
    FF const_scaling = (a.additive_constant * b.additive_constant) + c.additive_constant;
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == a_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == b_idx;
        condition &= builder.blocks.arithmetic.w_o()[gate_idx] == c_idx;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == mul_scaling;
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == a_scaling;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == b_scaling;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == c_scaling;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::neg_one();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == const_scaling;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_4()[gate_idx];
            return Field<CircuitBuilder>{
                result_idx, bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx)
            };
        }
    }
    std::string error_message = "No gate created by a.madd(b, c) found between " + std::to_string(a_idx) + " and " +
                                std::to_string(b_idx) + " and " + std::to_string(c_idx);
    throw std::runtime_error(error_message);
}

/**
 * @brief Get the result of field_t.add_two(field_t, field_t) from the circuit
 * @param builder The builder
 * @param a The first field_t
 * @param b The second field_t
 * @param c The third field_t
 * @return The resulting (witness_index, witness) of field_t.add_two(field_t, field_t)
 * @throws std::runtime_error if no gate exists
 */
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_add_two_gate_output(CircuitBuilder& builder,
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
        auto const_add_res = Field<CircuitBuilder>{ b_idx, b + c };
        return get_add_gate_output<FF>(builder, const_add_res, c_idx);
    }
    if (b.is_constant()) {
        auto const_add_res = Field<CircuitBuilder>{ a_idx, a + c };
        return get_add_gate_output<FF>(builder, const_add_res, b_idx);
    }
    if (c.is_constant()) {
        auto const_add_res = Field<CircuitBuilder>{ a_idx, a + b };
        return get_add_gate_output<FF>(builder, const_add_res, c_idx);
    }

    FF a_scaling = a.multiplicative_constant;
    FF b_scaling = b.multiplicative_constant;
    FF c_scaling = c.multiplicative_constant;
    FF const_scaling = a.additive_constant + b.additive_constant + c.additive_constant;

    FF w_l = a.is_constant() ? builder.zero_idx() : a_idx;
    FF w_r = b.is_constant() ? builder.zero_idx() : b_idx;
    FF w_o = c.is_constant() ? builder.zero_idx() : c_idx;

    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == w_l;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == w_r;
        condition &= builder.blocks.arithmetic.w_o()[gate_idx] == w_o;
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == a_scaling;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == b_scaling;
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == c_scaling;
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == const_scaling;
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::neg_one();
        if (condition) {
            auto result_idx = builder.blocks.arithmetic.w_4()[gate_idx];
            return Field<CircuitBuilder>{
                result_idx, bb::stdlib::field_t<CircuitBuilder>::from_witness_index(&builder, result_idx)
            };
        }
    }
    std::string error_message = "No gate created by a.add_two(b, c) found between " + std::to_string(a_idx) + " and " +
                                std::to_string(b_idx) + " and " + std::to_string(c_idx);
    throw std::runtime_error(error_message);
}

/**
 * @brief Check if the assert zero gate exists for the field_t
 * @param builder The builder
 * @param field The field_t
 * @return True if the all gates needed for the assert zero check exist, false otherwise
 */
template <typename FF, typename CircuitBuilder>
bool is_assert_zero_gate_exists(CircuitBuilder& builder, const Field<CircuitBuilder>& field)
{
    auto witness_idx = field.witness_index;
    auto witness = field.witness;
    if (witness.is_constant()) {
        return false;
    }
    for (size_t gate_idx = 0; gate_idx < builder.blocks.arithmetic.size(); gate_idx++) {
        bool condition = true;
        condition &= builder.blocks.arithmetic.w_l()[gate_idx] == witness_idx;
        condition &= builder.blocks.arithmetic.w_r()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.w_o()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.w_4()[gate_idx] == builder.zero_idx();
        condition &= builder.blocks.arithmetic.q_m()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_1()[gate_idx] == witness.multiplicative_constant;
        condition &= builder.blocks.arithmetic.q_2()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_3()[gate_idx] == FF::zero();
        condition &= builder.blocks.arithmetic.q_c()[gate_idx] == witness.additive_constant;
        condition &= builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one();
        condition &= builder.blocks.arithmetic.q_4()[gate_idx] == FF::zero();
        if (condition) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Get the result of the conditional assign gate from the circuit
 * @param builder The builder
 * @param predicate_field The predicate field_t
 * @param lhs_field The left field_t
 * @param rhs_field The right field_t
 * @return The resulting (witness_index, witness) of the conditional assign gate
 */
template <typename FF, typename CircuitBuilder>
Field<CircuitBuilder> get_the_result_of_conditional_assign_gate(CircuitBuilder& builder,
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
        lhs_minus_rhs = get_add_gate_output<FF>(builder, lhs_field, minus_rhs);
    }

    return get_madd_gate_output<FF>(builder, lhs_minus_rhs, predicate_field, rhs_field);
}
} // namespace cdg

#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <optional>
namespace cdg {

template <typename FF> struct Point {
    uint32_t x_idx;
    uint32_t y_idx;
    uint32_t is_infinity_idx;
    std::optional<FF> x_value = std::nullopt;
    std::optional<FF> y_value = std::nullopt;
    std::optional<bool> is_infinity_value = std::nullopt;
};

template <typename CircuitBuilder> struct RealPoint {
    Field<CircuitBuilder> x;
    Field<CircuitBuilder> y;
    Bool<CircuitBuilder> is_infinite;
};

/**
 * @brief Get the real point indices (after conditional_assign) from the witness indices. We need this to process
 * to_grumpkin_point, which uses conditional_assign to set the point to the generator if the predicate is false.
 * @param builder The builder
 * @param point The point
 * @param predicate_idx The predicate index
 * @return The real point indices (after conditional_assign)
 */
template <typename FF, typename CircuitBuilder>
RealPoint<CircuitBuilder> get_real_point(CircuitBuilder& builder, const Point<FF>& point, const uint32_t predicate_idx)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    auto real_point = RealPoint<CircuitBuilder>{};
    auto predicate = field_ct::from_witness_index(&builder, predicate_idx);

    auto predicate_field = Field<CircuitBuilder>{ predicate_idx, predicate };
    auto x_field = Field<CircuitBuilder>{};
    if (point.x_idx == bb::stdlib::IS_CONSTANT) {
        auto x_value = point.x_value.value_or(FF::zero());
        x_field = Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(x_value) };
    } else {
        x_field = Field<CircuitBuilder>{ point.x_idx, field_ct::from_witness_index(&builder, point.x_idx) };
    }

    auto y_field = Field<CircuitBuilder>{};
    if (point.y_idx == bb::stdlib::IS_CONSTANT) {
        auto y_value = point.y_value.value_or(FF::zero());
        y_field = Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(y_value) };
    } else {
        y_field = Field<CircuitBuilder>{ point.y_idx, field_ct::from_witness_index(&builder, point.y_idx) };
    }

    auto is_infinity_bool = Bool<CircuitBuilder>{};
    if (point.is_infinity_idx == bb::stdlib::IS_CONSTANT) {
        bool is_infinity = point.is_infinity_value.value_or(false);
        is_infinity_bool = Bool<CircuitBuilder>{ point.is_infinity_idx, bool_ct(is_infinity) };
    } else {
        is_infinity_bool = Bool<CircuitBuilder>{ point.is_infinity_idx,
                                                 bool_ct::from_witness_index_unsafe(&builder, point.is_infinity_idx) };
    }
    if (predicate.is_constant()) {
        return RealPoint<CircuitBuilder>{ x_field, y_field, is_infinity_bool };
    }

    auto predicate_bool = Bool<CircuitBuilder>{};
    if (predicate_idx == bb::stdlib::IS_CONSTANT) {
        predicate_bool = Bool<CircuitBuilder>{ predicate_idx, bool_ct(false) };
    } else {
        predicate_bool =
            Bool<CircuitBuilder>{ predicate_idx, bool_ct::from_witness_index_unsafe(&builder, predicate_idx) };
    }

    auto x_field_real = get_the_result_of_conditional_assign_gate<FF>(
        builder,
        predicate_field,
        x_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(bb::grumpkin::g1::affine_one.x) });
    real_point.x = x_field_real;

    auto y_field_real = get_the_result_of_conditional_assign_gate<FF>(
        builder,
        predicate_field,
        y_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(bb::grumpkin::g1::affine_one.y) });
    real_point.y = y_field_real;

    auto is_infinity_bool_real = get_boolean_conditional_assign_result<FF>(
        builder, predicate_bool, is_infinity_bool, Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, bool_ct(false) });
    real_point.is_infinite = is_infinity_bool_real;
    return real_point;
}

/**
 * @brief Check that all gates needed for the on-curve check exist.
 * @param builder The builder
 * @param point The point
 * @param predicate_idx The predicate index
 * @return True if the all gates needed for the on-curve check exist, false otherwise
 */
template <typename FF, typename CircuitBuilder>
bool is_on_curve_check_exists(CircuitBuilder& builder, const Point<FF>& point, const uint32_t predicate_idx)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    auto real_point = get_real_point<FF>(builder, point, predicate_idx);
    auto x_field = real_point.x;
    auto xx_field = get_mul_gate_output<FF>(builder, x_field, x_field);
    auto xxx_field = get_mul_gate_output<FF>(builder, xx_field, x_field);

    auto minus_xxx_minus_b_field_t = (xxx_field.witness * -FF::one()) - bb::grumpkin::g1::curve_b;
    auto y_field = real_point.y;
    auto minus_xxx_minus_b_field = Field<CircuitBuilder>{ xxx_field.witness_index, minus_xxx_minus_b_field_t };
    auto res_field = get_madd_gate_output<FF>(builder, y_field, y_field, minus_xxx_minus_b_field);

    if (real_point.is_infinite.witness.is_constant()) {
        return is_assert_zero_gate_exists<FF>(builder, res_field);
    }

    auto is_infinity_bool_t = real_point.is_infinite.witness;
    auto not_infinity_bool = !is_infinity_bool_t;
    auto not_infinity_field_t = field_ct(not_infinity_bool);
    auto not_infinity_field = Field<CircuitBuilder>{ real_point.is_infinite.witness_index, not_infinity_field_t };

    auto res_mul_not_infinity = get_mul_gate_output<FF>(builder, res_field, not_infinity_field);

    return is_assert_zero_gate_exists<FF>(builder, res_mul_not_infinity);
}

} // namespace cdg

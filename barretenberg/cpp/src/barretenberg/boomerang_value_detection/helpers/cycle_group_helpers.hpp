#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
namespace cdg {

struct Point {
    uint32_t x_idx;
    uint32_t y_idx;
    uint32_t is_infinity_idx;
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
Point get_real_point(CircuitBuilder& builder, const Point& point, const uint32_t predicate_idx)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    auto real_point = point;
    auto predicate = field_ct::from_witness_index(&builder, predicate_idx);
    if (predicate.is_constant()) {
        return real_point;
    }

    auto predicate_field = Field<CircuitBuilder>{ predicate_idx, predicate };
    auto x_field = Field<CircuitBuilder>{ real_point.x_idx, field_ct::from_witness_index(&builder, real_point.x_idx) };
    auto y_field = Field<CircuitBuilder>{ real_point.y_idx, field_ct::from_witness_index(&builder, real_point.y_idx) };

    auto is_infinity_bool = Bool<CircuitBuilder>{};
    if (real_point.is_infinity_idx == bb::stdlib::IS_CONSTANT) {
        is_infinity_bool = Bool<CircuitBuilder>{ real_point.is_infinity_idx, bool_ct(false) };
    } else {
        is_infinity_bool =
            Bool<CircuitBuilder>{ real_point.is_infinity_idx,
                                  bool_ct::from_witness_index_unsafe(&builder, real_point.is_infinity_idx) };
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
        Field<CircuitBuilder>{ builder.zero_idx(), field_ct(bb::grumpkin::g1::affine_one.x) });
    real_point.x_idx = x_field_real.witness_index;

    auto y_field_real = get_the_result_of_conditional_assign_gate<FF>(
        builder,
        predicate_field,
        y_field,
        Field<CircuitBuilder>{ builder.zero_idx(), field_ct(bb::grumpkin::g1::affine_one.y) });
    real_point.y_idx = y_field_real.witness_index;

    auto is_infinity_bool_real = get_boolean_conditional_assign_result<FF>(
        builder, predicate_bool, is_infinity_bool, Bool<CircuitBuilder>{ builder.zero_idx(), bool_ct(false) });
    real_point.is_infinity_idx = is_infinity_bool_real.witness_index;
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
bool is_on_curve_check_exists(CircuitBuilder& builder, const Point& point, const uint32_t predicate_idx)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    auto real_point = get_real_point<FF>(builder, point, predicate_idx);
    auto x_coord_field_t = field_ct::from_witness_index(&builder, real_point.x_idx);
    auto x_field = Field<CircuitBuilder>{ real_point.x_idx, x_coord_field_t };
    auto xx_field = get_mul_gate_output<FF>(builder, x_field, x_field);
    auto xxx_field = get_mul_gate_output<FF>(builder, xx_field, x_field);

    auto minus_xxx_minus_b_field_t = (xxx_field.witness * -FF::one()) - bb::grumpkin::g1::curve_b;
    auto y_field = Field<CircuitBuilder>{ real_point.y_idx, field_ct::from_witness_index(&builder, real_point.y_idx) };
    auto minus_xxx_minus_b_field = Field<CircuitBuilder>{ xxx_field.witness_index, minus_xxx_minus_b_field_t };
    auto res_field = get_madd_gate_output<FF>(builder, y_field, y_field, minus_xxx_minus_b_field);

    if (real_point.is_infinity_idx == bb::stdlib::IS_CONSTANT) {
        return is_assert_zero_gate_exists<FF>(builder, res_field);
    }

    auto is_infinity_bool = bool_ct::from_witness_index_unsafe(&builder, real_point.is_infinity_idx);
    auto not_infinity_bool = !is_infinity_bool;
    auto not_infinity_field_t = field_ct(not_infinity_bool);
    auto not_infinity_field = Field<CircuitBuilder>{ real_point.is_infinity_idx, not_infinity_field_t };

    auto res_mul_not_infinity = get_mul_gate_output<FF>(builder, res_field, not_infinity_field);

    return is_assert_zero_gate_exists<FF>(builder, res_mul_not_infinity);
}

} // namespace cdg

#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <optional>
namespace cdg {

using namespace acir_format;
template <typename FF> struct Point {
    WitnessOrConstant<FF> x;
    WitnessOrConstant<FF> y;
    WitnessOrConstant<FF> is_infinity;
};

template <typename CircuitBuilder> struct RealPoint {
    Field<CircuitBuilder> x;
    Field<CircuitBuilder> y;
    Bool<CircuitBuilder> is_infinite;
};

template <typename FF> bool is_point_constant(Point<FF> point)
{
    // We skip is_inifity check, because cycle_group constructor
    // enforces is_infinite to be constant, if x and y are constants.
    return point.x.is_constant && point.y.is_constant;
}

/**
 * @brief Get the real point indices (after conditional_assign) from the witness indices. We need this to process
 * to_grumpkin_point, which uses conditional_assign to set the point to the generator if the predicate is false.
 * @param builder The builder
 * @param point The point
 * @param predicate_idx The predicate index
 * @return The real point indices (after conditional_assign)
 */
template <typename FF, typename CircuitBuilder>
RealPoint<CircuitBuilder> get_real_point(CircuitBuilder& builder,
                                         const Point<FF>& point,
                                         const acir_format::WitnessOrConstant<FF> predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    auto real_point = RealPoint<CircuitBuilder>{};

    auto x_field = witness_or_constant_to_field<FF>(point.x, builder);
    auto y_field = witness_or_constant_to_field<FF>(point.y, builder);
    auto is_infinity_bool = witness_or_constant_to_bool<FF>(point.is_infinity, builder);
    auto predicate_field = witness_or_constant_to_field<FF>(predicate, builder);
    auto predicate_bool = witness_or_constant_to_bool<FF>(predicate, builder);

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

    // Mirror cycle_group constructor behavior: if only one coordinate is constant, it is converted to a fixed witness.
    if (real_point.x.witness.is_constant() != real_point.y.witness.is_constant()) {
        if (real_point.x.witness.is_constant()) {
            real_point.x = find_fixed_witness_field<FF>(builder, real_point.x.witness.get_value());
        } else {
            real_point.y = find_fixed_witness_field<FF>(builder, real_point.y.witness.get_value());
        }
    }

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
bool is_on_curve_check_exists(CircuitBuilder& builder,
                              const Point<FF>& point,
                              const acir_format::WitnessOrConstant<FF> predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    auto real_point = get_real_point<FF>(builder, point, predicate);

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

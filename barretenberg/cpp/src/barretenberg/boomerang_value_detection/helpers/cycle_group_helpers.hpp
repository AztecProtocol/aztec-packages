/**
 * @file cycle_group_helpers.hpp
 * @brief Helper functions for cycle_group
 * @details This file contains helper functions for cycle_group, which is a primitive type in the circuit builder.
 * Every helper mirrors a specific stdlib operation (e.g. is_on_curve_check_exists mirrors cycle_group::is_on_curve).
 */
#pragma once

#include "barretenberg/boomerang_value_detection/helpers/bool_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <optional>
namespace cdg {

using namespace acir_format;

/**
 * @brief holds raw ACIR witness-or-constant indices
 */
template <typename FF> struct Point {
    WitnessOrConstant<FF> x;
    WitnessOrConstant<FF> y;
    WitnessOrConstant<FF> is_infinity;
};

/**
 * @brief holds the actual Field/Bool values after to_grumpkin_point processing
 */
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
 * @details mirrors cycle_group::to_grumpkin_point
 * @param analyzer The analyzer
 * @param builder The builder
 * @param point The point
 * @param predicate_idx The predicate index
 * @return The real point indices (after conditional_assign)
 */
template <typename FF, typename CircuitBuilder>
std::optional<RealPoint<CircuitBuilder>> get_real_point(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                        CircuitBuilder& builder,
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
        analyzer,
        builder,
        predicate_field,
        x_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(bb::grumpkin::g1::affine_one.x) });
    if (!x_field_real.has_value()) {
        log_error("X field real is not valid");
        return std::nullopt;
    }
    real_point.x = x_field_real.value();

    auto y_field_real = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        predicate_field,
        y_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(bb::grumpkin::g1::affine_one.y) });
    if (!y_field_real.has_value()) {
        log_error("Y field real is not valid");
        return std::nullopt;
    }
    real_point.y = y_field_real.value();

    // Mirror cycle_group constructor behavior: if only one coordinate is constant, it is converted to a fixed
    // witness.
    if (real_point.x.witness.is_constant() != real_point.y.witness.is_constant()) {
        if (real_point.x.witness.is_constant()) {
            auto real_point_x = find_fixed_witness_field<FF>(analyzer, builder, real_point.x.witness.get_value());
            if (!real_point_x.has_value()) {
                log_error("X field real is not valid");
                return std::nullopt;
            }
            real_point.x = real_point_x.value();
        } else {
            auto real_point_y = find_fixed_witness_field<FF>(analyzer, builder, real_point.y.witness.get_value());
            if (!real_point_y.has_value()) {
                log_error("Y field real is not valid");
                return std::nullopt;
            }
            real_point.y = real_point_y.value();
        }
    }

    auto is_infinity_bool_real =
        get_boolean_conditional_assign_result<FF>(analyzer,
                                                  builder,
                                                  predicate_bool,
                                                  is_infinity_bool,
                                                  Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, bool_ct(false) });
    if (!is_infinity_bool_real.has_value()) {
        log_error("Is infinity bool real is not valid");
        return std::nullopt;
    }
    real_point.is_infinite = is_infinity_bool_real.value();
    return real_point;
}

/**
 * @brief Check that all gates needed for the on-curve check exist.
 * @details mirrors cycle_group::validate_on_curve
 * @param analyzer The analyzer
 * @param builder The builder
 * @param point The point
 * @param predicate_idx The predicate index
 * @return True if the all gates needed for the on-curve check exist, false otherwise
 */
template <typename FF, typename CircuitBuilder>
bool is_on_curve_check_exists(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                              CircuitBuilder& builder,
                              const Point<FF>& point,
                              const acir_format::WitnessOrConstant<FF> predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    if (is_point_constant(point)) {
        // Constant points are always on curve
        return true;
    }
    auto real_point_optional = get_real_point<FF>(analyzer, builder, point, predicate);

    if (!real_point_optional.has_value()) {
        log_error("Real point is not valid");
        return false;
    }
    auto real_point = real_point_optional.value();

    auto x_field = real_point.x;
    auto xx_field = get_mul_gate_output<FF>(analyzer, builder, x_field, x_field);
    if (!xx_field.has_value()) {
        log_error("XX field is not valid");
        return false;
    }
    auto xxx_field_optional = get_mul_gate_output<FF>(analyzer, builder, *xx_field, x_field);
    if (!xxx_field_optional.has_value()) {
        log_error("XXX field is not valid");
        return false;
    }
    auto xxx_field = xxx_field_optional.value();
    auto minus_xxx_minus_b_field_t = (xxx_field.witness * -FF::one()) - bb::grumpkin::g1::curve_b;

    auto y_field = real_point.y;
    auto minus_xxx_minus_b_field = Field<CircuitBuilder>{ xxx_field.witness_index, minus_xxx_minus_b_field_t };
    auto res_field = get_madd_gate_output<FF>(analyzer, builder, y_field, y_field, minus_xxx_minus_b_field);
    if (!res_field.has_value()) {
        log_error("Res field is not valid");
        return false;
    }

    if (real_point.is_infinite.witness.is_constant()) {
        return is_assert_zero_gate_exists<FF>(analyzer, builder, *res_field);
    }

    auto is_infinity_bool_t = real_point.is_infinite.witness;
    auto not_infinity_bool = !is_infinity_bool_t;
    auto not_infinity_field_t = field_ct(not_infinity_bool);
    auto not_infinity_field = Field<CircuitBuilder>{ real_point.is_infinite.witness_index, not_infinity_field_t };

    auto res_mul_not_infinity = get_mul_gate_output<FF>(analyzer, builder, *res_field, not_infinity_field);
    if (!res_mul_not_infinity.has_value()) {
        log_error("Res mul not infinity field is not valid");
        return false;
    }

    return is_assert_zero_gate_exists<FF>(analyzer, builder, *res_mul_not_infinity);
}

/**
 * @brief Find the result of an ECC doubling gate from the elliptic block
 * @details Searches the elliptic block for a gate where w_r=x1_idx, w_o=modified_y_idx, q_m=1 (is_double).
 *          Returns x3, y3 from the next gate's w_r and w_o.
 * @details mirrors cycle_group::dbl
 * @param builder The builder
 * @param x1_field The x coordinate of the point to double
 * @param modified_y_field The modified y coordinate (conditional_assign(is_infinity, 1, y))
 * @return RealPoint with x3, y3 from the doubling, or nullopt if not found
 */
template <typename FF, typename CircuitBuilder>
std::optional<std::pair<Field<CircuitBuilder>, Field<CircuitBuilder>>> get_dbl_gate_result(
    StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    CircuitBuilder& builder,
    const Field<CircuitBuilder>& x1_field,
    const Field<CircuitBuilder>& modified_y_field)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    auto x1_idx = x1_field.witness_index;
    auto y1_idx = modified_y_field.witness_index;

    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_r(x1_idx)
                             .set_w_o(y1_idx)
                             .set_q_1(FF::zero())
                             .set_q_2(FF::zero())
                             .set_q_3(FF::zero())
                             .set_q_4(FF::zero())
                             .set_q_c(FF::zero())
                             .set_q_m(FF::one())
                             .set_q_elliptic(FF::one());

    auto gates = analyzer.get_variable_gates(x1_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("No ECC dbl gate found for x1=", x1_idx, " y1=", y1_idx);
        return std::nullopt;
    }

    auto gate_idx = filtered_gates[0].second;
    auto x3_idx = builder.blocks.elliptic.w_r()[gate_idx + 1];
    auto y3_idx = builder.blocks.elliptic.w_o()[gate_idx + 1];
    auto x3 = Field<CircuitBuilder>{ x3_idx, field_ct::from_witness_index(&builder, x3_idx) };
    auto y3 = Field<CircuitBuilder>{ y3_idx, field_ct::from_witness_index(&builder, y3_idx) };
    return std::make_pair(x3, y3);
}

/**
 * @brief Check that the result point is constrained to be input1 + input2
 * @details Traces through cycle_group::operator+ step by step, then verifies
 *          the conditional_assign and assert_equal chain connecting the computation
 *          result to the ACIR output witnesses.
 * @details mirrors cycle_group::operator+
 * @param analyzer The analyzer
 * @param builder The builder
 * @param input1 Point for input1 (after to_grumpkin_point processing)
 * @param input2 Point for input2 (after to_grumpkin_point processing)
 * @param result_x_idx ACIR output witness index for result x
 * @param result_y_idx ACIR output witness index for result y
 * @param result_inf_idx ACIR output witness index for result is_infinite
 * @param predicate The predicate as a WitnessOrConstant
 * @return True if the addition constraint chain is valid
 */
template <typename FF, typename CircuitBuilder>
bool is_ec_add_result_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                  CircuitBuilder& builder,
                                  const Point<FF>& input1,
                                  const Point<FF>& input2,
                                  uint32_t result_x_idx,
                                  uint32_t result_y_idx,
                                  uint32_t result_inf_idx,
                                  const acir_format::WitnessOrConstant<FF>& predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    // If both points are constant, operator+ is computed natively without gates
    if (is_point_constant(input1) && is_point_constant(input2)) {
        return true;
    }

    auto predicate_field = witness_or_constant_to_field<FF>(predicate, builder);
    auto predicate_bool = witness_or_constant_to_bool<FF>(predicate, builder);

    auto real_input1 = get_real_point<FF>(analyzer, builder, input1, predicate);
    auto real_input2 = get_real_point<FF>(analyzer, builder, input2, predicate);
    if (!real_input1.has_value() || !real_input2.has_value()) {
        return false;
    }

    auto x1 = (*real_input1).x;
    auto y1 = (*real_input1).y;
    auto inf1 = (*real_input1).is_infinite;
    auto x2 = (*real_input2).x;
    auto y2 = (*real_input2).y;
    auto inf2 = (*real_input2).is_infinite;

    // If both points are constant, operator+ is computed natively without gates
    if (x1.witness.is_constant() && y1.witness.is_constant() && x2.witness.is_constant() && y2.witness.is_constant()) {
        return true;
    }

    // Step 1: x_coordinates_match = (x1 == x2)
    auto x_coord_match = get_equality_result<FF>(analyzer, builder, x1, x2);
    if (!x_coord_match.has_value()) {
        log_error("Failed to find x_coordinates_match");
        return false;
    }

    // Step 2: y_coordinates_match = (y1 == y2)
    auto y_coord_match = get_equality_result<FF>(analyzer, builder, y1, y2);
    if (!y_coord_match.has_value()) {
        log_error("Failed to find y_coordinates_match");
        return false;
    }

    // Step 3: x_diff = x2.add_two(-x1, x_coordinates_match)
    auto neg_x1 = Field<CircuitBuilder>{ x1.witness_index, -x1.witness };
    auto x_coord_match_field = Field<CircuitBuilder>{ x_coord_match->witness_index, field_ct(x_coord_match->witness) };
    auto x_diff = get_add_two_gate_output<FF>(analyzer, builder, x2, neg_x1, x_coord_match_field);
    if (!x_diff.has_value()) {
        log_error("Failed to find x_diff");
        return false;
    }

    // Step 4: lambda via evaluate_polynomial_identity(x_diff, lambda, -y2, y1)
    auto neg_y2 = Field<CircuitBuilder>{ y2.witness_index, -y2.witness };
    auto lambda = get_evaluate_polynomial_identity_b<FF>(analyzer, builder, *x_diff, neg_y2, y1);
    if (!lambda.has_value()) {
        log_error("Failed to find lambda");
        return false;
    }

    // Step 5: add_result_x = lambda.madd(lambda, -(x2 + x1))
    // When one coordinate is constant, the sum's witness_index should be the non-constant one's
    uint32_t x_sum_idx = x2.witness.is_constant() ? x1.witness_index : x2.witness_index;
    auto x2_plus_x1_field = Field<CircuitBuilder>{ x_sum_idx, x2.witness + x1.witness };
    // If both non-constant different witnesses, x2+x1 creates an add_gate
    if (!x1.witness.is_constant() && !x2.witness.is_constant() && x1.witness_index != x2.witness_index) {
        auto x2_plus_x1 = get_add_gate_output<FF>(analyzer, builder, x2, x1);
        if (!x2_plus_x1.has_value()) {
            log_error("Failed to find x2+x1");
            return false;
        }
        x2_plus_x1_field = *x2_plus_x1;
    }
    auto neg_x2_plus_x1 = Field<CircuitBuilder>{ x2_plus_x1_field.witness_index, -x2_plus_x1_field.witness };
    auto add_result_x = get_madd_gate_output<FF>(analyzer, builder, *lambda, *lambda, neg_x2_plus_x1);
    if (!add_result_x.has_value()) {
        log_error("Failed to find add_result_x");
        return false;
    }

    // Step 6: add_result_y = lambda.madd(x1 - add_result_x, -y1)
    auto neg_add_result_x = Field<CircuitBuilder>{ add_result_x->witness_index, -add_result_x->witness };
    // When x1 is constant, the difference's witness_index should be add_result_x's
    uint32_t x_diff_idx = x1.witness.is_constant() ? add_result_x->witness_index : x1.witness_index;
    auto x1_minus_add_x = Field<CircuitBuilder>{ x_diff_idx, x1.witness - add_result_x->witness };
    // x1 - add_result_x: if both non-constant different witnesses, creates add_gate
    if (!x1.witness.is_constant() && !add_result_x->witness.is_constant() &&
        x1.witness_index != add_result_x->witness_index) {
        auto x1_minus_add_x_opt = get_add_gate_output<FF>(analyzer, builder, x1, neg_add_result_x);
        if (!x1_minus_add_x_opt.has_value()) {
            log_error("Failed to find x1 - add_result_x");
            return false;
        }
        x1_minus_add_x = *x1_minus_add_x_opt;
    }
    auto neg_y1 = Field<CircuitBuilder>{ y1.witness_index, -y1.witness };
    auto add_result_y = get_madd_gate_output<FF>(analyzer, builder, *lambda, x1_minus_add_x, neg_y1);
    if (!add_result_y.has_value()) {
        log_error("Failed to find add_result_y");
        return false;
    }

    // Step 7: dbl() - modified_y = conditional_assign(is_infinity, 1, _y)
    auto inf1_field = Field<CircuitBuilder>{ inf1.witness_index, field_ct(inf1.witness) };
    Field<CircuitBuilder> modified_y;
    if (inf1.witness.is_constant()) {
        // If is_infinity is constant, conditional_assign doesn't create a gate
        modified_y =
            inf1.witness.get_value() ? Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::one()) } : y1;
    } else {
        auto modified_y_opt = get_the_result_of_conditional_assign_gate<FF>(
            analyzer, builder, inf1_field, Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::one()) }, y1);
        if (!modified_y_opt.has_value()) {
            log_error("Failed to find modified_y for dbl");
            return false;
        }
        modified_y = *modified_y_opt;
    }

    // Step 7b: find dbl gate result
    // When the point is constant, dbl() computes natively without creating a gate
    Field<CircuitBuilder> dbl_x, dbl_y;
    if (x1.witness.is_constant() && modified_y.witness.is_constant()) {
        FF x1_val = x1.witness.get_value();
        FF y1_val = modified_y.witness.get_value();
        // y1_val is guaranteed to be non-zero by step 7
        FF lambda_dbl = (x1_val * x1_val * 3) / (y1_val + y1_val);
        FF x3_dbl = lambda_dbl * lambda_dbl - x1_val - x1_val;
        FF y3_dbl = lambda_dbl * (x1_val - x3_dbl) - y1_val;
        dbl_x = Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(x3_dbl) };
        dbl_y = Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(y3_dbl) };
    } else {
        auto dbl_result = get_dbl_gate_result<FF>(analyzer, builder, x1, modified_y);
        if (!dbl_result.has_value()) {
            log_error("Failed to find dbl gate");
            return false;
        }
        dbl_x = dbl_result->first;
        dbl_y = dbl_result->second;
    }

    // Step 8: double_predicate = x_coordinates_match && y_coordinates_match
    auto double_predicate = get_and_result<FF>(analyzer, builder, *x_coord_match, *y_coord_match);
    if (!double_predicate.has_value()) {
        log_error("Failed to find double_predicate");
        return false;
    }

    // Step 9-10: result_x/y = conditional_assign(double_predicate, dbl_x/y, add_result_x/y)
    auto double_pred_field =
        Field<CircuitBuilder>{ double_predicate->witness_index, field_ct(double_predicate->witness) };
    auto result_x_after_dbl =
        get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, double_pred_field, dbl_x, *add_result_x);
    if (!result_x_after_dbl.has_value()) {
        log_error("Failed to find result_x after dbl conditional_assign");
        return false;
    }
    auto result_y_after_dbl =
        get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, double_pred_field, dbl_y, *add_result_y);
    if (!result_y_after_dbl.has_value()) {
        log_error("Failed to find result_y after dbl conditional_assign");
        return false;
    }

    // Step 11-12: lhs infinity: result = conditional_assign(lhs_infinity, other_x/y, result_x/y)
    Field<CircuitBuilder> result_x_after_lhs_inf, result_y_after_lhs_inf;
    if (inf1.witness.is_constant()) {
        if (inf1.witness.get_value()) {
            result_x_after_lhs_inf = x2;
            result_y_after_lhs_inf = y2;
        } else {
            result_x_after_lhs_inf = *result_x_after_dbl;
            result_y_after_lhs_inf = *result_y_after_dbl;
        }
    } else {
        auto rx = get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, inf1_field, x2, *result_x_after_dbl);
        if (!rx.has_value()) {
            log_error("Failed to find result_x after lhs_infinity conditional_assign");
            return false;
        }
        result_x_after_lhs_inf = *rx;
        auto ry = get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, inf1_field, y2, *result_y_after_dbl);
        if (!ry.has_value()) {
            log_error("Failed to find result_y after lhs_infinity conditional_assign");
            return false;
        }
        result_y_after_lhs_inf = *ry;
    }

    // Step 13-14: rhs infinity: result = conditional_assign(rhs_infinity, x1/y1, result_x/y)
    auto inf2_field = Field<CircuitBuilder>{ inf2.witness_index, field_ct(inf2.witness) };
    Field<CircuitBuilder> result_x_after_rhs_inf, result_y_after_rhs_inf;
    if (inf2.witness.is_constant()) {
        if (inf2.witness.get_value()) {
            result_x_after_rhs_inf = x1;
            result_y_after_rhs_inf = y1;
        } else {
            result_x_after_rhs_inf = result_x_after_lhs_inf;
            result_y_after_rhs_inf = result_y_after_lhs_inf;
        }
    } else {
        auto rx =
            get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, inf2_field, x1, result_x_after_lhs_inf);
        if (!rx.has_value()) {
            log_error("Failed to find result_x after rhs_infinity conditional_assign");
            return false;
        }
        result_x_after_rhs_inf = *rx;
        auto ry =
            get_the_result_of_conditional_assign_gate<FF>(analyzer, builder, inf2_field, y1, result_y_after_lhs_inf);
        if (!ry.has_value()) {
            log_error("Failed to find result_y after rhs_infinity conditional_assign");
            return false;
        }
        result_y_after_rhs_inf = *ry;
    }

    // Step 15-17: result_is_infinity computation
    // infinity_predicate = x_coordinates_match && !y_coordinates_match
    auto not_y_coord_match = Bool<CircuitBuilder>{ y_coord_match->witness_index, !y_coord_match->witness };
    auto infinity_predicate = get_and_result<FF>(analyzer, builder, *x_coord_match, not_y_coord_match);
    if (!infinity_predicate.has_value()) {
        log_error("Failed to find infinity_predicate");
        return false;
    }

    // not_lhs_infinity = !lhs_infinity
    Bool<CircuitBuilder> not_lhs_inf, not_rhs_inf;
    if (inf1.witness.is_constant()) {
        not_lhs_inf = Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, !inf1.witness };
    } else {
        not_lhs_inf = Bool<CircuitBuilder>{ inf1.witness_index, !inf1.witness };
    }
    if (inf2.witness.is_constant()) {
        not_rhs_inf = Bool<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, !inf2.witness };
    } else {
        not_rhs_inf = Bool<CircuitBuilder>{ inf2.witness_index, !inf2.witness };
    }

    // not_lhs_and_not_rhs = !lhs_infinity && !rhs_infinity
    auto not_lhs_and_not_rhs = get_and_result<FF>(analyzer, builder, not_lhs_inf, not_rhs_inf);
    if (!not_lhs_and_not_rhs.has_value()) {
        log_error("Failed to find not_lhs_and_not_rhs");
        return false;
    }

    // result_is_infinity_part1 = infinity_predicate && not_lhs_and_not_rhs
    auto result_is_inf_part1 = get_and_result<FF>(analyzer, builder, *infinity_predicate, *not_lhs_and_not_rhs);
    if (!result_is_inf_part1.has_value()) {
        log_error("Failed to find result_is_infinity_part1");
        return false;
    }

    // lhs_and_rhs_inf = lhs_infinity && rhs_infinity
    auto lhs_and_rhs_inf = get_and_result<FF>(analyzer, builder, inf1, inf2);
    if (!lhs_and_rhs_inf.has_value()) {
        log_error("Failed to find lhs_and_rhs_inf");
        return false;
    }

    // result_is_infinity = result_is_inf_part1 || lhs_and_rhs_inf
    auto result_is_infinity = get_or_result<FF>(analyzer, builder, *result_is_inf_part1, *lhs_and_rhs_inf);
    if (!result_is_infinity.has_value()) {
        log_error("Failed to find result_is_infinity");
        return false;
    }

    // The cycle_group constructor for the operator+ result doesn't assert on curve,
    // so the result is: cycle_group(result_x_after_rhs_inf, result_y_after_rhs_inf, result_is_infinity)

    // Step 18-20: to_be_asserted_equal = conditional_assign(predicate, input_result, result)
    auto input_result_x = Field<CircuitBuilder>{ result_x_idx, field_ct::from_witness_index(&builder, result_x_idx) };
    auto input_result_y = Field<CircuitBuilder>{ result_y_idx, field_ct::from_witness_index(&builder, result_y_idx) };
    auto input_result_inf =
        Bool<CircuitBuilder>{ result_inf_idx, bool_ct::from_witness_index_unsafe(&builder, result_inf_idx) };

    auto tba_x = get_the_result_of_conditional_assign_gate<FF>(
        analyzer, builder, predicate_field, input_result_x, result_x_after_rhs_inf);
    if (!tba_x.has_value()) {
        log_error("Failed to find to_be_asserted_equal x");
        return false;
    }
    auto tba_y = get_the_result_of_conditional_assign_gate<FF>(
        analyzer, builder, predicate_field, input_result_y, result_y_after_rhs_inf);
    if (!tba_y.has_value()) {
        log_error("Failed to find to_be_asserted_equal y");
        return false;
    }
    auto tba_inf = get_boolean_conditional_assign_result<FF>(
        analyzer, builder, predicate_bool, input_result_inf, *result_is_infinity);
    if (!tba_inf.has_value()) {
        log_error("Failed to find to_be_asserted_equal is_infinity");
        return false;
    }

    // Step 21-22: result.standardize() -> conditional_assign(result_is_infinity, 0, x/y)
    auto result_is_inf_field =
        Field<CircuitBuilder>{ result_is_infinity->witness_index, field_ct(result_is_infinity->witness) };
    auto std_result_x = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        result_is_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        result_x_after_rhs_inf);
    if (!std_result_x.has_value()) {
        log_error("Failed to find standardized result x");
        return false;
    }
    auto std_result_y = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        result_is_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        result_y_after_rhs_inf);
    if (!std_result_y.has_value()) {
        log_error("Failed to find standardized result y");
        return false;
    }

    // Step 23-24: to_be_asserted_equal.standardize() -> conditional_assign(tba_inf, 0, tba_x/y)
    auto tba_inf_field = Field<CircuitBuilder>{ tba_inf->witness_index, field_ct(tba_inf->witness) };
    auto std_tba_x = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        tba_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        *tba_x);
    if (!std_tba_x.has_value()) {
        log_error("Failed to find standardized to_be_asserted_equal x");
        return false;
    }
    auto std_tba_y = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        tba_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        *tba_y);
    if (!std_tba_y.has_value()) {
        log_error("Failed to find standardized to_be_asserted_equal y");
        return false;
    }

    // Step 25-27: assert_equal checks
    bool x_equal = is_assert_equal_exists<FF>(analyzer, builder, *std_result_x, *std_tba_x);
    if (!x_equal) {
        log_error("assert_equal not found for x coordinates");
        return false;
    }

    bool y_equal = is_assert_equal_exists<FF>(analyzer, builder, *std_result_y, *std_tba_y);
    if (!y_equal) {
        log_error("assert_equal not found for y coordinates");
        return false;
    }

    // For bool_t::assert_equal (is_infinity), check copy constraint via normalization
    // bool_t::assert_equal normalizes both and then calls builder.assert_equal
    auto norm_result_inf = get_normalization_result<FF>(analyzer, builder, *result_is_infinity);
    if (!norm_result_inf.has_value()) {
        log_error("Failed to find normalization result for is_infinity");
        return false;
    }
    auto norm_tba_inf = get_normalization_result<FF>(analyzer, builder, *tba_inf);
    if (!norm_tba_inf.has_value()) {
        log_error("Failed to find normalization result for is_infinity");
        return false;
    }
    if (analyzer.to_real(norm_result_inf->witness_index) != analyzer.to_real(norm_tba_inf->witness_index)) {
        log_error("assert_equal not found for is_infinity");
        return false;
    }

    return true;
}

/**
 * @brief Find the standardize gate result for a coordinate, discovering is_infinity
 * @details mirrors cycle_group::standardize():
 *            _x = field_t::conditional_assign(_is_infinity, 0, _x)
 *
 *          conditional_assign(is_infinity, 0, coord) computes (0 - coord).madd(is_infinity, coord).
 *          Since 0 is constant, the subtract folds into the diff's scaling (diff = -coord, same witness_index).
 *          The resulting madd gate has a unique pattern: w_l = coord_idx AND w_o = coord_idx (same wire!),
 *          because diff and rhs share the same underlying witness.
 *
 *          Gate selectors depend on whether is_infinity is inverted:
 *            Non-inverted: q_m=-1, q_1=0
 *            Inverted:     q_m=1,  q_1=-1
 *          Common:         q_2=0, q_3=1, q_4=-1, q_c=0, q_arith=1
 *
 *          We search with the common selectors + w_l=w_o=coord_idx, then determine inversion from q_m.
 *          The is_infinity Bool is extracted from w_r, and the standardized coordinate from w_4.
 *
 * @param analyzer The analyzer
 * @param builder The builder
 * @param coord_field The coordinate to find standardize for (must be non-constant)
 * @return Pair of (is_infinity Bool, standardized coordinate Field), or nullopt if not found
 */
template <typename FF, typename CircuitBuilder>
std::optional<std::pair<Bool<CircuitBuilder>, Field<CircuitBuilder>>> find_standardize_result(
    StaticAnalyzer_<FF, CircuitBuilder>& analyzer, CircuitBuilder& builder, const Field<CircuitBuilder>& coord_field)
{
    if (coord_field.witness.is_constant()) {
        log_error("find_standardize_result: coord is constant, no standardize gate expected");
        return std::nullopt;
    }

    auto coord_idx = coord_field.witness_index;

    // Search for madd gate where w_l = w_o = coord_idx (unique standardize pattern)
    // Leave q_m and q_1 unset — they depend on is_infinity inversion and we determine that after
    auto filter = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                      .set_w_l(coord_idx)
                      .set_w_o(coord_idx)
                      .set_q_2(FF::zero())
                      .set_q_3(FF::one())
                      .set_q_4(FF::neg_one())
                      .set_q_c(FF::zero())
                      .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(coord_idx);
    auto filtered_gates = filter.filter_gates(gates);
    if (filtered_gates.empty()) {
        log_error("find_standardize_result: no standardize gate found for coord=", coord_idx);
        return std::nullopt;
    }

    auto [blk, gate] = filtered_gates[0];
    auto& block = builder.blocks.get()[blk];

    // Determine is_infinity inversion from q_m: q_m=-1 → non-inverted, q_m=1 → inverted
    bool inverted = (block.q_m()[gate] == FF::one());

    auto is_inf_idx = block.w_r()[gate];
    auto is_inf_bool = bb::stdlib::bool_t<CircuitBuilder>::from_witness_index_unsafe(&builder, is_inf_idx);
    if (inverted) {
        is_inf_bool = !is_inf_bool;
    }
    auto is_infinity = Bool<CircuitBuilder>{ is_inf_idx, is_inf_bool };

    auto std_coord = get_field_from_w_4<FF>(builder, filtered_gates[0]);

    return std::make_pair(is_infinity, std_coord);
}

/**
 * @brief Verify that cycle_group::assert_equal gates exist between two cycle_groups
 * @details mirrors cycle_group::assert_equal:
 *            this->standardize();
 *            other.standardize();
 *            _x.assert_equal(other._x);
 *            _y.assert_equal(other._y);
 *            _is_infinity.assert_equal(other._is_infinity);
 *
 *          This helper is designed for the case where is_infinity is unknown for both groups
 *          (e.g. MSM, where the batch_mul result and conditional_assign output have unknown
 *          is_infinity). It discovers is_infinity from the standardize gate pattern on the
 *          x-coordinate (find_standardize_result), then verifies y standardize with the
 *          known is_infinity, and finally checks assert_equal for x, y, and is_infinity.
 *
 * @param analyzer The analyzer
 * @param builder The builder
 * @param lhs_x The x coordinate of the first cycle_group (before standardize)
 * @param lhs_y The y coordinate of the first cycle_group (before standardize)
 * @param rhs_x The x coordinate of the second cycle_group (before standardize)
 * @param rhs_y The y coordinate of the second cycle_group (before standardize)
 * @return True if all standardize + assert_equal gates exist
 */
template <typename FF, typename CircuitBuilder>
bool is_cycle_group_assert_equal_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                             CircuitBuilder& builder,
                                             const Field<CircuitBuilder>& lhs_x,
                                             const Field<CircuitBuilder>& lhs_y,
                                             const Field<CircuitBuilder>& rhs_x,
                                             const Field<CircuitBuilder>& rhs_y)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    // --- Standardize lhs: discover is_infinity from x coordinate ---
    auto lhs_std = find_standardize_result<FF>(analyzer, builder, lhs_x);
    if (!lhs_std.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: lhs x standardize not found");
        return false;
    }
    auto [lhs_inf, std_lhs_x] = *lhs_std;

    // Verify lhs y standardize uses the same is_infinity
    auto lhs_inf_field = Field<CircuitBuilder>{ lhs_inf.witness_index, field_ct(lhs_inf.witness) };
    auto std_lhs_y = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        lhs_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        lhs_y);
    if (!std_lhs_y.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: lhs y standardize not found");
        return false;
    }

    // --- Standardize rhs: discover is_infinity from x coordinate ---
    auto rhs_std = find_standardize_result<FF>(analyzer, builder, rhs_x);
    if (!rhs_std.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: rhs x standardize not found");
        return false;
    }
    auto [rhs_inf, std_rhs_x] = *rhs_std;

    // Verify rhs y standardize uses the same is_infinity
    auto rhs_inf_field = Field<CircuitBuilder>{ rhs_inf.witness_index, field_ct(rhs_inf.witness) };
    auto std_rhs_y = get_the_result_of_conditional_assign_gate<FF>(
        analyzer,
        builder,
        rhs_inf_field,
        Field<CircuitBuilder>{ bb::stdlib::IS_CONSTANT, field_ct(FF::zero()) },
        rhs_y);
    if (!std_rhs_y.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: rhs y standardize not found");
        return false;
    }

    // --- Verify field_t::assert_equal for x and y ---
    if (!is_assert_equal_exists<FF>(analyzer, builder, std_lhs_x, std_rhs_x)) {
        log_error("is_cycle_group_assert_equal_constrained: assert_equal not found for x");
        return false;
    }
    if (!is_assert_equal_exists<FF>(analyzer, builder, *std_lhs_y, *std_rhs_y)) {
        log_error("is_cycle_group_assert_equal_constrained: assert_equal not found for y");
        return false;
    }

    // --- Verify bool_t::assert_equal for is_infinity ---
    // bool_t::assert_equal normalizes both bools and then calls builder.assert_equal (copy constraint)
    auto norm_lhs_inf = get_normalization_result<FF>(analyzer, builder, lhs_inf);
    if (!norm_lhs_inf.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: lhs is_infinity normalization not found");
        return false;
    }
    auto norm_rhs_inf = get_normalization_result<FF>(analyzer, builder, rhs_inf);
    if (!norm_rhs_inf.has_value()) {
        log_error("is_cycle_group_assert_equal_constrained: rhs is_infinity normalization not found");
        return false;
    }
    if (analyzer.to_real(norm_lhs_inf->witness_index) != analyzer.to_real(norm_rhs_inf->witness_index)) {
        log_error("is_cycle_group_assert_equal_constrained: assert_equal not found for is_infinity");
        return false;
    }

    return true;
}

/**
 * @brief Check that the MSM result point is connected to batch_mul output via conditional_assign + assert_equal
 * @details mirrors the end of create_multi_scalar_mul_constraint:
 *            result = batch_mul(points, scalars)
 *            tba = conditional_assign(predicate, input_result, result)
 *            result.assert_equal(tba)
 *
 * Tracing batch_mul internals is impractical (complex multi-point multiplication), so the
 * batch_mul result (rhs of the conditional_assign) is unknown. We use
 * find_conditional_assign_rhs_and_result to discover the unknown rhs from the subtract gate
 * pattern, using only the known lhs (ACIR output).
 *
 * Checks:
 *   1. For x, y: find_conditional_assign_rhs_and_result(predicate, input_result_x/y) succeeds,
 *      yielding the batch_mul result (rhs) and conditional_assign output (tba)
 *   2. For is_infinity: the AND gate (predicate && input_result_inf) exists, which is part of
 *      bool_t::conditional_assign((predicate && lhs) || (!predicate && rhs))
 *   3. assert_equal between result and tba via is_cycle_group_assert_equal_constrained
 *
 * @param analyzer The analyzer
 * @param builder The builder
 * @param output_point The ACIR output point (out_point_x, out_point_y, out_point_is_infinite)
 * @param predicate The predicate
 * @return True if conditional_assign and assert_equal gates exist for all three components
 */
template <typename FF, typename CircuitBuilder>
bool is_msm_result_constrained(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                               CircuitBuilder& builder,
                               const Point<FF>& output_point,
                               const WitnessOrConstant<FF>& predicate)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;
    using bool_ct = bb::stdlib::bool_t<CircuitBuilder>;

    auto predicate_field = witness_or_constant_to_field<FF>(predicate, builder);

    // If predicate is constant, conditional_assign doesn't create gates
    if (predicate_field.witness.is_constant()) {
        return true;
    }

    // input_result is constructed via field_ct::from_witness_index (mul=1, add=0)
    auto input_result_x =
        Field<CircuitBuilder>{ output_point.x.index, field_ct::from_witness_index(&builder, output_point.x.index) };
    auto input_result_y =
        Field<CircuitBuilder>{ output_point.y.index, field_ct::from_witness_index(&builder, output_point.y.index) };

    // --- Verify x conditional_assign, discovering batch_mul result (rhs) ---
    auto x_result = find_conditional_assign_rhs_and_result<FF>(analyzer, builder, predicate_field, input_result_x);
    if (!x_result.has_value()) {
        log_error("is_msm_result_constrained: conditional_assign not found for x");
        return false;
    }
    auto [batch_mul_x, tba_x] = *x_result;

    // --- Verify y conditional_assign, discovering batch_mul result (rhs) ---
    auto y_result = find_conditional_assign_rhs_and_result<FF>(analyzer, builder, predicate_field, input_result_y);
    if (!y_result.has_value()) {
        log_error("is_msm_result_constrained: conditional_assign not found for y");
        return false;
    }
    auto [batch_mul_y, tba_y] = *y_result;

    // --- Verify is_infinity is constrained ---
    // bool_t::conditional_assign creates: ((predicate && input_inf) || (!predicate && batch_mul_inf)).normalize()
    // The batch_mul_inf (rhs) is unknown. We verify the first AND gate (predicate && input_inf) exists,
    // proving out_point_is_infinite is connected to the predicate in the constraint system.
    auto predicate_bool = witness_or_constant_to_bool<FF>(predicate, builder);
    auto out_inf_idx = output_point.is_infinity.index;
    auto input_inf_bool =
        Bool<CircuitBuilder>{ out_inf_idx, bool_ct::from_witness_index_unsafe(&builder, out_inf_idx) };
    auto pred_and_inf = get_and_result<FF>(analyzer, builder, predicate_bool, input_inf_bool);
    if (!pred_and_inf.has_value()) {
        log_error("is_msm_result_constrained: no is_infinity AND gate found for out_inf=", out_inf_idx);
        return false;
    }

    // --- Verify assert_equal between batch_mul result and tba ---
    // result.assert_equal(tba) standardizes both groups and checks x, y, is_infinity
    if (!is_cycle_group_assert_equal_constrained<FF>(analyzer, builder, batch_mul_x, batch_mul_y, tba_x, tba_y)) {
        log_error("is_msm_result_constrained: assert_equal not found between batch_mul result and tba");
        return false;
    }

    return true;
}

} // namespace cdg

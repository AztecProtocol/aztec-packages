// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMMSMShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                               const AllEntities& in,
                                               const Parameters& /*unused*/,
                                               const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using ShortView = ECCVMShortMonomialView<Accumulator>;

    // Short selectors and boolean-valued columns.
    const auto add1_s = ShortView(in.msm_add1);
    const auto add1_shift_s = ShortView(in.msm_add1_shift);
    const auto add2_s = ShortView(in.msm_add2);
    const auto add3_s = ShortView(in.msm_add3);
    const auto add4_s = ShortView(in.msm_add4);
    const auto q_add_s = ShortView(in.msm_add);
    const auto q_add_shift_s = ShortView(in.msm_add_shift);
    const auto q_skew_s = ShortView(in.msm_skew);
    const auto q_skew_shift_s = ShortView(in.msm_skew_shift);
    const auto q_double_s = ShortView(in.msm_double);
    const auto q_double_shift_s = ShortView(in.msm_double_shift);
    const auto msm_transition_s = ShortView(in.msm_transition);
    const auto msm_transition_shift_s = ShortView(in.msm_transition_shift);
    const auto lagrange_first_s = ShortView(in.lagrange_first);
    const auto round_s = ShortView(in.msm_round);
    const auto round_shift_s = ShortView(in.msm_round_shift);
    const auto count_s = ShortView(in.msm_count);
    const auto count_shift_s = ShortView(in.msm_count_shift);
    const auto pc_s = ShortView(in.msm_pc);
    const auto pc_shift_s = ShortView(in.msm_pc_shift);
    const auto msm_size_s = ShortView(in.msm_size_of_msm);
    const auto slice1_s = ShortView(in.msm_slice1);
    const auto slice2_s = ShortView(in.msm_slice2);
    const auto slice3_s = ShortView(in.msm_slice3);
    const auto slice4_s = ShortView(in.msm_slice4);

    // Promote heavy EC arithmetic to Accumulator immediately so the add/first_add/dbl lambdas operate unchanged.
    const auto x1 = Accumulator(ShortView(in.msm_x1));
    const auto y1 = Accumulator(ShortView(in.msm_y1));
    const auto x2 = Accumulator(ShortView(in.msm_x2));
    const auto y2 = Accumulator(ShortView(in.msm_y2));
    const auto x3 = Accumulator(ShortView(in.msm_x3));
    const auto y3 = Accumulator(ShortView(in.msm_y3));
    const auto x4 = Accumulator(ShortView(in.msm_x4));
    const auto y4 = Accumulator(ShortView(in.msm_y4));
    const auto collision_inverse1 = Accumulator(ShortView(in.msm_collision_x1));
    const auto collision_inverse2 = Accumulator(ShortView(in.msm_collision_x2));
    const auto collision_inverse3 = Accumulator(ShortView(in.msm_collision_x3));
    const auto collision_inverse4 = Accumulator(ShortView(in.msm_collision_x4));
    const auto lambda1 = Accumulator(ShortView(in.msm_lambda1));
    const auto lambda2 = Accumulator(ShortView(in.msm_lambda2));
    const auto lambda3 = Accumulator(ShortView(in.msm_lambda3));
    const auto lambda4 = Accumulator(ShortView(in.msm_lambda4));
    const auto acc_x = Accumulator(ShortView(in.msm_accumulator_x));
    const auto acc_y = Accumulator(ShortView(in.msm_accumulator_y));
    const auto acc_x_shift = Accumulator(ShortView(in.msm_accumulator_x_shift));
    const auto acc_y_shift = Accumulator(ShortView(in.msm_accumulator_y_shift));
    const auto msm_transition_acc = Accumulator(msm_transition_s);

    auto add = [&](auto& xb, auto& yb, auto& xa, auto& ya, auto& lambda, auto& selector, auto& collision_relation) {
        auto slope_relation = selector * (lambda * (xb - xa - 1) - (yb - ya)) + lambda;
        collision_relation += selector * (xb - xa);
        auto x_out = lambda.sqr() + (-xb - xa - xa) * selector + xa;
        auto y_out = lambda * (xa - x_out) + (-ya - ya) * selector + ya;
        return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
    };

    auto first_add =
        [&](auto& xb, auto& yb, auto& xa, auto& ya, auto& lambda, auto& selector, auto& collision_relation) {
            constexpr auto offset_generator = get_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
            constexpr uint256_t oxu = offset_generator.x;
            constexpr uint256_t oyu = offset_generator.y;
            const Accumulator xo(oxu);
            const Accumulator yo(oyu);
            auto x = xo * selector + xb * (-selector + 1);
            auto y = yo * selector + yb * (-selector + 1);
            auto slope_relation = lambda * (x - xa) - (y - ya);
            collision_relation += (xa - x);
            auto x_out = lambda * lambda + (-x - xa);
            auto y_out = lambda * (xa - x_out) - ya;
            return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
        };

    const auto add2_acc = Accumulator(add2_s);
    const auto add3_acc = Accumulator(add3_s);
    const auto add4_acc = Accumulator(add4_s);
    Accumulator x1_collision_relation(0);
    Accumulator x2_collision_relation(0);
    Accumulator x3_collision_relation(0);
    Accumulator x4_collision_relation(0);
    auto [x_t1, y_t1, add_slope_relation1] =
        first_add(acc_x, acc_y, x1, y1, lambda1, msm_transition_acc, x1_collision_relation);
    auto [x_t2, y_t2, add_slope_relation2] = add(x2, y2, x_t1, y_t1, lambda2, add2_acc, x2_collision_relation);
    auto [x_t3, y_t3, add_slope_relation3] = add(x3, y3, x_t2, y_t2, lambda3, add3_acc, x3_collision_relation);
    auto [x_t4, y_t4, add_slope_relation4] = add(x4, y4, x_t3, y_t3, lambda4, add4_acc, x4_collision_relation);

    // ADD_ACC / ADD_SLOPE_*: fold q_add * scaling_factor in short basis.
    const auto q_add_scaled = Accumulator(q_add_s * scaling_factor);
    std::get<Base::ADD_ACC_X>(accumulator) += q_add_scaled * (acc_x_shift - x_t4);
    std::get<Base::ADD_ACC_Y>(accumulator) += q_add_scaled * (acc_y_shift - y_t4);
    std::get<Base::ADD_SLOPE_1>(accumulator) += q_add_scaled * add_slope_relation1;
    std::get<Base::ADD_SLOPE_2>(accumulator) += q_add_scaled * add_slope_relation2;
    std::get<Base::ADD_SLOPE_3>(accumulator) += q_add_scaled * add_slope_relation3;
    std::get<Base::ADD_SLOPE_4>(accumulator) += q_add_scaled * add_slope_relation4;

    auto dbl = [&](auto& x, auto& y, auto& lambda) {
        auto two_x = x + x;
        auto slope_relation = lambda * (y + y) - (two_x + x) * x;
        auto x_out = lambda.sqr() - two_x;
        auto y_out = lambda * (x - x_out) - y;
        return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
    };

    auto [x_d1, y_d1, double_slope_relation1] = dbl(acc_x, acc_y, lambda1);
    auto [x_d2, y_d2, double_slope_relation2] = dbl(x_d1, y_d1, lambda2);
    auto [x_d3, y_d3, double_slope_relation3] = dbl(x_d2, y_d2, lambda3);
    auto [x_d4, y_d4, double_slope_relation4] = dbl(x_d3, y_d3, lambda4);

    const auto q_double_scaled = Accumulator(q_double_s * scaling_factor);
    std::get<Base::DOUBLE_ACC_X>(accumulator) += q_double_scaled * (acc_x_shift - x_d4);
    std::get<Base::DOUBLE_ACC_Y>(accumulator) += q_double_scaled * (acc_y_shift - y_d4);
    std::get<Base::DOUBLE_SLOPE_1>(accumulator) += q_double_scaled * double_slope_relation1;
    std::get<Base::DOUBLE_SLOPE_2>(accumulator) += q_double_scaled * double_slope_relation2;
    std::get<Base::DOUBLE_SLOPE_3>(accumulator) += q_double_scaled * double_slope_relation3;
    std::get<Base::DOUBLE_SLOPE_4>(accumulator) += q_double_scaled * double_slope_relation4;

    // Skew round.
    static const FF inverse_seven_static = FF(7).invert();
    const auto skew1_select = Accumulator(slice1_s * inverse_seven_static);
    const auto skew2_select = Accumulator(slice2_s * inverse_seven_static);
    const auto skew3_select = Accumulator(slice3_s * inverse_seven_static);
    const auto skew4_select = Accumulator(slice4_s * inverse_seven_static);
    Accumulator x1_skew_collision_relation(0);
    Accumulator x2_skew_collision_relation(0);
    Accumulator x3_skew_collision_relation(0);
    Accumulator x4_skew_collision_relation(0);
    auto [x_s1, y_s1, skew_slope_relation1] =
        add(x1, y1, acc_x, acc_y, lambda1, skew1_select, x1_skew_collision_relation);
    auto [x_s2, y_s2, skew_slope_relation2] =
        add(x2, y2, x_s1, y_s1, lambda2, skew2_select, x2_skew_collision_relation);
    auto [x_s3, y_s3, skew_slope_relation3] =
        add(x3, y3, x_s2, y_s2, lambda3, skew3_select, x3_skew_collision_relation);
    auto [x_s4, y_s4, skew_slope_relation4] =
        add(x4, y4, x_s3, y_s3, lambda4, skew4_select, x4_skew_collision_relation);

    const auto q_skew_scaled = Accumulator(q_skew_s * scaling_factor);
    std::get<Base::SKEW_ACC_X>(accumulator) += q_skew_scaled * (acc_x_shift - x_s4);
    std::get<Base::SKEW_ACC_Y>(accumulator) += q_skew_scaled * (acc_y_shift - y_s4);
    std::get<Base::SKEW_SLOPE_1>(accumulator) += q_skew_scaled * skew_slope_relation1;
    std::get<Base::SKEW_SLOPE_2>(accumulator) += q_skew_scaled * skew_slope_relation2;
    std::get<Base::SKEW_SLOPE_3>(accumulator) += q_skew_scaled * skew_slope_relation3;
    std::get<Base::SKEW_SLOPE_4>(accumulator) += q_skew_scaled * skew_slope_relation4;

    // Collision checks: add_first/second/.../fourth_point stays short, the x_*_delta arithmetic stays in Accumulator.
    const auto add_first_point_short = add1_s * q_add_s + q_skew_s * (slice1_s * inverse_seven_static);
    const auto add_second_point_short = add2_s * q_add_s + q_skew_s * (slice2_s * inverse_seven_static);
    const auto add_third_point_short = add3_s * q_add_s + q_skew_s * (slice3_s * inverse_seven_static);
    const auto add_fourth_point_short = add4_s * q_add_s + q_skew_s * (slice4_s * inverse_seven_static);
    const auto q_skew_acc = Accumulator(q_skew_s);
    const auto q_add_acc = Accumulator(q_add_s);
    const auto x1_delta = x1_skew_collision_relation * q_skew_acc + x1_collision_relation * q_add_acc;
    const auto x2_delta = x2_skew_collision_relation * q_skew_acc + x2_collision_relation * q_add_acc;
    const auto x3_delta = x3_skew_collision_relation * q_skew_acc + x3_collision_relation * q_add_acc;
    const auto x4_delta = x4_skew_collision_relation * q_skew_acc + x4_collision_relation * q_add_acc;
    std::get<Base::COLLISION_CHECK_1>(accumulator) +=
        (x1_delta * collision_inverse1 - Accumulator(add_first_point_short)) * scaling_factor;
    std::get<Base::COLLISION_CHECK_2>(accumulator) +=
        (x2_delta * collision_inverse2 - Accumulator(add_second_point_short)) * scaling_factor;
    std::get<Base::COLLISION_CHECK_3>(accumulator) +=
        (x3_delta * collision_inverse3 - Accumulator(add_third_point_short)) * scaling_factor;
    std::get<Base::COLLISION_CHECK_4>(accumulator) +=
        (x4_delta * collision_inverse4 - Accumulator(add_fourth_point_short)) * scaling_factor;

    // Inactive slice: (1 - add_i) * slice_i * scaling, all short.
    std::get<Base::INACTIVE_SLICE_1>(accumulator) += Accumulator(((-add1_s + FF(1)) * slice1_s) * scaling_factor);
    std::get<Base::INACTIVE_SLICE_2>(accumulator) += Accumulator(((-add2_s + FF(1)) * slice2_s) * scaling_factor);
    std::get<Base::INACTIVE_SLICE_3>(accumulator) += Accumulator(((-add3_s + FF(1)) * slice3_s) * scaling_factor);
    std::get<Base::INACTIVE_SLICE_4>(accumulator) += Accumulator(((-add4_s + FF(1)) * slice4_s) * scaling_factor);

    // Phase selector mutual exclusivity (degree 2): everything stays short.
    {
        const auto sum = q_add_s * q_double_s + q_add_s * q_skew_s + q_double_s * q_skew_s; // length 3
        std::get<Base::PHASE_SELECTOR_MUTUAL_EXCLUSIVITY>(accumulator) += Accumulator(sum * scaling_factor);
    }

    // Idle row preserves accumulator. degree-5 selector built in short, then promoted.
    const auto no_op_selector_short_a = (-q_add_s + FF(1)) * (-q_double_s + FF(1));        // length 3
    const auto no_op_selector_short_b = (-q_skew_s + FF(1)) * (-msm_transition_s + FF(1)); // length 3
    const auto no_op_selector_short_c = -lagrange_first_s + FF(1);                         // length 2
    const auto no_op_selector_acc =
        Accumulator(no_op_selector_short_a) * Accumulator(no_op_selector_short_b) * Accumulator(no_op_selector_short_c);
    std::get<Base::IDLE_ROW_PRESERVES_ACC_X>(accumulator) +=
        no_op_selector_acc * (acc_x_shift - acc_x) * scaling_factor;
    std::get<Base::IDLE_ROW_PRESERVES_ACC_Y>(accumulator) +=
        no_op_selector_acc * (acc_y_shift - acc_y) * scaling_factor;

    // ADD1 decomposition: add1 - q_add - q_skew, all linear in short.
    std::get<Base::ADD1_DECOMPOSITION>(accumulator) += Accumulator((add1_s - q_add_s - q_skew_s) * scaling_factor);

    // Round transition logic.
    const auto round_delta_short = round_shift_s - round_s;                                          // length 2
    const auto neg_msm_transition_shift_plus_one_short = -msm_transition_shift_s + FF(1);            // length 2
    const auto round_transition_short = round_delta_short * neg_msm_transition_shift_plus_one_short; // length 3
    // ROUND_TRANSITION_FORCES_DELTA_ONE: round_transition * (round_delta - 1) * scaling.
    {
        const auto round_delta_minus_one_short = round_delta_short - FF(1); // length 2
        std::get<Base::ROUND_TRANSITION_FORCES_DELTA_ONE>(accumulator) +=
            Accumulator(round_transition_short * scaling_factor) * Accumulator(round_delta_minus_one_short);
    }
    // ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31: round_transition * q_skew_shift * (round - 31) * scaling.
    {
        const auto round_minus_31_short = round_s - FF(31);
        std::get<Base::ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31>(accumulator) +=
            Accumulator(round_transition_short * scaling_factor) * Accumulator(q_skew_shift_s * round_minus_31_short);
    }
    // ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW.
    {
        const auto q_skew_plus_q_double_minus_one_short = (q_skew_shift_s + q_double_shift_s) - FF(1); // length 2
        std::get<Base::ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW>(accumulator) +=
            Accumulator(round_transition_short * scaling_factor) * Accumulator(q_skew_plus_q_double_minus_one_short);
    }
    // DOUBLE_REQUIRES_ROUND_CHANGE.
    {
        std::get<Base::DOUBLE_REQUIRES_ROUND_CHANGE>(accumulator) +=
            Accumulator(((-round_delta_short + FF(1)) * q_double_shift_s) * scaling_factor);
    }
    // ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW: round_transition * (1 - q_double_shift) * (1 - q_skew_shift) * scaling.
    {
        const auto neg_double_short = -q_double_shift_s + FF(1);                  // length 2
        const auto neg_skew_short = -q_skew_shift_s + FF(1);                      // length 2
        const auto not_double_not_skew_short = neg_double_short * neg_skew_short; // length 3
        std::get<Base::ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW>(accumulator) +=
            Accumulator(round_transition_short * scaling_factor) * Accumulator(not_double_not_skew_short);
    }

    // DOUBLE_IMPLIES_NEXT_IS_ADD.
    std::get<Base::DOUBLE_IMPLIES_NEXT_IS_ADD>(accumulator) +=
        Accumulator((q_double_s * (-q_add_shift_s + FF(1))) * scaling_factor);
    // SKEW_PERSISTS_UNTIL_MSM_TRANSITION: (1 - msm_transition_shift) * q_skew * (1 - q_skew_shift) * scaling (degree
    // 3).
    {
        const auto neg_skew_shift_short = -q_skew_shift_s + FF(1);                   // length 2
        const auto outer_short = neg_msm_transition_shift_plus_one_short * q_skew_s; // length 3
        std::get<Base::SKEW_PERSISTS_UNTIL_MSM_TRANSITION>(accumulator) +=
            Accumulator(outer_short * scaling_factor) * Accumulator(neg_skew_shift_short);
    }
    // SKEW_IMPLIES_ROUND_32.
    std::get<Base::SKEW_IMPLIES_ROUND_32>(accumulator) +=
        Accumulator((q_skew_s * (-round_s + FF(32))) * scaling_factor);

    // COUNT_SHIFT_ZERO_ON_ROUND_CHANGE: round_delta * count_shift * scaling.
    std::get<Base::COUNT_SHIFT_ZERO_ON_ROUND_CHANGE>(accumulator) +=
        Accumulator((round_delta_short * count_shift_s) * scaling_factor);
    // COUNT_INCREMENT_WITHIN_ROUND: (1 - msm_transition_shift) * (1 - round_delta) * (count_shift - count - sum_add_i)
    // * scaling.
    {
        const auto neg_round_delta_plus_one_short = -round_delta_short + FF(1);                            // length 2
        const auto outer_short = neg_msm_transition_shift_plus_one_short * neg_round_delta_plus_one_short; // length 3
        const auto inner_short = ((count_shift_s - count_s) - add1_s - add2_s - add3_s) - add4_s;          // length 2
        std::get<Base::COUNT_INCREMENT_WITHIN_ROUND>(accumulator) +=
            Accumulator(outer_short * scaling_factor) * Accumulator(inner_short);
    }
    // COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION: is_not_first_row * (1 - msm_transition_shift) * round_delta *
    // count_shift * scaling.
    {
        const auto is_not_first_row_short = -lagrange_first_s + FF(1);                               // length 2
        const auto outer_a_short = is_not_first_row_short * neg_msm_transition_shift_plus_one_short; // length 3
        const auto outer_b_short = round_delta_short * count_shift_s;                                // length 3
        std::get<Base::COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION>(accumulator) +=
            Accumulator(outer_a_short * scaling_factor) * Accumulator(outer_b_short);
    }

    // MSM_TRANSITION_ROUND_ZERO.
    std::get<Base::MSM_TRANSITION_ROUND_ZERO>(accumulator) +=
        Accumulator((msm_transition_s * round_s) * scaling_factor);
    // MSM_TRANSITION_PC: is_not_first_row * msm_transition_shift * (msm_size + pc_shift - pc) * scaling.
    {
        const auto is_not_first_row_short = -lagrange_first_s + FF(1);
        const auto outer_short = is_not_first_row_short * msm_transition_shift_s; // length 3
        const auto inner_short = (msm_size_s + pc_shift_s) - pc_s;                // length 2
        std::get<Base::MSM_TRANSITION_PC>(accumulator) +=
            Accumulator(outer_short * scaling_factor) * Accumulator(inner_short);
    }

    // Continuity checks: each is short * short * scaling.
    std::get<Base::ADD_CONTINUITY_2>(accumulator) += Accumulator((add2_s * (-add1_s + FF(1))) * scaling_factor);
    std::get<Base::ADD_CONTINUITY_3>(accumulator) += Accumulator((add3_s * (-add2_s + FF(1))) * scaling_factor);
    std::get<Base::ADD_CONTINUITY_4>(accumulator) += Accumulator((add4_s * (-add3_s + FF(1))) * scaling_factor);

    // ADD_CROSS_ROW_CONTINUITY: (q_add * q_add_shift + q_skew * q_skew_shift) * (1 - add4) * add1_shift * scaling.
    {
        const auto outer_short = q_add_s * q_add_shift_s + q_skew_s * q_skew_shift_s; // length 3
        const auto inner_short = (-add4_s + FF(1)) * add1_shift_s;                    // length 3
        std::get<Base::ADD_CROSS_ROW_CONTINUITY>(accumulator) +=
            Accumulator(outer_short * scaling_factor) * Accumulator(inner_short);
    }
}

} // namespace bb

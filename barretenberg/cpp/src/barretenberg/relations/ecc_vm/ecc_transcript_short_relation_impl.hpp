// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_transcript_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMTranscriptShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                      const AllEntities& in,
                                                      const Parameters& /*unused*/,
                                                      const FF& scaling_factor)
{
    // "Core" accumulator type — used by LAMBDA_RELATION / ACC_X/Y_UPDATE / ACC_EMPTY_UPDATE, which share several
    // promoted intermediates (result_is_lhs/rhs/inf, opcode_is_zero).
    using Accumulator = typename std::tuple_element_t<Base::LAMBDA_RELATION, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;

    // Per-subrelation accumulator types for tightened partial lengths.
    using Acc7 = typename std::tuple_element_t<Base::ON_CURVE_CHECK, ContainerOverSubrelations>;
    using Acc6 = typename std::tuple_element_t<Base::EQ_X_DIFF, ContainerOverSubrelations>;
    using Acc5 = typename std::tuple_element_t<Base::PC_UPDATE, ContainerOverSubrelations>;
    using Acc4 = typename std::tuple_element_t<Base::MSM_TRANSITION, ContainerOverSubrelations>;
    using Acc3 = typename std::tuple_element_t<Base::Z1_ZERO_CHECK, ContainerOverSubrelations>;
    using Acc2 = typename std::tuple_element_t<Base::OPCODE_WELL_FORMED, ContainerOverSubrelations>;

    const auto z1 = View(in.transcript_z1);
    const auto z2 = View(in.transcript_z2);
    const auto z1_zero = View(in.transcript_z1zero);
    const auto z2_zero = View(in.transcript_z2zero);
    const auto op = View(in.transcript_op);
    const auto q_add = View(in.transcript_add);
    const auto q_mul = View(in.transcript_mul);
    const auto q_mul_shift = View(in.transcript_mul_shift);
    const auto q_eq = View(in.transcript_eq);
    const auto msm_transition = View(in.transcript_msm_transition);
    const auto msm_count = View(in.transcript_msm_count);
    const auto msm_count_shift = View(in.transcript_msm_count_shift);
    const auto pc = View(in.transcript_pc);
    const auto pc_shift = View(in.transcript_pc_shift);
    const auto transcript_accumulator_x_shift = View(in.transcript_accumulator_x_shift);
    const auto transcript_accumulator_y_shift = View(in.transcript_accumulator_y_shift);
    const auto transcript_accumulator_x = View(in.transcript_accumulator_x);
    const auto transcript_accumulator_y = View(in.transcript_accumulator_y);
    const auto msm_count_zero_at_transition = View(in.transcript_msm_count_zero_at_transition);
    const auto msm_count_at_transition_inverse = View(in.transcript_msm_count_at_transition_inverse);
    const auto transcript_msm_x = View(in.transcript_msm_intermediate_x);
    const auto transcript_msm_y = View(in.transcript_msm_intermediate_y);
    const auto transcript_Px = View(in.transcript_Px);
    const auto transcript_Py = View(in.transcript_Py);
    const auto transcript_accumulator_not_empty = View(in.transcript_accumulator_not_empty);
    const auto is_accumulator_empty = -transcript_accumulator_not_empty + FF(1);
    const auto lagrange_first = View(in.lagrange_first);
    const auto lagrange_last = View(in.lagrange_last);
    const auto is_accumulator_empty_shift = -View(in.transcript_accumulator_not_empty_shift) + FF(1);
    const auto q_reset_accumulator = View(in.transcript_reset_accumulator);
    const auto lagrange_second = View(in.lagrange_second);
    const auto lagrange_third = View(in.lagrange_third);
    const auto transcript_Pinfinity = View(in.transcript_base_infinity);
    const auto transcript_Px_inverse = View(in.transcript_base_x_inverse);
    const auto transcript_Py_inverse = View(in.transcript_base_y_inverse);
    const auto transcript_add_x_equal = View(in.transcript_add_x_equal);
    const auto transcript_add_y_equal = View(in.transcript_add_y_equal);
    const auto transcript_add_lambda = View(in.transcript_add_lambda);
    const auto transcript_msm_infinity = View(in.transcript_msm_infinity);

    const auto is_not_first_row = -lagrange_first + FF(1);
    const auto is_not_last_row = -lagrange_last + FF(1);
    const auto is_not_first_or_last_row = (-lagrange_first - lagrange_last) + FF(1);
    const auto is_not_infinity = -transcript_Pinfinity + FF(1);
    const auto is_not_hiding_row = -lagrange_second + FF(1);

    // Z1/Z2 zero checks: deg 2, length 3.
    std::get<Base::Z1_ZERO_CHECK>(accumulator) += Acc3(z1 * (z1_zero * scaling_factor));
    std::get<Base::Z2_ZERO_CHECK>(accumulator) += Acc3(z2 * (z2_zero * scaling_factor));

    // Opcode well-formed: deg 1, length 2.
    auto tmp = q_add + q_add;
    tmp += q_mul;
    tmp += tmp;
    tmp += q_eq;
    tmp += tmp;
    tmp += q_reset_accumulator;
    std::get<Base::OPCODE_WELL_FORMED>(accumulator) += Acc2((tmp - op) * scaling_factor);

    // PC update: deg 4, length 5.
    const auto pc_delta_short = pc - pc_shift;                   // length 2
    const auto z1_active = -z1_zero + FF(1);                     // length 2
    const auto z2_active = -z2_zero + FF(1);                     // length 2
    const auto z_active_sum = z1_active + z2_active;             // length 2
    const auto num_muls_in_row = z_active_sum * is_not_infinity; // length 3
    {
        const auto first_term = Acc5((is_not_first_row * pc_delta_short) * scaling_factor);
        const auto second_term = Acc5(is_not_first_row * q_mul) * Acc5(num_muls_in_row * scaling_factor);
        std::get<Base::PC_UPDATE>(accumulator) += first_term - second_term;
    }

    // MSM_COUNT_ZERO_AT_TRANSITION: deg 6, length 7.
    const auto msm_transition_check = q_mul * (-q_mul_shift + FF(1)); // length 3
    {
        const auto msm_count_total_acc7 = Acc7(msm_count) + Acc7(num_muls_in_row);
        const auto check_a = Acc7(msm_count_zero_at_transition) * msm_count_total_acc7;
        const auto inv_term = msm_count_total_acc7 * Acc7(msm_count_at_transition_inverse) - Acc7(FF(1));
        const auto inactive = Acc7(-msm_count_zero_at_transition + FF(1));
        const auto zero_check = check_a + inv_term * inactive;
        std::get<Base::MSM_COUNT_ZERO_AT_TRANSITION>(accumulator) +=
            Acc7(msm_transition_check * scaling_factor) * zero_check;
    }

    // MSM_TRANSITION: deg 3, length 4.
    {
        const auto not_zero_at_transition = Acc4(-msm_count_zero_at_transition + FF(1));
        const auto outer = Acc4(msm_transition * scaling_factor) -
                           Acc4(msm_transition_check * scaling_factor) * not_zero_at_transition;
        std::get<Base::MSM_TRANSITION>(accumulator) += outer;
    }

    // MSM_COUNT_ZERO_WHEN_NOT_MUL: deg 2, length 3.
    std::get<Base::MSM_COUNT_ZERO_WHEN_NOT_MUL>(accumulator) += Acc3(((-q_mul + FF(1)) * msm_count) * scaling_factor);

    // MSM_COUNT_INCREMENT_ACROSS_ROWS: deg 5, length 6.
    const auto msm_count_delta = msm_count_shift - msm_count;
    {
        const auto outer_short = is_not_first_row * (-msm_transition + FF(1)); // length 3
        const auto inner =
            Acc6(msm_count_delta * scaling_factor) - Acc6(q_mul) * Acc6(num_muls_in_row * scaling_factor);
        std::get<Base::MSM_COUNT_INCREMENT_ACROSS_ROWS>(accumulator) += Acc6(outer_short) * inner;
    }

    // OPCODE_EXCLUSION: deg 2, length 3.
    {
        const auto mul_other = q_add + q_eq + q_reset_accumulator;
        const auto add_other = q_mul + q_eq + q_reset_accumulator;
        const auto sum = q_mul * mul_other + q_add * add_other; // length 3
        std::get<Base::OPCODE_EXCLUSION>(accumulator) += Acc3(sum * scaling_factor);
    }

    // EQ checks: deg 5, length 6.
    const auto both_infinity_short = transcript_Pinfinity * is_accumulator_empty; // length 3
    const auto not_pinf = -transcript_Pinfinity + FF(1);                          // length 2
    const auto not_acc_empty = -is_accumulator_empty + FF(1);                     // length 2
    const auto both_not_infinity_short = not_pinf * not_acc_empty;                // length 3
    const auto infinity_exclusion_short =
        ((-both_infinity_short) - both_infinity_short) + (transcript_Pinfinity + is_accumulator_empty); // length 3
    const auto q_eq_hiding_short = q_eq * is_not_hiding_row;                                            // length 3
    {
        const auto eq_x_diff = transcript_Px - transcript_accumulator_x; // length 2
        const auto inner_x = Acc6(eq_x_diff) * Acc6(both_not_infinity_short) + Acc6(infinity_exclusion_short);
        std::get<Base::EQ_X_DIFF>(accumulator) += Acc6(q_eq_hiding_short * scaling_factor) * inner_x;
    }
    {
        const auto eq_y_diff = transcript_Py - transcript_accumulator_y;
        const auto inner_y = Acc6(eq_y_diff) * Acc6(both_not_infinity_short) + Acc6(infinity_exclusion_short);
        std::get<Base::EQ_Y_DIFF>(accumulator) += Acc6(q_eq_hiding_short * scaling_factor) * inner_y;
    }

    // Boundary conditions: deg 2, length 3.
    std::get<Base::BOUNDARY_ACCUMULATOR_EMPTY>(accumulator) +=
        Acc3((lagrange_third * (-is_accumulator_empty + FF(1))) * scaling_factor);
    std::get<Base::BOUNDARY_MSM_COUNT_AND_PC>(accumulator) +=
        Acc3((lagrange_third * msm_count + lagrange_last * pc) * scaling_factor);

    // ON_CURVE_CHECK: deg 6, length 7.
    {
        const auto validate_on_curve = q_add + q_mul + q_eq; // length 2
        const auto py_sq = transcript_Py.sqr();              // length 3
        const auto px_sq = transcript_Px.sqr();              // length 3
        const auto on_curve_check =
            Acc7(py_sq) - Acc7(px_sq) * Acc7(transcript_Px) - Acc7(Base::get_curve_b()); // deg 3
        const auto gating_short = is_not_infinity * is_not_hiding_row;                   // length 3
        const auto outer = Acc7(validate_on_curve) * Acc7(gating_short * scaling_factor);
        std::get<Base::ON_CURVE_CHECK>(accumulator) += outer * on_curve_check;
    }

    // Lambda relation / accumulator updates / offset generator / ADD_X/Y_EQUAL / ACC_EMPTY: shared block.
    {
        const auto is_double_short = transcript_add_x_equal * transcript_add_y_equal; // length 3
        const auto is_add_short = -transcript_add_x_equal + FF(1);                    // length 2
        const auto rhs_x = transcript_accumulator_x;
        const auto rhs_y = transcript_accumulator_y;
        const auto out_x = transcript_accumulator_x_shift;
        const auto out_y = transcript_accumulator_y_shift;
        const auto lambda = transcript_add_lambda;

        const auto lhs_x_short = transcript_Px * q_add + transcript_msm_x * msm_transition; // length 3
        const auto lhs_y_short = transcript_Py * q_add + transcript_msm_y * msm_transition; // length 3
        const auto lhs_infinity_short =
            transcript_Pinfinity * q_add + transcript_msm_infinity * msm_transition; // length 3
        const auto rhs_infinity_short = is_accumulator_empty;                        // length 2
        const auto neg_lhs_inf_plus_one_short = -lhs_infinity_short + FF(1);         // length 3
        const auto neg_rhs_inf_plus_one_short = -rhs_infinity_short + FF(1);         // length 2

        // These intermediates are shared across LAMBDA / ACC_X/Y / ACC_EMPTY (all length 8).
        const auto result_is_lhs = Accumulator(rhs_infinity_short) * Accumulator(neg_lhs_inf_plus_one_short);
        const auto result_is_rhs = Accumulator(neg_rhs_inf_plus_one_short) * Accumulator(lhs_infinity_short);
        const auto result_infinity_from_inputs = Accumulator(lhs_infinity_short) * Accumulator(rhs_infinity_short);
        const auto result_infinity_from_op_short =
            transcript_add_x_equal * (-transcript_add_y_equal + FF(1)); // length 3
        const auto result_is_infinity_short =
            result_infinity_from_inputs + Accumulator(result_infinity_from_op_short); // deg 2
        const auto any_add_is_active_short = q_add + msm_transition;                  // length 2

        Accumulator transcript_lambda_relation(0);
        // MSM lambda relation
        {
            Accumulator transcript_msm_lambda_relation(0);
            const auto msm_x = transcript_msm_x;
            const auto msm_y = transcript_msm_y;
            {
                const auto lambda_den = rhs_x - msm_x;
                const auto lambda_num = rhs_y - msm_y;
                const auto lambda_rel = Accumulator(lambda * lambda_den) - Accumulator(lambda_num);
                transcript_msm_lambda_relation += lambda_rel * Accumulator(is_add_short);
            }
            {
                const auto lambda_den = msm_y + msm_y;
                const auto lambda_num_short = msm_x.sqr() * FF(3);
                const auto lambda_rel = Accumulator(lambda * lambda_den) - Accumulator(lambda_num_short);
                transcript_msm_lambda_relation += lambda_rel * Accumulator(is_double_short);
            }
            const auto valid_short = (-transcript_msm_infinity + FF(1)) * (-is_accumulator_empty + FF(1));
            transcript_msm_lambda_relation *= Accumulator(valid_short);
            {
                const auto invalid_short =
                    result_infinity_from_op_short + (transcript_msm_infinity + is_accumulator_empty);
                transcript_msm_lambda_relation += Accumulator(lambda) * Accumulator(invalid_short);
            }
            transcript_lambda_relation = transcript_msm_lambda_relation * Accumulator(msm_transition * scaling_factor);
        }
        // Base-point add lambda relation
        {
            Accumulator transcript_add_lambda_relation(0);
            const auto add_x = transcript_Px;
            const auto add_y = transcript_Py;
            {
                const auto lambda_den = rhs_x - add_x;
                const auto lambda_num = rhs_y - add_y;
                const auto lambda_rel = Accumulator(lambda * lambda_den) - Accumulator(lambda_num);
                transcript_add_lambda_relation += lambda_rel * Accumulator(is_add_short);
            }
            {
                const auto lambda_den = add_y + add_y;
                const auto lambda_num_short = add_x.sqr() * FF(3);
                const auto lambda_rel = Accumulator(lambda * lambda_den) - Accumulator(lambda_num_short);
                transcript_add_lambda_relation += lambda_rel * Accumulator(is_double_short);
            }
            const auto valid_short = (-transcript_Pinfinity + FF(1)) * (-is_accumulator_empty + FF(1));
            transcript_add_lambda_relation *= Accumulator(valid_short);
            {
                const auto invalid_short =
                    result_infinity_from_op_short + (transcript_Pinfinity + is_accumulator_empty);
                transcript_add_lambda_relation += Accumulator(lambda) * Accumulator(invalid_short);
            }
            transcript_lambda_relation += transcript_add_lambda_relation * Accumulator(q_add * scaling_factor);
            std::get<Base::LAMBDA_RELATION>(accumulator) += transcript_lambda_relation;
        }

        // ACCUMULATOR_X/Y_UPDATE — length 8.
        const auto propagate_transcript_accumulator_short =
            q_mul * (-msm_transition + FF(1)) + q_eq * (-q_reset_accumulator + FF(1)); // length 3
        const auto opcode_is_zero_short_part_a = is_not_first_row * (-q_add + FF(1));
        const auto opcode_is_zero_short_part_b = (-q_mul + FF(1)) * (-q_reset_accumulator + FF(1));
        const auto opcode_is_zero_short_part_c = -q_eq + FF(1);
        const auto opcode_is_zero_scaled = Accumulator(opcode_is_zero_short_part_a * scaling_factor) *
                                           Accumulator(opcode_is_zero_short_part_b) *
                                           Accumulator(opcode_is_zero_short_part_c); // deg 5
        const auto any_add_is_active_scaled_acc = Accumulator(any_add_is_active_short * scaling_factor);
        const auto propagate_transcript_accumulator_scaled = propagate_transcript_accumulator_short * scaling_factor;
        {
            const auto lambda_sqr = Accumulator(lambda.sqr());
            const auto lhs_x_acc = Accumulator(lhs_x_short);
            const auto lhs_y_acc = Accumulator(lhs_y_short);
            const auto rhs_x_acc = Accumulator(rhs_x);
            const auto rhs_y_acc = Accumulator(rhs_y);
            auto x3 = lambda_sqr - lhs_x_acc - rhs_x_acc;
            auto y3 = Accumulator(lambda) * (lhs_x_acc - x3) - lhs_y_acc;
            x3 += result_is_lhs * (rhs_x_acc + lhs_x_acc + lhs_x_acc);
            x3 += result_is_rhs * (lhs_x_acc + rhs_x_acc + rhs_x_acc);
            x3 += result_is_infinity_short * (lhs_x_acc + rhs_x_acc);
            y3 += result_is_lhs * (lhs_y_acc + lhs_y_acc);
            y3 += result_is_rhs * (lhs_y_acc + rhs_y_acc);
            y3 += result_is_infinity_short * lhs_y_acc;

            const auto propagate_acc_x = Accumulator(propagate_transcript_accumulator_scaled) *
                                         Accumulator(is_not_last_row * (out_x - transcript_accumulator_x));
            const auto propagate_acc_y = Accumulator(propagate_transcript_accumulator_scaled) *
                                         Accumulator(is_not_last_row * (out_y - transcript_accumulator_y));
            auto add_point_x_relation = (x3 - Accumulator(out_x)) * any_add_is_active_scaled_acc + propagate_acc_x +
                                        Accumulator(out_x * (q_reset_accumulator * scaling_factor)) +
                                        Accumulator(out_x) * opcode_is_zero_scaled;
            auto add_point_y_relation = (y3 - Accumulator(out_y)) * any_add_is_active_scaled_acc + propagate_acc_y +
                                        Accumulator(out_y * (q_reset_accumulator * scaling_factor)) +
                                        Accumulator(out_y) * opcode_is_zero_scaled;
            std::get<Base::ACCUMULATOR_X_UPDATE>(accumulator) += add_point_x_relation;
            std::get<Base::ACCUMULATOR_Y_UPDATE>(accumulator) += add_point_y_relation;
        }

        // The offset-generator subtraction and MSM-infinity subrelations (OFFSET_GENERATOR_X/Y, MSM_INFINITY_*) are
        // gated entirely by `msm_transition` and live in ECCVMTranscriptMsmTransitionShortRelation so the prover can
        // skip them when msm_transition == 0.

        // ACCUMULATOR_EMPTY_UPDATE — length 8 (shares opcode_is_zero, result_is_infinity_short).
        {
            const auto accumulator_infinity_preserve =
                Accumulator(propagate_transcript_accumulator_scaled) *
                Accumulator(is_not_first_or_last_row * (is_accumulator_empty - is_accumulator_empty_shift));
            const auto accumulator_infinity_q_reset =
                Accumulator((q_reset_accumulator * (-is_accumulator_empty_shift + FF(1))) * scaling_factor);
            const auto accumulator_infinity_from_add =
                any_add_is_active_scaled_acc * (result_is_infinity_short - Accumulator(is_accumulator_empty_shift));
            const auto accumulator_infinity_from_noop =
                opcode_is_zero_scaled * Accumulator(-is_accumulator_empty_shift + FF(1));
            const auto accumulator_infinity_relation =
                accumulator_infinity_preserve +
                (accumulator_infinity_q_reset + accumulator_infinity_from_add) * Accumulator(is_not_first_row) +
                accumulator_infinity_from_noop;
            std::get<Base::ACCUMULATOR_EMPTY_UPDATE>(accumulator) += accumulator_infinity_relation;
        }

        // ADD_X_EQUAL / ADD_Y_EQUAL: deg 5, length 6.
        {
            const auto x_diff = Acc6(lhs_x_short - rhs_x); // deg 2
            const auto x_product =
                Acc6(transcript_Px_inverse * (-transcript_add_x_equal + FF(1))) + Acc6(transcript_add_x_equal); // deg 2
            const auto x_constant = transcript_add_x_equal - FF(1);
            const auto x_relation =
                (x_diff * x_product + Acc6(x_constant)) * Acc6(any_add_is_active_short * scaling_factor);
            std::get<Base::ADD_X_EQUAL_CHECK>(accumulator) += x_relation;
        }
        {
            const auto y_diff = Acc6(lhs_y_short - rhs_y);
            const auto y_product =
                Acc6(transcript_Py_inverse * (-transcript_add_y_equal + FF(1))) + Acc6(transcript_add_y_equal);
            const auto y_constant = transcript_add_y_equal - FF(1);
            const auto y_relation =
                (y_diff * y_product + Acc6(y_constant)) * Acc6(any_add_is_active_short * scaling_factor);
            std::get<Base::ADD_Y_EQUAL_CHECK>(accumulator) += y_relation;
        }
    }

    // Hiding row constraints: deg 2, length 3.
    std::get<Base::HIDING_ROW_EQ>(accumulator) += Acc3((lagrange_second * (-q_eq + FF(1))) * scaling_factor);
    std::get<Base::HIDING_ROW_RESET>(accumulator) +=
        Acc3((lagrange_second * (-q_reset_accumulator + FF(1))) * scaling_factor);

    // Infinity-flag consistency: deg 2, length 3.
    std::get<Base::INFINITY_BASE_PX>(accumulator) += Acc3((transcript_Pinfinity * transcript_Px) * scaling_factor);
    std::get<Base::INFINITY_BASE_PY>(accumulator) += Acc3((transcript_Pinfinity * transcript_Py) * scaling_factor);
    std::get<Base::INFINITY_ACC_X>(accumulator) +=
        Acc3((is_accumulator_empty * transcript_accumulator_x) * scaling_factor);
    std::get<Base::INFINITY_ACC_Y>(accumulator) +=
        Acc3((is_accumulator_empty * transcript_accumulator_y) * scaling_factor);

    // ACCUMULATOR_NOT_EMPTY_INIT: deg 2, length 3.
    std::get<Base::ACCUMULATOR_NOT_EMPTY_INIT>(accumulator) +=
        Acc3((lagrange_first * transcript_accumulator_not_empty) * scaling_factor);
}

} // namespace bb

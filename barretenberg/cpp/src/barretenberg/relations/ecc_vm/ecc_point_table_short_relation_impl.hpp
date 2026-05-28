// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_point_table_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMPointTableShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                      const AllEntities& in,
                                                      const Parameters& /*unused*/,
                                                      const FF& scaling_factor)
{
    // DOUBLE_X / ADD_X are length 6. Other subrelations use narrower accumulators.
    using Acc6 = typename std::tuple_element_t<Base::DOUBLE_X, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Acc6>;
    using Acc5 = typename std::tuple_element_t<Base::DOUBLE_Y, ContainerOverSubrelations>;
    using Acc4 = typename std::tuple_element_t<Base::D_PROPAGATE_X, ContainerOverSubrelations>;

    const auto Tx = View(in.precompute_tx);
    const auto Tx_shift = View(in.precompute_tx_shift);
    const auto Ty = View(in.precompute_ty);
    const auto Ty_shift = View(in.precompute_ty_shift);
    const auto Dx = View(in.precompute_dx);
    const auto Dx_shift = View(in.precompute_dx_shift);
    const auto Dy = View(in.precompute_dy);
    const auto Dy_shift = View(in.precompute_dy_shift);
    const auto precompute_point_transition = View(in.precompute_point_transition);
    const auto lagrange_first = View(in.lagrange_first);

    // Doubling intermediates kept in coefficient basis.
    const auto two_x = Tx + Tx;
    const auto three_x = two_x + Tx;
    const auto two_y = Ty + Ty;
    const auto Dx_plus_two_x = Dx + two_x;
    const auto Ty_plus_Dy = Ty + Dy;
    const auto Dx_minus_Tx = Dx - Tx;

    const auto three_xx = Tx * three_x;
    const auto four_yy = two_y.sqr();

    // DOUBLE_X is deg 5 — use Acc6. nine_xxxx = three_xx.sqr() needs degree 4, so compute as Acc6 and reuse.
    const auto three_xx_acc6 = Acc6(three_xx);
    const auto nine_xxxx_acc6 = three_xx_acc6.sqr();
    const auto x_double_check_acc6 = Acc6(Dx_plus_two_x) * Acc6(four_yy) - nine_xxxx_acc6;
    const auto scaled_transition_acc6 = Acc6(precompute_point_transition * scaling_factor);
    std::get<Base::DOUBLE_X>(accumulator) += scaled_transition_acc6 * x_double_check_acc6;

    // DOUBLE_Y is deg 4 — use Acc5.
    const auto y_double_check_acc5 = Acc5(Ty_plus_Dy) * Acc5(two_y) + Acc5(three_xx) * Acc5(Dx_minus_Tx);
    const auto scaled_transition_acc5 = Acc5(precompute_point_transition * scaling_factor);
    std::get<Base::DOUBLE_Y>(accumulator) += scaled_transition_acc5 * y_double_check_acc5;

    // D_PROPAGATE_*: deg 3, length 4.
    const auto not_first = -lagrange_first + FF(1);
    const auto not_transition = -precompute_point_transition + FF(1);
    const auto scaled_inactive_factor_acc4 = Acc4((not_first * not_transition) * scaling_factor);
    std::get<Base::D_PROPAGATE_X>(accumulator) += scaled_inactive_factor_acc4 * Acc4(Dx - Dx_shift);
    std::get<Base::D_PROPAGATE_Y>(accumulator) += scaled_inactive_factor_acc4 * Acc4(Dy - Dy_shift);

    // Addition: T = T_shift + D when not at transition.
    const auto& x1 = Tx_shift;
    const auto& y1 = Ty_shift;
    const auto& x2 = Dx;
    const auto& y2 = Dy;
    const auto& x3 = Tx;
    const auto& y3 = Ty;
    const auto lambda_numerator = y2 - y1;
    const auto lambda_denominator = x2 - x1;
    const auto x3_x2_x1 = (x3 + x2) + x1;
    const auto y3_plus_y1 = y3 + y1;
    const auto x3_minus_x1 = x3 - x1;

    // ADD_X: deg 5, length 6.
    const auto scaled_inactive_factor_acc6 = Acc6((not_first * not_transition) * scaling_factor);
    const auto x_add_check_acc6 = Acc6(x3_x2_x1) * Acc6(lambda_denominator.sqr()) - Acc6(lambda_numerator.sqr());
    std::get<Base::ADD_X>(accumulator) += scaled_inactive_factor_acc6 * x_add_check_acc6;

    // ADD_Y: deg 4, length 5.
    const auto scaled_inactive_factor_acc5 = Acc5((not_first * not_transition) * scaling_factor);
    const auto y_add_check_acc5 =
        Acc5(y3_plus_y1) * Acc5(lambda_denominator) + Acc5(x3_minus_x1) * Acc5(lambda_numerator);
    std::get<Base::ADD_Y>(accumulator) += scaled_inactive_factor_acc5 * y_add_check_acc5;
}

} // namespace bb

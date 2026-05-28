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
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;

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

    // Doubling: x_double_check = (Dx + 2*Tx) * (2*Ty)^2 - (3*Tx^2)^2
    //           y_double_check = (Ty + Dy) * (2*Ty) + (3*Tx^2) * (Dx - Tx)
    const auto two_x = Tx + Tx;
    const auto three_x = two_x + Tx;
    const auto two_y = Ty + Ty;
    const auto Dx_plus_two_x = Dx + two_x;
    const auto Ty_plus_Dy = Ty + Dy;
    const auto Dx_minus_Tx = Dx - Tx;

    // Degree-2 results stay in coefficient basis until promoted.
    const auto three_xx = Tx * three_x;
    const auto four_yy = two_y.sqr();

    const auto three_xx_acc = Accumulator(three_xx);
    const auto nine_xxxx_acc = three_xx_acc.sqr();

    const auto x_double_check = Accumulator(Dx_plus_two_x) * Accumulator(four_yy) - nine_xxxx_acc;
    const auto y_double_check = Accumulator(Ty_plus_Dy) * Accumulator(two_y) + three_xx_acc * Accumulator(Dx_minus_Tx);

    const auto scaled_transition = Accumulator(precompute_point_transition * scaling_factor);
    std::get<Base::DOUBLE_X>(accumulator) += scaled_transition * x_double_check;
    std::get<Base::DOUBLE_Y>(accumulator) += scaled_transition * y_double_check;

    // (1 - lagrange_first) * (1 - precompute_point_transition) * scaling_factor folded in coefficient basis.
    const auto not_first = -lagrange_first + FF(1);
    const auto not_transition = -precompute_point_transition + FF(1);
    const auto scaled_inactive_factor = Accumulator((not_first * not_transition) * scaling_factor);

    std::get<Base::D_PROPAGATE_X>(accumulator) += scaled_inactive_factor * Accumulator(Dx - Dx_shift);
    std::get<Base::D_PROPAGATE_Y>(accumulator) += scaled_inactive_factor * Accumulator(Dy - Dy_shift);

    // Addition (when not at transition): T = T_shift + D.
    //   x_add_check = (x3 + x2 + x1) * (x2 - x1)^2 - (y2 - y1)^2
    //   y_add_check = (y3 + y1) * (x2 - x1) + (x3 - x1) * (y2 - y1)
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

    const auto x_add_check =
        Accumulator(x3_x2_x1) * Accumulator(lambda_denominator.sqr()) - Accumulator(lambda_numerator.sqr());
    const auto y_add_check = Accumulator(y3_plus_y1) * Accumulator(lambda_denominator) +
                             Accumulator(x3_minus_x1) * Accumulator(lambda_numerator);

    std::get<Base::ADD_X>(accumulator) += scaled_inactive_factor * x_add_check;
    std::get<Base::ADD_Y>(accumulator) += scaled_inactive_factor * y_add_check;
}

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "ecc_point_table_relation.hpp"

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "ecc_point_table_relation_impl.hpp"

namespace bb {

/**
 * @brief ECCVMPointTableRelationImpl
 * @details These relations define the set of point lookup tables we will use in `ecc_msm_relation.hpp`, to evaluate
 * multiscalar multiplication. For every point [P] = (Px, Py) involved in an MSM, we need to do define a lookup
 * table out of the following points: { -15[P], -13[P], -11[P], -9[P], -7[P], -5[P], -3[P], -[P] }
 * ECCVMPointTableRelationImpl defines relations that define the lookup table.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMPointTableRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                 const AllEntities& in,
                                                 const Parameters& /*unused*/,
                                                 const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    const auto& Tx = View(in.precompute_tx);
    const auto& Tx_shift = View(in.precompute_tx_shift);
    const auto& Ty = View(in.precompute_ty);
    const auto& Ty_shift = View(in.precompute_ty_shift);
    const auto& Dx = View(in.precompute_dx);
    const auto& Dx_shift = View(in.precompute_dx_shift);
    const auto& Dy = View(in.precompute_dy);
    const auto& Dy_shift = View(in.precompute_dy_shift);
    const auto& precompute_point_transition = View(in.precompute_point_transition);
    const auto& lagrange_first = View(in.lagrange_first);

    /**
     * @brief Row structure (8-wide: 2 precomputed points per row, 4 rows per scalar)
     *
     * Consider the set of (128-bit scalar multiplier, point, pc) tuples in the transcript columns.
     * The point table columns process one tuple every 4 rows. The tuple with the largest pc value is first.
     * When transitioning between tuple elements, pc decrements by 1.
     *
     * Each row stores two precomputed points:
     *   (Tx, Ty)   = table[15 - 2*round]   (first point, odd table index)
     *   (Tx2, Ty2) = table[14 - 2*round]   (second point, even table index)
     *
     * | pc | transition | round | Tx    | Ty    | Tx2   | Ty2   | Dx   | Dy   |
     * | -- | ---------- | ----- | ----- | ----- | ----- | ----- | ---- | ---- |
     * | 1  | 0          | 0     | 15P.x | 15P.y | 13P.x | 13P.y | 2P.x | 2P.y |
     * | 1  | 0          | 1     | 11P.x | 11P.y |  9P.x |  9P.y | 2P.x | 2P.y |
     * | 1  | 0          | 2     |  7P.x |  7P.y |  5P.x |  5P.y | 2P.x | 2P.y |
     * | 1  | 1          | 3     |  3P.x |  3P.y |    P.x |   P.y | 2P.x | 2P.y |
     *
     * We apply the following relations:
     * 1. If precompute_point_transition = 1, (Dx, Dy) = 2(Tx2, Ty2) [doubling at transition, Tx2=P at last row]
     * 2. If precompute_point_transition = 0, (Dx, Dy) = (Dx_shift, Dy_shift) [continuity]
     * 3. (Tx, Ty) = (Tx2, Ty2) + (Dx, Dy) [intra-row: first point = second point + 2P]
     * 4. If precompute_point_transition = 0, (Tx2, Ty2) = (Tx_shift, Ty_shift) + (Dx, Dy)
     *    [inter-row: second point = next row's first point + 2P]
     */

    const auto& Tx2 = View(in.precompute_tx2);
    const auto& Ty2 = View(in.precompute_ty2);

    /**
     * @brief Validate Dx, Dy correctness (doubling relation)
     *
     * When precompute_point_transition = 1, the current row is the last row for this point.
     * At the last row (round=3), Tx2 = P (the base point). So (Dx, Dy) = 2(Tx2, Ty2) = 2P.
     *
     * Double formula (for curve a=0, using 3x^2 shortcut since a=0 => slope = 3x^2/(2y)):
     * x_3 = 9x^4 / 4y^2 - 2x
     * y_3 = (3x^2 / 2y) * (x - x_3) - y
     *
     * Expanding into relations:
     * (x_3 + 2x) * 4y^2 - 9x^4 = 0
     * (y3 + y) * 2y - 3x^2 * (x - x_3) = 0
     */
    auto two_x2 = Tx2 + Tx2;
    auto three_x2 = two_x2 + Tx2;
    auto three_x2x2 = Tx2 * three_x2;
    auto nine_x2x2x2x2 = three_x2x2.sqr();
    auto two_y2 = Ty2 + Ty2;
    auto four_y2y2 = two_y2.sqr();
    auto x_double_check = (Dx + two_x2) * four_y2y2 - nine_x2x2x2x2;
    auto y_double_check = (Ty2 + Dy) * two_y2 + three_x2x2 * (Dx - Tx2);
    std::get<0>(accumulator) += precompute_point_transition * x_double_check * scaling_factor;
    std::get<1>(accumulator) += precompute_point_transition * y_double_check * scaling_factor;

    /**
     * @brief If precompute_point_transition = 0, (Dx_shift, Dy_shift) = (Dx, Dy) [continuity]
     * 1st row is empty => don't apply if lagrange_first == 1
     */
    std::get<2>(accumulator) +=
        (-lagrange_first + 1) * (-precompute_point_transition + 1) * (Dx - Dx_shift) * scaling_factor;
    std::get<3>(accumulator) +=
        (-lagrange_first + 1) * (-precompute_point_transition + 1) * (Dy - Dy_shift) * scaling_factor;

    /**
     * @brief Intra-row addition: (Tx, Ty) = (Tx2, Ty2) + (Dx, Dy)
     *
     * The first precomputed point = second precomputed point + 2P.
     * E.g., at round 0: 15P = 13P + 2P.
     *
     * This is gated by precompute_select (active when processing a scalar).
     *
     * Add formula (denominator form):
     * (x_3 + x_2 + x_1) * (x_2 - x_1)^2 - (y_2 - y_1)^2 = 0
     * (y_3 + y_1) * (x_2 - x_1) + (x_3 - x_1) * (y_2 - y_1) = 0
     */
    {
        const auto& precompute_select = View(in.precompute_select);
        const auto lambda_num_intra = Dy - Ty2;
        const auto lambda_den_intra = Dx - Tx2;
        auto x_add_check_intra = (Tx + Dx + Tx2) * lambda_den_intra.sqr() - lambda_num_intra.sqr();
        auto y_add_check_intra = (Ty + Ty2) * lambda_den_intra + (Tx - Tx2) * lambda_num_intra;
        std::get<4>(accumulator) += precompute_select * x_add_check_intra * scaling_factor;
        std::get<5>(accumulator) += precompute_select * y_add_check_intra * scaling_factor;
    }

    /**
     * @brief Inter-row addition: (Tx2, Ty2) = (Tx_shift, Ty_shift) + (Dx, Dy)
     *
     * The second precomputed point of row i = first precomputed point of row i+1 + 2P.
     * E.g., row 0 Tx2 = 13P = row 1 Tx (11P) + 2P.
     *
     * Gated by: not first row, not transition (same as old inter-row constraint).
     */
    {
        const auto lambda_num_inter = Dy - Ty_shift;
        const auto lambda_den_inter = Dx - Tx_shift;
        auto x_add_check_inter = (Tx2 + Dx + Tx_shift) * lambda_den_inter.sqr() - lambda_num_inter.sqr();
        auto y_add_check_inter = (Ty2 + Ty_shift) * lambda_den_inter + (Tx2 - Tx_shift) * lambda_num_inter;
        std::get<6>(accumulator) +=
            (-lagrange_first + 1) * (-precompute_point_transition + 1) * x_add_check_inter * scaling_factor;
        std::get<7>(accumulator) +=
            (-lagrange_first + 1) * (-precompute_point_transition + 1) * y_add_check_inter * scaling_factor;
    }
}

} // namespace bb

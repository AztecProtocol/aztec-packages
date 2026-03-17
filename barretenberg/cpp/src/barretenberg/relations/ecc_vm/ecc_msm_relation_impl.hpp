// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "ecc_msm_relation.hpp"

namespace bb {

/**
 * @brief MSM relations that evaluate the Strauss multiscalar multiplication algorithm.
 *
 * @details
 * The Straus algorithm for a size-k MSM takes scalars/points (a_i, [P_i]) for i = 0 to k-1.
 * The specific algorithm we use may be found [here](../../eccvm/README.md). We briefly reprise the
 * algorithm nonetheless.
 *
 * PHASE 1: Precomputation (performed in ecc_wnaf_relation.hpp, ecc_point_table_relation.hpp)
 * Each scalar a_i is split into 4-bit WNAF slices a_{j, i} for j = 0 to 31, and a skew bool skew_i
 * For each point [P_i] a size-16 lookup table of points, T_i, is computed { [-15 P_i], [-13 P_i], ..., [15 P_i] }
 *
 * PHASE 2: MSM evaluation
 * MSM evaluation is split into 32 rounds that operate on an accumulator point [Acc]
 * The first 31 rounds are composed of an ADDITION round and a DOUBLE round.
 * The final 32nd round is composed of an ADDITION round and a SKEW round.
 *
 * ADDITION round (round = j):
 * [Acc] = [Acc] + T_i[a_{i, j}] for all i in [0, ... k-1]
 * (up to 8 additions per ECCVM row)
 *
 * DOUBLE round:
 * [Acc] = 16 * [Acc] (four point doublings, using lambda1..lambda4)
 *
 * SKEW round:
 * If skew_i == 1, [Acc] = [Acc] - [P_i] for all i in [0, ..., k - 1]
 *
 * The relations in ECCVMMSMRelationImpl constrain the ADDITION, DOUBLE and SKEW rounds
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMMSMRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                          const AllEntities& in,
                                          const Parameters& /*unused*/,
                                          const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    // Point coordinates for 8 additions per row
    const auto& x1 = View(in.msm_x1);
    const auto& y1 = View(in.msm_y1);
    const auto& x2 = View(in.msm_x2);
    const auto& y2 = View(in.msm_y2);
    const auto& x3 = View(in.msm_x3);
    const auto& y3 = View(in.msm_y3);
    const auto& x4 = View(in.msm_x4);
    const auto& y4 = View(in.msm_y4);
    const auto& x5 = View(in.msm_x5);
    const auto& y5 = View(in.msm_y5);
    const auto& x6 = View(in.msm_x6);
    const auto& y6 = View(in.msm_y6);
    const auto& x7 = View(in.msm_x7);
    const auto& y7 = View(in.msm_y7);
    const auto& x8 = View(in.msm_x8);
    const auto& y8 = View(in.msm_y8);
    // Collision inverses
    const auto& collision_inverse1 = View(in.msm_collision_x1);
    const auto& collision_inverse2 = View(in.msm_collision_x2);
    const auto& collision_inverse3 = View(in.msm_collision_x3);
    const auto& collision_inverse4 = View(in.msm_collision_x4);
    const auto& collision_inverse5 = View(in.msm_collision_x5);
    const auto& collision_inverse6 = View(in.msm_collision_x6);
    const auto& collision_inverse7 = View(in.msm_collision_x7);
    const auto& collision_inverse8 = View(in.msm_collision_x8);
    // Lambdas (slopes). lambda1..4 used for both additions and doublings.
    // lambda5..8 used only for additions 5-8.
    const auto& lambda1 = View(in.msm_lambda1);
    const auto& lambda2 = View(in.msm_lambda2);
    const auto& lambda3 = View(in.msm_lambda3);
    const auto& lambda4 = View(in.msm_lambda4);
    const auto& lambda5 = View(in.msm_lambda5);
    const auto& lambda6 = View(in.msm_lambda6);
    const auto& lambda7 = View(in.msm_lambda7);
    const auto& lambda8 = View(in.msm_lambda8);
    const auto& lagrange_first = View(in.lagrange_first);
    // Add selectors
    const auto& add1 = View(in.msm_add1);
    const auto& add1_shift = View(in.msm_add1_shift);
    const auto& add2 = View(in.msm_add2);
    const auto& add3 = View(in.msm_add3);
    const auto& add4 = View(in.msm_add4);
    const auto& add5 = View(in.msm_add5);
    const auto& add6 = View(in.msm_add6);
    const auto& add7 = View(in.msm_add7);
    const auto& add8 = View(in.msm_add8);
    // Accumulator
    const auto& acc_x = View(in.msm_accumulator_x);
    const auto& acc_y = View(in.msm_accumulator_y);
    const auto& acc_x_shift = View(in.msm_accumulator_x_shift);
    const auto& acc_y_shift = View(in.msm_accumulator_y_shift);
    // Slices
    const auto& slice1 = View(in.msm_slice1);
    const auto& slice2 = View(in.msm_slice2);
    const auto& slice3 = View(in.msm_slice3);
    const auto& slice4 = View(in.msm_slice4);
    const auto& slice5 = View(in.msm_slice5);
    const auto& slice6 = View(in.msm_slice6);
    const auto& slice7 = View(in.msm_slice7);
    const auto& slice8 = View(in.msm_slice8);
    // Control signals
    const auto& msm_transition = View(in.msm_transition);
    const auto& msm_transition_shift = View(in.msm_transition_shift);
    const auto& round = View(in.msm_round);
    const auto& round_shift = View(in.msm_round_shift);
    const auto& q_add = View(in.msm_add);
    const auto& q_add_shift = View(in.msm_add_shift);
    const auto& q_skew = View(in.msm_skew);
    const auto& q_skew_shift = View(in.msm_skew_shift);
    const auto& q_double = View(in.msm_double);
    const auto& q_double_shift = View(in.msm_double_shift);
    const auto& msm_size = View(in.msm_size_of_msm);
    const auto& pc = View(in.msm_pc);
    const auto& pc_shift = View(in.msm_pc_shift);
    const auto& count = View(in.msm_count);
    const auto& count_shift = View(in.msm_count_shift);
    auto is_not_first_row = (-lagrange_first + 1);

    // ========================================================================
    // Addition helper: conditional add of (xb, yb) into (xa, ya)
    // ========================================================================
    auto add = [&](auto& xb, auto& yb, auto& xa, auto& ya, auto& lambda, auto& selector, auto& collision_relation) {
        auto slope_relation = selector * (lambda * (xb - xa - 1) - (yb - ya)) + lambda;
        collision_relation += selector * (xb - xa);
        auto x_out = lambda.sqr() + (-xb - xa - xa) * selector + xa;
        auto y_out = lambda * (xa - x_out) + (-ya - ya) * selector + ya;
        return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
    };

    // ========================================================================
    // First Addition: handles MSM start (offset generator) vs continuation
    // ========================================================================
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

    // ========================================================================
    // ADDITION chain (8 additions per row)
    // ========================================================================
    Accumulator x1_collision_relation(0);
    Accumulator x2_collision_relation(0);
    Accumulator x3_collision_relation(0);
    Accumulator x4_collision_relation(0);
    Accumulator x5_collision_relation(0);
    Accumulator x6_collision_relation(0);
    Accumulator x7_collision_relation(0);
    Accumulator x8_collision_relation(0);

    auto [x_t1, y_t1, add_slope_relation1] =
        first_add(acc_x, acc_y, x1, y1, lambda1, msm_transition, x1_collision_relation);
    auto [x_t2, y_t2, add_slope_relation2] = add(x2, y2, x_t1, y_t1, lambda2, add2, x2_collision_relation);
    auto [x_t3, y_t3, add_slope_relation3] = add(x3, y3, x_t2, y_t2, lambda3, add3, x3_collision_relation);
    auto [x_t4, y_t4, add_slope_relation4] = add(x4, y4, x_t3, y_t3, lambda4, add4, x4_collision_relation);
    auto [x_t5, y_t5, add_slope_relation5] = add(x5, y5, x_t4, y_t4, lambda5, add5, x5_collision_relation);
    auto [x_t6, y_t6, add_slope_relation6] = add(x6, y6, x_t5, y_t5, lambda6, add6, x6_collision_relation);
    auto [x_t7, y_t7, add_slope_relation7] = add(x7, y7, x_t6, y_t6, lambda7, add7, x7_collision_relation);
    auto [x_t8, y_t8, add_slope_relation8] = add(x8, y8, x_t7, y_t7, lambda8, add8, x8_collision_relation);

    // Validate accumulator output matches ADD output if q_add = 1
    std::get<0>(accumulator) += q_add * (acc_x_shift - x_t8) * scaling_factor;
    std::get<1>(accumulator) += q_add * (acc_y_shift - y_t8) * scaling_factor;
    // Validate slope relations for each addition separately to prevent cancellation attacks
    std::get<2>(accumulator) += q_add * add_slope_relation1 * scaling_factor;
    std::get<36>(accumulator) += q_add * add_slope_relation2 * scaling_factor;
    std::get<37>(accumulator) += q_add * add_slope_relation3 * scaling_factor;
    std::get<38>(accumulator) += q_add * add_slope_relation4 * scaling_factor;
    std::get<47>(accumulator) += q_add * add_slope_relation5 * scaling_factor;
    std::get<48>(accumulator) += q_add * add_slope_relation6 * scaling_factor;
    std::get<49>(accumulator) += q_add * add_slope_relation7 * scaling_factor;
    std::get<50>(accumulator) += q_add * add_slope_relation8 * scaling_factor;

    // ========================================================================
    // DOUBLING chain (4 doublings per row, using lambda1..4)
    // ========================================================================
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
    std::get<10>(accumulator) += q_double * (acc_x_shift - x_d4) * scaling_factor;
    std::get<11>(accumulator) += q_double * (acc_y_shift - y_d4) * scaling_factor;
    std::get<12>(accumulator) += q_double * double_slope_relation1 * scaling_factor;
    std::get<39>(accumulator) += q_double * double_slope_relation2 * scaling_factor;
    std::get<40>(accumulator) += q_double * double_slope_relation3 * scaling_factor;
    std::get<41>(accumulator) += q_double * double_slope_relation4 * scaling_factor;

    // ========================================================================
    // SKEW chain (8 conditional additions per row)
    // ========================================================================
    static FF inverse_seven = FF(7).invert();
    auto skew1_select = slice1 * inverse_seven;
    auto skew2_select = slice2 * inverse_seven;
    auto skew3_select = slice3 * inverse_seven;
    auto skew4_select = slice4 * inverse_seven;
    auto skew5_select = slice5 * inverse_seven;
    auto skew6_select = slice6 * inverse_seven;
    auto skew7_select = slice7 * inverse_seven;
    auto skew8_select = slice8 * inverse_seven;
    Accumulator x1_skew_collision_relation(0);
    Accumulator x2_skew_collision_relation(0);
    Accumulator x3_skew_collision_relation(0);
    Accumulator x4_skew_collision_relation(0);
    Accumulator x5_skew_collision_relation(0);
    Accumulator x6_skew_collision_relation(0);
    Accumulator x7_skew_collision_relation(0);
    Accumulator x8_skew_collision_relation(0);

    auto [x_s1, y_s1, skew_slope_relation1] =
        add(x1, y1, acc_x, acc_y, lambda1, skew1_select, x1_skew_collision_relation);
    auto [x_s2, y_s2, skew_slope_relation2] =
        add(x2, y2, x_s1, y_s1, lambda2, skew2_select, x2_skew_collision_relation);
    auto [x_s3, y_s3, skew_slope_relation3] =
        add(x3, y3, x_s2, y_s2, lambda3, skew3_select, x3_skew_collision_relation);
    auto [x_s4, y_s4, skew_slope_relation4] =
        add(x4, y4, x_s3, y_s3, lambda4, skew4_select, x4_skew_collision_relation);
    auto [x_s5, y_s5, skew_slope_relation5] =
        add(x5, y5, x_s4, y_s4, lambda5, skew5_select, x5_skew_collision_relation);
    auto [x_s6, y_s6, skew_slope_relation6] =
        add(x6, y6, x_s5, y_s5, lambda6, skew6_select, x6_skew_collision_relation);
    auto [x_s7, y_s7, skew_slope_relation7] =
        add(x7, y7, x_s6, y_s6, lambda7, skew7_select, x7_skew_collision_relation);
    auto [x_s8, y_s8, skew_slope_relation8] =
        add(x8, y8, x_s7, y_s7, lambda8, skew8_select, x8_skew_collision_relation);

    // Validate accumulator output matches SKEW output if q_skew = 1
    std::get<3>(accumulator) += q_skew * (acc_x_shift - x_s8) * scaling_factor;
    std::get<4>(accumulator) += q_skew * (acc_y_shift - y_s8) * scaling_factor;
    std::get<5>(accumulator) += q_skew * skew_slope_relation1 * scaling_factor;
    std::get<42>(accumulator) += q_skew * skew_slope_relation2 * scaling_factor;
    std::get<43>(accumulator) += q_skew * skew_slope_relation3 * scaling_factor;
    std::get<44>(accumulator) += q_skew * skew_slope_relation4 * scaling_factor;
    std::get<51>(accumulator) += q_skew * skew_slope_relation5 * scaling_factor;
    std::get<52>(accumulator) += q_skew * skew_slope_relation6 * scaling_factor;
    std::get<53>(accumulator) += q_skew * skew_slope_relation7 * scaling_factor;
    std::get<54>(accumulator) += q_skew * skew_slope_relation8 * scaling_factor;

    // ========================================================================
    // Collision checks (x-coordinates must differ for all 8 additions)
    // ========================================================================
    const auto add_first_point = add1 * q_add + q_skew * skew1_select;
    const auto add_second_point = add2 * q_add + q_skew * skew2_select;
    const auto add_third_point = add3 * q_add + q_skew * skew3_select;
    const auto add_fourth_point = add4 * q_add + q_skew * skew4_select;
    const auto add_fifth_point = add5 * q_add + q_skew * skew5_select;
    const auto add_sixth_point = add6 * q_add + q_skew * skew6_select;
    const auto add_seventh_point = add7 * q_add + q_skew * skew7_select;
    const auto add_eighth_point = add8 * q_add + q_skew * skew8_select;

    const auto x1_delta = x1_skew_collision_relation * q_skew + x1_collision_relation * q_add;
    const auto x2_delta = x2_skew_collision_relation * q_skew + x2_collision_relation * q_add;
    const auto x3_delta = x3_skew_collision_relation * q_skew + x3_collision_relation * q_add;
    const auto x4_delta = x4_skew_collision_relation * q_skew + x4_collision_relation * q_add;
    const auto x5_delta = x5_skew_collision_relation * q_skew + x5_collision_relation * q_add;
    const auto x6_delta = x6_skew_collision_relation * q_skew + x6_collision_relation * q_add;
    const auto x7_delta = x7_skew_collision_relation * q_skew + x7_collision_relation * q_add;
    const auto x8_delta = x8_skew_collision_relation * q_skew + x8_collision_relation * q_add;

    std::get<6>(accumulator) += (x1_delta * collision_inverse1 - add_first_point) * scaling_factor;
    std::get<7>(accumulator) += (x2_delta * collision_inverse2 - add_second_point) * scaling_factor;
    std::get<8>(accumulator) += (x3_delta * collision_inverse3 - add_third_point) * scaling_factor;
    std::get<9>(accumulator) += (x4_delta * collision_inverse4 - add_fourth_point) * scaling_factor;
    std::get<55>(accumulator) += (x5_delta * collision_inverse5 - add_fifth_point) * scaling_factor;
    std::get<56>(accumulator) += (x6_delta * collision_inverse6 - add_sixth_point) * scaling_factor;
    std::get<57>(accumulator) += (x7_delta * collision_inverse7 - add_seventh_point) * scaling_factor;
    std::get<58>(accumulator) += (x8_delta * collision_inverse8 - add_eighth_point) * scaling_factor;

    // ========================================================================
    // When add_i = 0, force slice_i to also be 0
    // ========================================================================
    std::get<13>(accumulator) += (-add1 + 1) * slice1 * scaling_factor;
    std::get<14>(accumulator) += (-add2 + 1) * slice2 * scaling_factor;
    std::get<15>(accumulator) += (-add3 + 1) * slice3 * scaling_factor;
    std::get<16>(accumulator) += (-add4 + 1) * slice4 * scaling_factor;
    std::get<59>(accumulator) += (-add5 + 1) * slice5 * scaling_factor;
    std::get<60>(accumulator) += (-add6 + 1) * slice6 * scaling_factor;
    std::get<61>(accumulator) += (-add7 + 1) * slice7 * scaling_factor;
    std::get<62>(accumulator) += (-add8 + 1) * slice8 * scaling_factor;

    // ========================================================================
    // SELECTORS ARE MUTUALLY EXCLUSIVE
    // ========================================================================
    std::get<17>(accumulator) += (q_add * q_double + q_add * q_skew + q_double * q_skew) * scaling_factor;

    // ========================================================================
    // ACCUMULATOR PRESERVATION ON NO-OP ROWS
    // ========================================================================
    auto no_op_selector =
        (-q_add + 1) * (-q_double + 1) * (-q_skew + 1) * (-msm_transition + 1) * (-lagrange_first + 1);
    std::get<45>(accumulator) += no_op_selector * (acc_x_shift - acc_x) * scaling_factor;
    std::get<46>(accumulator) += no_op_selector * (acc_y_shift - acc_y) * scaling_factor;

    // ========================================================================
    // add1 = q_add + q_skew
    // ========================================================================
    std::get<32>(accumulator) += (add1 - q_add - q_skew) * scaling_factor;

    // ========================================================================
    // ROUND TRANSITION LOGIC
    // ========================================================================
    const auto round_delta = round_shift - round;
    const auto round_transition = round_delta * (-msm_transition_shift + 1);
    std::get<18>(accumulator) += round_transition * (round_delta - 1) * scaling_factor;

    std::get<19>(accumulator) += round_transition * q_skew_shift * (round - 31) * scaling_factor;
    std::get<20>(accumulator) += round_transition * (q_skew_shift + q_double_shift - 1) * scaling_factor;
    std::get<35>(accumulator) += (-round_delta + 1) * q_double_shift * scaling_factor;
    std::get<21>(accumulator) += round_transition * (-q_double_shift + 1) * (-q_skew_shift + 1) * scaling_factor;

    // ========================================================================
    // CONSTRAINING Q_DOUBLE AND Q_SKEW
    // ========================================================================
    std::get<22>(accumulator) += q_double * (-q_add_shift + 1) * scaling_factor;
    std::get<33>(accumulator) += (-msm_transition_shift + 1) * q_skew * (-q_skew_shift + 1) * scaling_factor;
    std::get<34>(accumulator) += q_skew * (-round + 32) * scaling_factor;

    // ========================================================================
    // UPDATING THE COUNT (now sums 8 add selectors)
    // ========================================================================
    std::get<23>(accumulator) += round_delta * count_shift * scaling_factor;
    std::get<24>(accumulator) += (-msm_transition_shift + 1) * (-round_delta + 1) *
                                 (count_shift - count - add1 - add2 - add3 - add4 - add5 - add6 - add7 - add8) *
                                 scaling_factor;

    std::get<25>(accumulator) +=
        is_not_first_row * (-msm_transition_shift + 1) * round_delta * count_shift * scaling_factor;

    // if msm_transition = 1, then round = 0.
    std::get<26>(accumulator) += msm_transition * round * scaling_factor;

    // if msm_transition_shift = 1, pc = pc_shift + msm_size
    std::get<27>(accumulator) += is_not_first_row * msm_transition_shift * (msm_size + pc_shift - pc) * scaling_factor;

    // ========================================================================
    // Addition continuity checks (extended from 4 to 8)
    // ========================================================================
    std::get<28>(accumulator) += add2 * (-add1 + 1) * scaling_factor;
    std::get<29>(accumulator) += add3 * (-add2 + 1) * scaling_factor;
    std::get<30>(accumulator) += add4 * (-add3 + 1) * scaling_factor;
    std::get<63>(accumulator) += add5 * (-add4 + 1) * scaling_factor;
    std::get<64>(accumulator) += add6 * (-add5 + 1) * scaling_factor;
    std::get<65>(accumulator) += add7 * (-add6 + 1) * scaling_factor;
    std::get<66>(accumulator) += add8 * (-add7 + 1) * scaling_factor;

    // Cross-row continuity: if add8 = 0 on current row, add1 = 0 on next row (within same phase)
    std::get<31>(accumulator) +=
        (q_add * q_add_shift + q_skew * q_skew_shift) * (-add8 + 1) * add1_shift * scaling_factor;
}

} // namespace bb

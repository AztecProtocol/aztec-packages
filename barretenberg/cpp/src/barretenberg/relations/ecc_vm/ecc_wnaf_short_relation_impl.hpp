// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_wnaf_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMWnafShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                const AllEntities& in,
                                                const Parameters& /*unused*/,
                                                const FF& scaling_factor)
{
    // Universal "deepest" accumulator type used by the deg-4 subrelations (RANGE_S* and FIRST_SLICE_POSITIVE).
    // Smaller subrelations construct their own narrower Accumulator (Acc4 / Acc3) via tuple_element_t<INDEX, ...>.
    using Accumulator = typename std::tuple_element_t<Base::RANGE_S1HI, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;
    using Acc4 = typename std::tuple_element_t<Base::SCALAR_SUM_CHECK, ContainerOverSubrelations>;
    using Acc3 = typename std::tuple_element_t<Base::INACTIVE_SLICE_W0, ContainerOverSubrelations>;

    const auto lagrange_first = View(in.lagrange_first);
    const auto scalar_sum = View(in.precompute_scalar_sum);
    const auto scalar_sum_shift = View(in.precompute_scalar_sum_shift);
    const auto q_transition = View(in.precompute_point_transition);
    const auto round = View(in.precompute_round);
    const auto round_shift = View(in.precompute_round_shift);
    const auto pc = View(in.precompute_pc);
    const auto pc_shift = View(in.precompute_pc_shift);
    const auto precompute_select = View(in.precompute_select);
    const auto precompute_select_shift = View(in.precompute_select_shift);
    const auto precompute_skew = View(in.precompute_skew);

    const std::array<View, 8> slices{
        View(in.precompute_s1hi), View(in.precompute_s1lo), View(in.precompute_s2hi), View(in.precompute_s2lo),
        View(in.precompute_s3hi), View(in.precompute_s3lo), View(in.precompute_s4hi), View(in.precompute_s4lo),
    };

    // Range checks ((s-1)^2 - 1) * ((s-2)^2 - 1) * scaling_factor — degree 4, length 5.
    const auto range_check_scaled = [scaling_factor](const View& s, auto& acc) {
        const auto s_minus_1 = s - FF(1);
        const auto s_minus_2 = s - FF(2);
        const auto term1 = s_minus_1.sqr() - FF(1); // length 3
        const auto term2 = s_minus_2.sqr() - FF(1); // length 3
        acc += Accumulator(term1) * Accumulator(term2 * scaling_factor);
    };
    range_check_scaled(slices[0], std::get<Base::RANGE_S1HI>(accumulator));
    range_check_scaled(slices[1], std::get<Base::RANGE_S1LO>(accumulator));
    range_check_scaled(slices[2], std::get<Base::RANGE_S2HI>(accumulator));
    range_check_scaled(slices[3], std::get<Base::RANGE_S2LO>(accumulator));
    range_check_scaled(slices[4], std::get<Base::RANGE_S3HI>(accumulator));
    range_check_scaled(slices[5], std::get<Base::RANGE_S3LO>(accumulator));
    range_check_scaled(slices[6], std::get<Base::RANGE_S4HI>(accumulator));
    range_check_scaled(slices[7], std::get<Base::RANGE_S4LO>(accumulator));

    const auto convert_to_wnaf = [](const View& hi, const View& lo) {
        auto t = hi + hi;
        t += t;
        t += lo;
        return t + t - FF(15);
    };

    const auto scaled_transition_short = q_transition * scaling_factor;       // length 2
    const auto scaled_lagrange_first_short = lagrange_first * scaling_factor; // length 2
    const auto scaled_transition_is_zero_short = -scaled_transition_short + scaling_factor;
    const auto scaled_transition_plus_lagrange_first_short = scaled_transition_short + scaled_lagrange_first_short;

    // FIRST_SLICE_POSITIVE: deg 4, length 5.
    {
        const auto s1hi_shift = View(in.precompute_s1hi_shift);
        const auto s1hi_shift_msb_set = (s1hi_shift - FF(2)) * (s1hi_shift - FF(3));                     // length 3
        const auto first_factor = scaled_transition_plus_lagrange_first_short * precompute_select_shift; // length 3
        std::get<Base::FIRST_SLICE_POSITIVE>(accumulator) +=
            Accumulator(first_factor) * Accumulator(s1hi_shift_msb_set);
    }

    // wNAF digits and row_slice (length 2, shared with INACTIVE_SLICE_W*).
    const auto w0 = convert_to_wnaf(slices[0], slices[1]);
    const auto w1 = convert_to_wnaf(slices[2], slices[3]);
    const auto w2 = convert_to_wnaf(slices[4], slices[5]);
    const auto w3 = convert_to_wnaf(slices[6], slices[7]);

    auto row_slice = w0;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w1;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w2;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w3;

    // SCALAR_SUM_CHECK: deg 3, length 4.
    {
        const auto sum_delta = scalar_sum * FF(1ULL << 16) + row_slice;
        const auto check_sum = scalar_sum_shift - sum_delta;                     // length 2
        const auto factor = precompute_select * scaled_transition_is_zero_short; // length 3
        std::get<Base::SCALAR_SUM_CHECK>(accumulator) += Acc4(factor) * Acc4(check_sum);
    }

    // PRECOMPUTE_SELECT_SHAPE: deg 3, length 4.
    {
        const auto scaled_lagrange_first_minus_one_short = scaled_lagrange_first_short - scaling_factor; // length 2
        const auto precompute_select_check = precompute_select_shift * (precompute_select - FF(1));      // length 3
        std::get<Base::PRECOMPUTE_SELECT_SHAPE>(accumulator) +=
            Acc4(scaled_lagrange_first_minus_one_short) * Acc4(precompute_select_check);
    }

    // ROUND_CHECK: deg 3, length 4.
    {
        const auto round_check = round_shift - round - FF(1);     // length 2
        const auto term_a = round - round_check - FF(7);          // length 2
        const auto term_a_mul = term_a * scaled_transition_short; // length 3
        const auto term_b = round_check * scaling_factor;         // length 2
        const auto inner = term_a_mul + term_b;                   // length 3
        std::get<Base::ROUND_CHECK>(accumulator) += Acc4(precompute_select) * Acc4(inner);
    }

    // ROUND_SHIFT_ZERO / SCALAR_SUM_SHIFT_ZERO: deg 3, length 4.
    const auto precompute_select_transition_plus_lagrange_first_short =
        precompute_select * scaled_transition_short + scaled_lagrange_first_short; // length 3
    std::get<Base::ROUND_SHIFT_ZERO>(accumulator) +=
        Acc4(precompute_select_transition_plus_lagrange_first_short) * Acc4(round_shift);
    std::get<Base::SCALAR_SUM_SHIFT_ZERO>(accumulator) +=
        Acc4(precompute_select_transition_plus_lagrange_first_short) * Acc4(scalar_sum_shift);

    // PC_CHECK: deg 3, length 4.
    {
        const auto pc_delta = pc_shift - pc;                                           // length 2
        const auto inner_a = (-pc_delta - pc_delta - FF(1)) * scaled_transition_short; // length 3
        const auto inner_b = pc_delta * scaling_factor;                                // length 2
        const auto inner = inner_a + inner_b;                                          // length 3
        std::get<Base::PC_CHECK>(accumulator) += Acc4(precompute_select) * Acc4(inner);
    }

    // SKEW_RANGE: deg 3, length 4.
    {
        const auto skew_quadratic = precompute_skew * (precompute_skew - FF(7)); // length 3
        std::get<Base::SKEW_RANGE>(accumulator) += Acc4(precompute_select * scaling_factor) * Acc4(skew_quadratic);
    }

    // Inactive-row enforcement: deg 2, length 3.
    const auto precompute_select_zero_short = -precompute_select * scaling_factor + scaling_factor; // length 2
    std::get<Base::INACTIVE_SLICE_W0>(accumulator) += Acc3(precompute_select_zero_short * (w0 + FF(15)));
    std::get<Base::INACTIVE_SLICE_W1>(accumulator) += Acc3(precompute_select_zero_short * (w1 + FF(15)));
    std::get<Base::INACTIVE_SLICE_W2>(accumulator) += Acc3(precompute_select_zero_short * (w2 + FF(15)));
    std::get<Base::INACTIVE_SLICE_W3>(accumulator) += Acc3(precompute_select_zero_short * (w3 + FF(15)));
    std::get<Base::INACTIVE_ROUND>(accumulator) += Acc3(precompute_select_zero_short * round);
    std::get<Base::INACTIVE_PC>(accumulator) += Acc3(precompute_select_zero_short * pc);
    std::get<Base::INACTIVE_POINT_TRANSITION>(accumulator) += Acc3(precompute_select_zero_short * q_transition);
}

} // namespace bb

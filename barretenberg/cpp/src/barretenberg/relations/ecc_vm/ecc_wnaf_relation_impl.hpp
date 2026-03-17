// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "ecc_wnaf_relation.hpp"

namespace bb {

/**
 * @brief ECCVMWnafRelationImpl evaluates relations that convert scalar multipliers into 4-bit WNAF slices
 * @details Each WNAF slice is a 4-bit slice representing one of 16 integers { -15, -13, ..., 15 }
 * Each WNAF slice is represented via two 2-bit columns (precompute_s1hi, ..., precompute_s8lo)
 * One 128-bit scalar multiplier is processed across 4 rows (8 digits/row), indexed by a round variable.
 *
 * | point_transition | round | slices                          | skew   | scalar_sum                        |
 * | ---------------- | ----- | ------------------------------- | ------ | --------------------------------- |
 * | 0                | 0     | s0,s1,s2,s3,s4,s5,s6,s7        | 0      | 0                                 |
 * | 0                | 1     | s8,s9,s10,s11,s12,s13,s14,s15   | 0      | \sum_{i=0}^7 16^i * s_{7 - i}     |
 * | 0                | 2     | s16,s17,s18,s19,s20,s21,s22,s23 | 0      | \sum_{i=0}^15 16^i * s_{15 - i}   |
 * | 1                | 3     | s24,s25,s26,s27,s28,s29,s30,s31 | s_skew | \sum_{i=0}^23 16^i * s_{23 - i}   |
 *
 * scalar = 2^32 * scalar_sum + 2^28*s24 + ... + s31 - s_skew
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMWnafRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                           const AllEntities& in,
                                           const Parameters& /*unused*/,
                                           const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;
    auto lagrange_first = View(in.lagrange_first);
    auto scalar_sum = View(in.precompute_scalar_sum);
    auto scalar_sum_shift = View(in.precompute_scalar_sum_shift);
    auto q_transition = View(in.precompute_point_transition);
    auto round = View(in.precompute_round);
    auto round_shift = View(in.precompute_round_shift);
    auto pc = View(in.precompute_pc);
    auto pc_shift = View(in.precompute_pc_shift);
    auto precompute_select = View(in.precompute_select);
    auto precompute_select_shift = View(in.precompute_select_shift);
    const auto& precompute_skew = View(in.precompute_skew);

    // 16 two-bit slices encoding 8 wNAF digits
    const std::array<View, 16> slices{
        View(in.precompute_s1hi), View(in.precompute_s1lo), View(in.precompute_s2hi), View(in.precompute_s2lo),
        View(in.precompute_s3hi), View(in.precompute_s3lo), View(in.precompute_s4hi), View(in.precompute_s4lo),
        View(in.precompute_s5hi), View(in.precompute_s5lo), View(in.precompute_s6hi), View(in.precompute_s6lo),
        View(in.precompute_s7hi), View(in.precompute_s7lo), View(in.precompute_s8hi), View(in.precompute_s8lo),
    };

    const auto range_constraint_slice_to_2_bits = [&scaling_factor](const View& s, auto& acc) {
        acc += ((s - 1).sqr() - 1) * ((s - 2).sqr() - 1) * scaling_factor;
    };

    const auto convert_to_wnaf = [](const View& hi, const View& lo) {
        auto t = hi + hi;
        t += t;
        t += lo;
        auto naf = t + t - 15;
        return naf;
    };

    const auto scaled_transition = q_transition * scaling_factor;
    const auto scaled_transition_is_zero = -scaled_transition + scaling_factor;
    const auto scaled_lagrange_first = scaling_factor * lagrange_first;

    // Range-check all 16 two-bit slices
    range_constraint_slice_to_2_bits(slices[0], std::get<0>(accumulator));
    range_constraint_slice_to_2_bits(slices[1], std::get<1>(accumulator));
    range_constraint_slice_to_2_bits(slices[2], std::get<2>(accumulator));
    range_constraint_slice_to_2_bits(slices[3], std::get<3>(accumulator));
    range_constraint_slice_to_2_bits(slices[4], std::get<4>(accumulator));
    range_constraint_slice_to_2_bits(slices[5], std::get<5>(accumulator));
    range_constraint_slice_to_2_bits(slices[6], std::get<6>(accumulator));
    range_constraint_slice_to_2_bits(slices[7], std::get<7>(accumulator));
    range_constraint_slice_to_2_bits(slices[8], std::get<23>(accumulator));
    range_constraint_slice_to_2_bits(slices[9], std::get<24>(accumulator));
    range_constraint_slice_to_2_bits(slices[10], std::get<25>(accumulator));
    range_constraint_slice_to_2_bits(slices[11], std::get<26>(accumulator));
    range_constraint_slice_to_2_bits(slices[12], std::get<27>(accumulator));
    range_constraint_slice_to_2_bits(slices[13], std::get<28>(accumulator));
    range_constraint_slice_to_2_bits(slices[14], std::get<29>(accumulator));
    range_constraint_slice_to_2_bits(slices[15], std::get<30>(accumulator));

    // Validate first slice is positive at transitions
    const auto s1hi_shift = View(in.precompute_s1hi_shift);
    const auto s1hi_shift_msb_set = (s1hi_shift - 2) * (s1hi_shift - 3);
    const auto scaled_transition_plus_lagrange_first = scaled_transition + scaled_lagrange_first;
    std::get<20>(accumulator) += scaled_transition_plus_lagrange_first * precompute_select_shift * s1hi_shift_msb_set;

    // Convert 16 two-bit slices into 8 wNAF digits
    const auto w0 = convert_to_wnaf(slices[0], slices[1]);
    const auto w1 = convert_to_wnaf(slices[2], slices[3]);
    const auto w2 = convert_to_wnaf(slices[4], slices[5]);
    const auto w3 = convert_to_wnaf(slices[6], slices[7]);
    const auto w4 = convert_to_wnaf(slices[8], slices[9]);
    const auto w5 = convert_to_wnaf(slices[10], slices[11]);
    const auto w6 = convert_to_wnaf(slices[12], slices[13]);
    const auto w7 = convert_to_wnaf(slices[14], slices[15]);

    // Scalar sum consistency: accumulate 8 wNAF digits via Horner's method
    // row_slice = 2^28*w0 + 2^24*w1 + ... + 2^4*w6 + w7
    auto row_slice = w0;
    // Multiply by 16 (shift left 4 bits), then add next digit. Repeat 7 times.
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
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w4;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w5;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w6;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += row_slice;
    row_slice += w7;
    // Shift by 2^32 (8 digits * 4 bits each)
    auto sum_delta = scalar_sum * FF(1ULL << 32) + row_slice;
    const auto check_sum = scalar_sum_shift - sum_delta;
    std::get<8>(accumulator) += precompute_select * check_sum * scaled_transition_is_zero;

    // precompute_select monotonicity
    const auto scaled_lagrange_first_minus_one = scaled_lagrange_first - scaling_factor;
    const auto precompute_select_check = precompute_select_shift * (precompute_select - 1);
    std::get<22>(accumulator) += scaled_lagrange_first_minus_one * precompute_select_check;

    // Round transition logic: round now goes 0-3 (was 0-7)
    // Combined check: q_transition * (round - 3) + (-q_transition + 1) * (round_shift - round - 1)
    const auto round_check = round_shift - round - 1;
    const auto precompute_select_transition_plus_lagrange_first =
        precompute_select * scaled_transition + scaled_lagrange_first;
    // WNAF_DIGITS_PER_ROW - 1 = 7 was used for the old round max; now it's
    // (NUM_WNAF_DIGITS_PER_SCALAR / WNAF_DIGITS_PER_ROW) - 1 = 3
    constexpr size_t MAX_ROUND = 3; // 32/8 - 1
    std::get<9>(accumulator) +=
        precompute_select *
        (scaled_transition * (round - round_check - static_cast<int>(MAX_ROUND)) + scaling_factor * round_check);
    std::get<10>(accumulator) += precompute_select_transition_plus_lagrange_first * round_shift;

    // Scalar transition / PC checks
    std::get<11>(accumulator) += precompute_select_transition_plus_lagrange_first * scalar_sum_shift;
    const auto pc_delta = pc_shift - pc;
    std::get<12>(accumulator) +=
        precompute_select * (scaled_transition * ((-pc_delta - pc_delta - 1)) + pc_delta * scaling_factor);

    // Validate skew is 0 or 7
    std::get<13>(accumulator) += precompute_select * (precompute_skew * (precompute_skew - 7)) * scaling_factor;

    // Set slices, pc, round, q_transition to zero when precompute_select == 0
    const auto precompute_select_zero = (-precompute_select + 1) * scaling_factor;
    std::get<14>(accumulator) += precompute_select_zero * (w0 + 15);
    std::get<15>(accumulator) += precompute_select_zero * (w1 + 15);
    std::get<16>(accumulator) += precompute_select_zero * (w2 + 15);
    std::get<17>(accumulator) += precompute_select_zero * (w3 + 15);
    std::get<31>(accumulator) += precompute_select_zero * (w4 + 15);
    std::get<32>(accumulator) += precompute_select_zero * (w5 + 15);
    std::get<33>(accumulator) += precompute_select_zero * (w6 + 15);
    std::get<34>(accumulator) += precompute_select_zero * (w7 + 15);

    std::get<18>(accumulator) += precompute_select_zero * round;
    std::get<19>(accumulator) += precompute_select_zero * pc;
    std::get<21>(accumulator) += precompute_select_zero * q_transition;
}
} // namespace bb

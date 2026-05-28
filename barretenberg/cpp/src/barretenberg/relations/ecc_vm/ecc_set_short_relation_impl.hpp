// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_short_relation.hpp"

#include <type_traits>

namespace bb {

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetShortRelationImpl<FF>::compute_grand_product_numerator(const AllEntities& in,
                                                                           const Parameters& params)
{
    using View = ECCVMShortMonomialView<Accumulator>;

    const auto precompute_round = View(in.precompute_round);
    const auto precompute_round2 = precompute_round + precompute_round;
    const auto precompute_round4 = precompute_round2 + precompute_round2;

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;
    const auto precompute_pc = View(in.precompute_pc);
    const auto precompute_select = View(in.precompute_select);

    const auto first_term_tag = beta_quartic * Base::FIRST_TERM_TAG;
    const auto second_term_tag = beta_quartic * Base::SECOND_TERM_TAG;
    const auto third_term_tag = beta_quartic * Base::THIRD_TERM_TAG;

    const auto make_wnaf_input = [&](const auto& hi, const auto& lo, const auto& round_offset) {
        auto wnaf_slice = hi + hi;
        wnaf_slice += wnaf_slice;
        wnaf_slice += lo;
        return wnaf_slice + gamma + precompute_pc * beta + (precompute_round4 + round_offset) * beta_sqr +
               first_term_tag;
    };

    const auto wnaf_slice_input0 = make_wnaf_input(View(in.precompute_s1hi), View(in.precompute_s1lo), FF(0));
    const auto wnaf_slice_input1 = make_wnaf_input(View(in.precompute_s2hi), View(in.precompute_s2lo), FF(1));
    const auto wnaf_slice_input2 = make_wnaf_input(View(in.precompute_s3hi), View(in.precompute_s3lo), FF(2));
    const auto wnaf_slice_input3 = make_wnaf_input(View(in.precompute_s4hi), View(in.precompute_s4lo), FF(3));

    auto numerator =
        Accumulator(wnaf_slice_input0 * wnaf_slice_input1) * Accumulator(wnaf_slice_input2 * wnaf_slice_input3);

    const auto skew = View(in.precompute_skew);
    const auto precompute_point_transition = View(in.precompute_point_transition);
    const auto skew_linear =
        skew + gamma + precompute_pc * beta + (precompute_round4 + FF(4)) * beta_sqr + first_term_tag;
    const auto skew_input = precompute_point_transition * skew_linear + (-precompute_point_transition + 1);
    numerator *= Accumulator(skew_input);

    const auto& eccvm_set_permutation_delta = params.eccvm_set_permutation_delta;
    const auto precompute_select_factor =
        precompute_select * (-eccvm_set_permutation_delta + 1) + eccvm_set_permutation_delta;
    numerator *= Accumulator(precompute_select_factor);

    const auto table_x = View(in.precompute_tx);
    const auto table_y = View(in.precompute_ty);
    const auto precompute_skew = View(in.precompute_skew);
    const auto negative_inverse_seven = []() {
        if constexpr (std::same_as<FF, grumpkin::fr>) {
            static constexpr FF negative_inverse_seven = FF(-7).invert();
            return negative_inverse_seven;
        } else {
            FF negative_inverse_seven = FF(-7).invert();
            return negative_inverse_seven;
        }
    };
    auto adjusted_skew = precompute_skew * negative_inverse_seven();

    const auto wnaf_scalar_sum = View(in.precompute_scalar_sum);
    const auto w0 = convert_to_wnaf<Accumulator>(View(in.precompute_s1hi), View(in.precompute_s1lo));
    const auto w1 = convert_to_wnaf<Accumulator>(View(in.precompute_s2hi), View(in.precompute_s2lo));
    const auto w2 = convert_to_wnaf<Accumulator>(View(in.precompute_s3hi), View(in.precompute_s3lo));
    const auto w3 = convert_to_wnaf<Accumulator>(View(in.precompute_s4hi), View(in.precompute_s4lo));

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

    auto scalar_sum_full = wnaf_scalar_sum * FF(1ULL << 16);
    scalar_sum_full += row_slice + adjusted_skew;

    auto point_table_init_read_linear =
        precompute_pc + table_x * beta + table_y * beta_sqr + scalar_sum_full * beta_cube + second_term_tag;
    auto point_table_init_read =
        precompute_point_transition * (point_table_init_read_linear + gamma) + (-precompute_point_transition + 1);
    numerator *= Accumulator(point_table_init_read);

    const auto lagrange_first = View(in.lagrange_first);
    const auto partial_msm_transition_shift = View(in.msm_transition_shift);
    const auto msm_transition_shift = (-lagrange_first + 1) * partial_msm_transition_shift;
    const auto msm_pc_shift = View(in.msm_pc_shift);
    const auto msm_x_shift = View(in.msm_accumulator_x_shift);
    const auto msm_y_shift = View(in.msm_accumulator_y_shift);
    const auto msm_size = View(in.msm_size_of_msm);

    auto msm_result_write_linear =
        msm_pc_shift + msm_x_shift * beta + msm_y_shift * beta_sqr + msm_size * beta_cube + third_term_tag;
    auto msm_result_write = Accumulator(msm_transition_shift) * Accumulator(msm_result_write_linear + gamma) +
                            Accumulator(-msm_transition_shift + 1);
    numerator *= msm_result_write;

    return numerator;
}

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetShortRelationImpl<FF>::compute_grand_product_denominator(const AllEntities& in,
                                                                             const Parameters& params)
{
    using View = ECCVMShortMonomialView<Accumulator>;

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;
    const auto msm_pc = View(in.msm_pc);
    const auto msm_count = View(in.msm_count);
    const auto msm_round = View(in.msm_round);

    const auto first_term_tag = beta_quartic * Base::FIRST_TERM_TAG;
    const auto second_term_tag = beta_quartic * Base::SECOND_TERM_TAG;
    const auto third_term_tag = beta_quartic * Base::THIRD_TERM_TAG;

    const auto make_wnaf_output = [&](const auto& add, const auto& slice, const auto& count_offset) {
        const auto input =
            slice + gamma + (msm_pc - msm_count - count_offset) * beta + msm_round * beta_sqr + first_term_tag;
        return add * input + (-add + 1);
    };

    const auto wnaf_slice_output1 = make_wnaf_output(View(in.msm_add1), View(in.msm_slice1), FF(0));
    const auto wnaf_slice_output2 = make_wnaf_output(View(in.msm_add2), View(in.msm_slice2), FF(1));
    const auto wnaf_slice_output3 = make_wnaf_output(View(in.msm_add3), View(in.msm_slice3), FF(2));
    const auto wnaf_slice_output4 = make_wnaf_output(View(in.msm_add4), View(in.msm_slice4), FF(3));

    auto denominator = Accumulator(wnaf_slice_output1) * Accumulator(wnaf_slice_output2);
    denominator *= Accumulator(wnaf_slice_output3);
    denominator *= Accumulator(wnaf_slice_output4);

    const auto transcript_pc = View(in.transcript_pc);
    const auto transcript_Px = View(in.transcript_Px);
    const auto transcript_Py = View(in.transcript_Py);
    const auto z1 = View(in.transcript_z1);
    const auto z2 = View(in.transcript_z2);
    const auto z1_zero = View(in.transcript_z1zero);
    const auto z2_zero = View(in.transcript_z2zero);
    const auto base_infinity = View(in.transcript_base_infinity);
    const auto transcript_mul = View(in.transcript_mul);

    const auto lookup_first = -z1_zero + 1;
    const auto lookup_second = -z2_zero + 1;
    FF cube_root_unity = FF(bb::fq::cube_root_of_unity());

    auto transcript_input1_linear =
        transcript_pc + transcript_Px * beta + transcript_Py * beta_sqr + z1 * beta_cube + second_term_tag;
    auto transcript_input2_linear = (transcript_pc - lookup_first) + transcript_Px * cube_root_unity * beta -
                                    transcript_Py * beta_sqr + z2 * beta_cube + second_term_tag;

    auto transcript_input1 = (transcript_input1_linear + gamma) * lookup_first + (-lookup_first + 1);
    auto transcript_input2 = (transcript_input2_linear + gamma) * lookup_second + (-lookup_second + 1);

    auto transcript_product = Accumulator(transcript_input1) * Accumulator(transcript_input2);
    transcript_product *= Accumulator(-base_infinity + 1);
    transcript_product += Accumulator(base_infinity);

    auto point_table_init_write = Accumulator(transcript_mul) * transcript_product + Accumulator(-transcript_mul + 1);
    denominator *= point_table_init_write;

    const auto transcript_pc_shift = View(in.transcript_pc_shift);
    const auto transcript_msm_x = View(in.transcript_msm_x);
    const auto transcript_msm_y = View(in.transcript_msm_y);
    const auto transcript_msm_transition = View(in.transcript_msm_transition);
    const auto transcript_msm_count = View(in.transcript_msm_count);

    auto full_msm_count = Accumulator(transcript_msm_count);
    full_msm_count += Accumulator(transcript_mul * (lookup_first + lookup_second)) * Accumulator(-base_infinity + 1);

    auto msm_result_read =
        Accumulator(transcript_pc_shift + transcript_msm_x * beta + transcript_msm_y * beta_sqr + third_term_tag);
    msm_result_read += full_msm_count * beta_cube;
    msm_result_read += gamma;
    msm_result_read =
        Accumulator(transcript_msm_transition) * msm_result_read + Accumulator(-transcript_msm_transition + 1);
    denominator *= msm_result_read;

    return denominator;
}

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMSetShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                               const AllEntities& in,
                                               const Parameters& params,
                                               const FF& scaling_factor)
{
    using GrandProductAccumulator = typename std::tuple_element_t<Base::GRAND_PRODUCT, ContainerOverSubrelations>;
    using GrandProductView = ECCVMShortMonomialView<GrandProductAccumulator>;

    GrandProductAccumulator numerator_evaluation = compute_grand_product_numerator<GrandProductAccumulator>(in, params);
    GrandProductAccumulator denominator_evaluation =
        compute_grand_product_denominator<GrandProductAccumulator>(in, params);

    const auto z_perm = GrandProductView(in.z_perm);
    const auto z_perm_shift = GrandProductView(in.z_perm_shift);
    const auto lagrange_first = GrandProductView(in.lagrange_first);
    const auto lagrange_last = GrandProductView(in.lagrange_last);

    const auto z_perm_and_first_scaled = (z_perm + lagrange_first) * scaling_factor;
    const auto z_perm_shift_and_last_scaled = (z_perm_shift + lagrange_last) * scaling_factor;
    std::get<Base::GRAND_PRODUCT>(accumulator) +=
        GrandProductAccumulator(z_perm_and_first_scaled) * numerator_evaluation -
        GrandProductAccumulator(z_perm_shift_and_last_scaled) * denominator_evaluation;

    using LeftShiftableAccumulator = std::tuple_element_t<Base::LEFT_SHIFTABLE, ContainerOverSubrelations>;
    using LeftShiftableView = ECCVMShortMonomialView<LeftShiftableAccumulator>;
    const auto lagrange_last_short = LeftShiftableView(in.lagrange_last);
    const auto z_perm_shift_short = LeftShiftableView(in.z_perm_shift);
    std::get<Base::LEFT_SHIFTABLE>(accumulator) +=
        LeftShiftableAccumulator((lagrange_last_short * z_perm_shift_short) * scaling_factor);

    using InitAccumulator = std::tuple_element_t<Base::Z_PERM_INIT, ContainerOverSubrelations>;
    using InitView = ECCVMShortMonomialView<InitAccumulator>;
    const auto lagrange_first_init = InitView(in.lagrange_first);
    const auto z_perm_init = InitView(in.z_perm);
    std::get<Base::Z_PERM_INIT>(accumulator) += InitAccumulator((lagrange_first_init * z_perm_init) * scaling_factor);
}

} // namespace bb

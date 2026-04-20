// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "ecc_set_relation.hpp"
#include <type_traits>

namespace bb {

// ============================================================================================
// Grand Product #1: WNAF slices — (pc, round, wnaf_slice)
// Numerator: Precompute table; Denominator: MSM table (via den_wnaf_partial intermediate)
// ============================================================================================

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetWnafRelationImpl<FF>::compute_grand_product_numerator(const AllEntities& in,
                                                                          const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;

    const auto& precompute_round = View(in.precompute_round);
    const auto precompute_round2 = precompute_round + precompute_round;
    const auto precompute_round4 = precompute_round2 + precompute_round2;

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_quartic = params.beta_quartic;
    const auto& precompute_pc = View(in.precompute_pc);
    const auto& precompute_select = View(in.precompute_select);

    const auto first_term_tag = beta_quartic * Constants::FIRST_TERM_TAG;

    Accumulator numerator(1); // degree-0
    {
        const auto& s0 = View(in.precompute_s1hi);
        const auto& s1 = View(in.precompute_s1lo);
        auto wnaf_slice = s0 + s0;
        wnaf_slice += wnaf_slice;
        wnaf_slice += s1;
        const auto wnaf_slice_input0 =
            wnaf_slice + gamma + precompute_pc * beta + precompute_round4 * beta_sqr + first_term_tag;
        numerator *= wnaf_slice_input0; // degree-1
    }
    {
        const auto& s0 = View(in.precompute_s2hi);
        const auto& s1 = View(in.precompute_s2lo);
        auto wnaf_slice = s0 + s0;
        wnaf_slice += wnaf_slice;
        wnaf_slice += s1;
        const auto wnaf_slice_input1 =
            wnaf_slice + gamma + precompute_pc * beta + (precompute_round4 + 1) * beta_sqr + first_term_tag;
        numerator *= wnaf_slice_input1; // degree-2
    }
    {
        const auto& s0 = View(in.precompute_s3hi);
        const auto& s1 = View(in.precompute_s3lo);
        auto wnaf_slice = s0 + s0;
        wnaf_slice += wnaf_slice;
        wnaf_slice += s1;
        const auto wnaf_slice_input2 =
            wnaf_slice + gamma + precompute_pc * beta + (precompute_round4 + 2) * beta_sqr + first_term_tag;
        numerator *= wnaf_slice_input2; // degree-3
    }
    {
        const auto& s0 = View(in.precompute_s4hi);
        const auto& s1 = View(in.precompute_s4lo);
        auto wnaf_slice = s0 + s0;
        wnaf_slice += wnaf_slice;
        wnaf_slice += s1;
        const auto wnaf_slice_input3 =
            wnaf_slice + gamma + precompute_pc * beta + (precompute_round4 + 3) * beta_sqr + first_term_tag;
        numerator *= wnaf_slice_input3; // degree-4
    }
    {
        // skew product if relevant
        const auto& skew = View(in.precompute_skew);
        const auto& precompute_point_transition = View(in.precompute_point_transition);
        const auto skew_input = precompute_point_transition * (skew + gamma + precompute_pc * beta +
                                                               (precompute_round4 + 4) * beta_sqr + first_term_tag) +
                                (-precompute_point_transition + 1);
        numerator *= skew_input; // degree-6
    }
    {
        const auto& eccvm_set_permutation_delta = params.eccvm_set_permutation_delta;
        numerator *= precompute_select * (-eccvm_set_permutation_delta + 1) + eccvm_set_permutation_delta; // degree-7
    }
    return numerator;
}

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetWnafRelationImpl<FF>::compute_grand_product_denominator(const AllEntities& in,
                                                                            const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;
    (void)params; // beta/gamma are baked into den_wnaf_partial

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_quartic = params.beta_quartic;
    const auto& msm_pc = View(in.msm_pc);
    const auto& msm_count = View(in.msm_count);
    const auto& msm_round = View(in.msm_round);

    const auto first_term_tag = beta_quartic * Constants::FIRST_TERM_TAG;

    // Use the committed intermediate polynomial for the first two wnaf output factors.
    // This reduces the denominator degree from 8 to 5.
    Accumulator denominator(1); // degree-0
    {
        const auto& den_partial = View(in.den_wnaf_partial);
        denominator *= den_partial; // degree-1
    }
    {
        const auto& add3 = View(in.msm_add3);
        const auto& msm_slice3 = View(in.msm_slice3);
        auto wnaf_slice_output3 =
            add3 * (msm_slice3 + gamma + (msm_pc - msm_count - 2) * beta + msm_round * beta_sqr + first_term_tag) +
            (-add3 + 1);
        denominator *= wnaf_slice_output3; // degree-3
    }
    {
        const auto& add4 = View(in.msm_add4);
        const auto& msm_slice4 = View(in.msm_slice4);
        auto wnaf_slice_output4 =
            add4 * (msm_slice4 + gamma + (msm_pc - msm_count - 3) * beta + msm_round * beta_sqr + first_term_tag) +
            (-add4 + 1);
        denominator *= wnaf_slice_output4; // degree-5
    }
    return denominator;
}

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMSetWnafRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                               const AllEntities& in,
                                               const Parameters& params,
                                               const FF& scaling_factor)
{
    using Constants = ECCVMSetRelationConstants;

    // Subrelation 0: Grand product
    {
        using Accumulator = std::tuple_element_t<GRAND_PRODUCT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        Accumulator numerator_evaluation = compute_grand_product_numerator<Accumulator>(in, params);
        Accumulator denominator_evaluation = compute_grand_product_denominator<Accumulator>(in, params);

        const auto& lagrange_first = View(in.lagrange_first);
        const auto& lagrange_last = View(in.lagrange_last);
        const auto& z_perm = View(in.z_perm);
        const auto& z_perm_shift = View(in.z_perm_shift);

        std::get<GRAND_PRODUCT>(accumulator) +=
            ((z_perm + lagrange_first) * numerator_evaluation -
             (z_perm_shift + lagrange_last) * denominator_evaluation) *
            scaling_factor;
    }

    // Subrelation 1: Left-shiftable (z_perm_shift = 0 at lagrange_last)
    {
        using Accumulator = std::tuple_element_t<LEFT_SHIFTABLE, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<LEFT_SHIFTABLE>(accumulator) += View(in.lagrange_last) * View(in.z_perm_shift) * scaling_factor;
    }

    // Subrelation 2: z_perm initialization (z_perm = 0 at lagrange_first)
    {
        using Accumulator = std::tuple_element_t<Z_PERM_INIT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<Z_PERM_INIT>(accumulator) += View(in.lagrange_first) * View(in.z_perm) * scaling_factor;
    }

    // Subrelation 3: den_wnaf_partial constraint
    // Constrains: den_wnaf_partial = wnaf_out1 * wnaf_out2
    {
        using Accumulator = std::tuple_element_t<DEN_PARTIAL_CONSTRAINT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_quartic = params.beta_quartic;
        const auto& msm_pc = View(in.msm_pc);
        const auto& msm_count = View(in.msm_count);
        const auto& msm_round = View(in.msm_round);
        const auto first_term_tag = beta_quartic * Constants::FIRST_TERM_TAG;

        const auto& add1 = View(in.msm_add1);
        const auto& msm_slice1 = View(in.msm_slice1);
        auto wnaf_out1 =
            add1 * (msm_slice1 + gamma + (msm_pc - msm_count) * beta + msm_round * beta_sqr + first_term_tag) +
            (-add1 + 1);

        const auto& add2 = View(in.msm_add2);
        const auto& msm_slice2 = View(in.msm_slice2);
        auto wnaf_out2 =
            add2 * (msm_slice2 + gamma + (msm_pc - msm_count - 1) * beta + msm_round * beta_sqr + first_term_tag) +
            (-add2 + 1);

        const auto& den_partial = View(in.den_wnaf_partial);
        std::get<DEN_PARTIAL_CONSTRAINT>(accumulator) += (den_partial - wnaf_out1 * wnaf_out2) * scaling_factor;
    }
}

// ============================================================================================
// Grand Product #2: Scalar tuples — (pc, P.x, P.y, scalar)
// Numerator: Precompute table; Denominator: Transcript table
// ============================================================================================

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetScalarRelationImpl<FF>::compute_grand_product_numerator(const AllEntities& in,
                                                                            const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;

    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;
    const auto& gamma = params.gamma;
    const auto& precompute_pc = View(in.precompute_pc);
    const auto& precompute_round = View(in.precompute_round);
    const auto precompute_round2 = precompute_round + precompute_round;
    const auto precompute_round4 = precompute_round2 + precompute_round2;

    const auto second_term_tag = beta_quartic * Constants::SECOND_TERM_TAG;

    const auto& table_x = View(in.precompute_tx);
    const auto& table_y = View(in.precompute_ty);

    const auto& precompute_skew = View(in.precompute_skew);
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

    const auto& wnaf_scalar_sum = View(in.precompute_scalar_sum);
    const auto w0 = Constants::convert_to_wnaf<Accumulator>(View(in.precompute_s1hi), View(in.precompute_s1lo));
    const auto w1 = Constants::convert_to_wnaf<Accumulator>(View(in.precompute_s2hi), View(in.precompute_s2lo));
    const auto w2 = Constants::convert_to_wnaf<Accumulator>(View(in.precompute_s3hi), View(in.precompute_s3lo));
    const auto w3 = Constants::convert_to_wnaf<Accumulator>(View(in.precompute_s4hi), View(in.precompute_s4lo));

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

    auto scalar_sum_full = wnaf_scalar_sum + wnaf_scalar_sum;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += scalar_sum_full;
    scalar_sum_full += row_slice + adjusted_skew;

    auto precompute_point_transition = View(in.precompute_point_transition);

    auto point_table_init_read =
        (precompute_pc + table_x * beta + table_y * beta_sqr + scalar_sum_full * beta_cube + second_term_tag);
    point_table_init_read =
        precompute_point_transition * (point_table_init_read + gamma) + (-precompute_point_transition + 1);

    return point_table_init_read; // degree-2
}

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetScalarRelationImpl<FF>::compute_grand_product_denominator(const AllEntities& in,
                                                                              const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;

    const auto second_term_tag = beta_quartic * Constants::SECOND_TERM_TAG;

    const auto& transcript_pc = View(in.transcript_pc);
    const auto& transcript_Px = View(in.transcript_Px);
    const auto& transcript_Py = View(in.transcript_Py);
    const auto& z1 = View(in.transcript_z1);
    const auto& z2 = View(in.transcript_z2);
    const auto& z1_zero = View(in.transcript_z1zero);
    const auto& z2_zero = View(in.transcript_z2zero);
    const auto& base_infinity = View(in.transcript_base_infinity);
    const auto& transcript_mul = View(in.transcript_mul);

    const auto& lookup_first = (-z1_zero + 1);
    const auto& lookup_second = (-z2_zero + 1);
    FF cube_root_unity = FF(bb::fq::cube_root_of_unity());

    auto transcript_input1 =
        transcript_pc + transcript_Px * beta + transcript_Py * beta_sqr + z1 * beta_cube + second_term_tag;
    auto transcript_input2 = (transcript_pc - lookup_first) + transcript_Px * cube_root_unity * beta -
                              transcript_Py * beta_sqr + z2 * beta_cube + second_term_tag;

    transcript_input1 = (transcript_input1 + gamma) * lookup_first + (-lookup_first + 1);   // degree 2
    transcript_input2 = (transcript_input2 + gamma) * lookup_second + (-lookup_second + 1); // degree 2

    auto transcript_product = (transcript_input1 * transcript_input2) * (-base_infinity + 1) + base_infinity; // deg 5

    auto point_table_init_write = transcript_mul * transcript_product + (-transcript_mul + 1); // degree 6
    return point_table_init_write;
}

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMSetScalarRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                const AllEntities& in,
                                                const Parameters& params,
                                                const FF& scaling_factor)
{
    // Subrelation 0: Grand product
    {
        using Accumulator = std::tuple_element_t<GRAND_PRODUCT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        Accumulator numerator_evaluation = compute_grand_product_numerator<Accumulator>(in, params);
        Accumulator denominator_evaluation = compute_grand_product_denominator<Accumulator>(in, params);

        const auto& lagrange_first = View(in.lagrange_first);
        const auto& lagrange_last = View(in.lagrange_last);
        const auto& z_perm = View(in.z_perm_scalar);
        const auto& z_perm_shift = View(in.z_perm_scalar_shift);

        std::get<GRAND_PRODUCT>(accumulator) +=
            ((z_perm + lagrange_first) * numerator_evaluation -
             (z_perm_shift + lagrange_last) * denominator_evaluation) *
            scaling_factor;
    }

    // Subrelation 1: Left-shiftable
    {
        using Accumulator = std::tuple_element_t<LEFT_SHIFTABLE, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<LEFT_SHIFTABLE>(accumulator) +=
            View(in.lagrange_last) * View(in.z_perm_scalar_shift) * scaling_factor;
    }

    // Subrelation 2: z_perm initialization
    {
        using Accumulator = std::tuple_element_t<Z_PERM_INIT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<Z_PERM_INIT>(accumulator) += View(in.lagrange_first) * View(in.z_perm_scalar) * scaling_factor;
    }
}

// ============================================================================================
// Grand Product #3: MSM output tuples — (pc, P.x, P.y, msm_size)
// Numerator: MSM table; Denominator: Transcript table
// ============================================================================================

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetMsmRelationImpl<FF>::compute_grand_product_numerator(const AllEntities& in,
                                                                         const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;

    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;
    const auto& gamma = params.gamma;

    const auto third_term_tag = beta_quartic * Constants::THIRD_TERM_TAG;

    const auto& lagrange_first = View(in.lagrange_first);
    const auto& partial_msm_transition_shift = View(in.msm_transition_shift);
    const auto msm_transition_shift = (-lagrange_first + 1) * partial_msm_transition_shift;
    const auto& msm_pc_shift = View(in.msm_pc_shift);

    const auto& msm_x_shift = View(in.msm_accumulator_x_shift);
    const auto& msm_y_shift = View(in.msm_accumulator_y_shift);
    const auto& msm_size = View(in.msm_size_of_msm);

    auto msm_result_write =
        msm_pc_shift + msm_x_shift * beta + msm_y_shift * beta_sqr + msm_size * beta_cube + third_term_tag;

    msm_result_write = msm_transition_shift * (msm_result_write + gamma) + (-msm_transition_shift + 1);
    return msm_result_write; // degree-3
}

template <typename FF>
template <typename Accumulator, typename AllEntities, typename Parameters>
Accumulator ECCVMSetMsmRelationImpl<FF>::compute_grand_product_denominator(const AllEntities& in,
                                                                           const Parameters& params)
{
    using View = typename Accumulator::View;
    using Constants = ECCVMSetRelationConstants;

    const auto& gamma = params.gamma;
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& beta_quartic = params.beta_quartic;

    const auto third_term_tag = beta_quartic * Constants::THIRD_TERM_TAG;

    const auto& transcript_pc_shift = View(in.transcript_pc_shift);
    const auto& transcript_msm_x = View(in.transcript_msm_x);
    const auto& transcript_msm_y = View(in.transcript_msm_y);
    const auto& transcript_msm_transition = View(in.transcript_msm_transition);
    const auto& transcript_msm_count = View(in.transcript_msm_count);
    const auto& z1_zero = View(in.transcript_z1zero);
    const auto& z2_zero = View(in.transcript_z2zero);
    const auto& transcript_mul = View(in.transcript_mul);
    const auto& base_infinity = View(in.transcript_base_infinity);

    // do not add to count if point at infinity!
    auto full_msm_count =
        transcript_msm_count + transcript_mul * ((-z1_zero + 1) + (-z2_zero + 1)) * (-base_infinity + 1);

    auto msm_result_read = transcript_pc_shift + transcript_msm_x * beta + transcript_msm_y * beta_sqr +
                           full_msm_count * beta_cube + third_term_tag;
    msm_result_read = transcript_msm_transition * (msm_result_read + gamma) + (-transcript_msm_transition + 1);
    return msm_result_read; // degree-4
}

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMSetMsmRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                              const AllEntities& in,
                                              const Parameters& params,
                                              const FF& scaling_factor)
{
    // Subrelation 0: Grand product
    {
        using Accumulator = std::tuple_element_t<GRAND_PRODUCT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        Accumulator numerator_evaluation = compute_grand_product_numerator<Accumulator>(in, params);
        Accumulator denominator_evaluation = compute_grand_product_denominator<Accumulator>(in, params);

        const auto& lagrange_first = View(in.lagrange_first);
        const auto& lagrange_last = View(in.lagrange_last);
        const auto& z_perm = View(in.z_perm_msm);
        const auto& z_perm_shift = View(in.z_perm_msm_shift);

        std::get<GRAND_PRODUCT>(accumulator) +=
            ((z_perm + lagrange_first) * numerator_evaluation -
             (z_perm_shift + lagrange_last) * denominator_evaluation) *
            scaling_factor;
    }

    // Subrelation 1: Left-shiftable
    {
        using Accumulator = std::tuple_element_t<LEFT_SHIFTABLE, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<LEFT_SHIFTABLE>(accumulator) += View(in.lagrange_last) * View(in.z_perm_msm_shift) * scaling_factor;
    }

    // Subrelation 2: z_perm initialization
    {
        using Accumulator = std::tuple_element_t<Z_PERM_INIT, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        std::get<Z_PERM_INIT>(accumulator) += View(in.lagrange_first) * View(in.z_perm_msm) * scaling_factor;
    }
}

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_msm_transition_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMTranscriptMsmTransitionShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                                   const AllEntities& in,
                                                                   const Parameters& /*unused*/,
                                                                   const FF& scaling_factor)
{
    using Acc6 = typename std::tuple_element_t<OFFSET_GENERATOR_X, ContainerOverSubrelations>;
    using Acc5 = typename std::tuple_element_t<MSM_INFINITY_INVERSE, ContainerOverSubrelations>;
    using Acc4 = typename std::tuple_element_t<MSM_INFINITY_X_DIFF, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Acc6>;

    static const auto offset_generator_coords = [&]() {
        static constexpr auto offset_generator_base = get_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
        static bb::g1::affine_element result =
            bb::g1::affine_element(bb::g1::element(offset_generator_base) * grumpkin::fq(uint256_t(1) << 124));
        return std::array<FF, 2>{ FF(result.x), FF(result.y) };
    };

    const auto msm_transition = View(in.transcript_msm_transition);
    const auto transcript_msm_infinity = View(in.transcript_msm_infinity);

    const auto offset = offset_generator_coords();
    const auto x1 = offset[0];
    const auto y1 = -offset[1];
    const auto x2 = View(in.transcript_msm_x);
    const auto y2 = View(in.transcript_msm_y);
    const auto x3 = View(in.transcript_msm_intermediate_x);
    const auto y3 = View(in.transcript_msm_intermediate_y);
    const auto x2_minus_x1 = x2 - x1;
    const auto y2_minus_y1 = y2 - y1;
    const auto x3_plus_x2_plus_x1 = (x3 + x2) + x1;

    // OFFSET_GENERATOR_X/Y: deg 5, length 6.
    const auto x_term_acc6 = Acc6(x3_plus_x2_plus_x1) * Acc6(x2_minus_x1.sqr()) - Acc6(y2_minus_y1.sqr()); // deg 3
    const auto y_term_acc6 = Acc6((-x3 + x1) * y2_minus_y1) - Acc6(x2_minus_x1 * (y3 + y1));               // deg 2
    const auto not_msm_inf_short = -transcript_msm_infinity + FF(1);                                       // length 2
    const auto subtract_x_acc6 = x_term_acc6 * Acc6(not_msm_inf_short) + Acc6(transcript_msm_infinity * x3);
    const auto subtract_y_acc6 = y_term_acc6 * Acc6(not_msm_inf_short) + Acc6(transcript_msm_infinity * y3);
    std::get<OFFSET_GENERATOR_X>(accumulator) += Acc6(msm_transition * scaling_factor) * subtract_x_acc6;
    std::get<OFFSET_GENERATOR_Y>(accumulator) += Acc6(msm_transition * scaling_factor) * subtract_y_acc6;

    // MSM_INFINITY_X_DIFF / Y_SUM: deg 3, length 4.
    const auto x_diff = x2 - x1;
    const auto y_sum = y2 + y1;
    std::get<MSM_INFINITY_X_DIFF>(accumulator) +=
        Acc4((msm_transition * transcript_msm_infinity) * scaling_factor) * Acc4(x_diff);
    std::get<MSM_INFINITY_Y_SUM>(accumulator) +=
        Acc4((msm_transition * transcript_msm_infinity) * scaling_factor) * Acc4(y_sum);

    // MSM_INFINITY_INVERSE: deg 4, length 5.
    const auto transcript_msm_x_inverse = View(in.transcript_msm_x_inverse);
    const auto inverse_inner = Acc5(x_diff * transcript_msm_x_inverse) - Acc5(FF(1));
    std::get<MSM_INFINITY_INVERSE>(accumulator) +=
        Acc5(msm_transition * scaling_factor) * Acc5(not_msm_inf_short) * inverse_inner;
}

} // namespace bb

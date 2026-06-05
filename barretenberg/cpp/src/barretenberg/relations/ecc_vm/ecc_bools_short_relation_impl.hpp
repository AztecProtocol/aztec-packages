// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_bools_short_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMBoolsTranscriptShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                           const AllEntities& in,
                                                           const Parameters& /*unused*/,
                                                           const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;

    auto accumulate_bool = [&accumulator, &scaling_factor](auto index, const auto& value) {
        std::get<index>(accumulator) += Accumulator((value * (value - 1)) * scaling_factor);
    };

    accumulate_bool(std::integral_constant<size_t, 0>{}, View(in.transcript_eq));
    accumulate_bool(std::integral_constant<size_t, 1>{}, View(in.transcript_add));
    accumulate_bool(std::integral_constant<size_t, 2>{}, View(in.transcript_mul));
    accumulate_bool(std::integral_constant<size_t, 3>{}, View(in.transcript_reset_accumulator));
    accumulate_bool(std::integral_constant<size_t, 4>{}, View(in.transcript_msm_transition));
    accumulate_bool(std::integral_constant<size_t, 5>{}, View(in.transcript_accumulator_not_empty));
    accumulate_bool(std::integral_constant<size_t, 6>{}, View(in.transcript_z1zero));
    accumulate_bool(std::integral_constant<size_t, 7>{}, View(in.transcript_z2zero));
    accumulate_bool(std::integral_constant<size_t, 8>{}, View(in.transcript_add_x_equal));
    accumulate_bool(std::integral_constant<size_t, 9>{}, View(in.transcript_add_y_equal));
    accumulate_bool(std::integral_constant<size_t, 10>{}, View(in.transcript_base_infinity));
    accumulate_bool(std::integral_constant<size_t, 11>{}, View(in.transcript_msm_infinity));
    accumulate_bool(std::integral_constant<size_t, 12>{}, View(in.transcript_msm_count_zero_at_transition));
}

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMBoolsMsmShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                    const AllEntities& in,
                                                    const Parameters& /*unused*/,
                                                    const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;

    auto accumulate_bool = [&accumulator, &scaling_factor](auto index, const auto& value) {
        std::get<index>(accumulator) += Accumulator((value * (value - 1)) * scaling_factor);
    };

    accumulate_bool(std::integral_constant<size_t, 0>{}, View(in.msm_transition));
    accumulate_bool(std::integral_constant<size_t, 1>{}, View(in.precompute_point_transition));
    accumulate_bool(std::integral_constant<size_t, 2>{}, View(in.msm_add));
    accumulate_bool(std::integral_constant<size_t, 3>{}, View(in.msm_double));
    accumulate_bool(std::integral_constant<size_t, 4>{}, View(in.msm_skew));
    accumulate_bool(std::integral_constant<size_t, 5>{}, View(in.precompute_select));
    accumulate_bool(std::integral_constant<size_t, 6>{}, View(in.msm_add1));
    accumulate_bool(std::integral_constant<size_t, 7>{}, View(in.msm_add2));
    accumulate_bool(std::integral_constant<size_t, 8>{}, View(in.msm_add3));
    accumulate_bool(std::integral_constant<size_t, 9>{}, View(in.msm_add4));
}

} // namespace bb

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
void ECCVMBoolsShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                 const AllEntities& in,
                                                 const Parameters& /*unused*/,
                                                 const FF& scaling_factor)
{
    using Base = ECCVMBoolsRelationImpl<FF>;
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = ECCVMShortMonomialView<Accumulator>;

    auto accumulate_bool = [&accumulator, &scaling_factor](auto index, const auto& value) {
        std::get<index>(accumulator) += Accumulator((value * (value - 1)) * scaling_factor);
    };

    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Q_EQ>{}, View(in.transcript_eq));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Q_ADD>{}, View(in.transcript_add));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Q_MUL>{}, View(in.transcript_mul));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Q_RESET_ACCUMULATOR>{},
                    View(in.transcript_reset_accumulator));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_TRANSITION>{}, View(in.transcript_msm_transition));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_ACCUMULATOR_NOT_EMPTY>{},
                    View(in.transcript_accumulator_not_empty));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Z1_ZERO>{}, View(in.transcript_z1zero));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_Z2_ZERO>{}, View(in.transcript_z2zero));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_ADD_X_EQUAL>{}, View(in.transcript_add_x_equal));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_ADD_Y_EQUAL>{}, View(in.transcript_add_y_equal));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_BASE_INFINITY>{}, View(in.transcript_base_infinity));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_INFINITY>{}, View(in.transcript_msm_infinity));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_COUNT_ZERO_AT_TRANSITION>{},
                    View(in.transcript_msm_count_zero_at_transition));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_TRANSITION_MSM>{}, View(in.msm_transition));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_PRECOMPUTE_POINT_TRANSITION>{},
                    View(in.precompute_point_transition));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_ADD>{}, View(in.msm_add));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_DOUBLE>{}, View(in.msm_double));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_SKEW>{}, View(in.msm_skew));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_PRECOMPUTE_SELECT>{}, View(in.precompute_select));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_ADD1>{}, View(in.msm_add1));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_ADD2>{}, View(in.msm_add2));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_ADD3>{}, View(in.msm_add3));
    accumulate_bool(std::integral_constant<size_t, Base::BOOL_MSM_ADD4>{}, View(in.msm_add4));
}

} // namespace bb

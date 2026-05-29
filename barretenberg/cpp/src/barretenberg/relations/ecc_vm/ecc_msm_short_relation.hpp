// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_msm_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMMSMShortRelationImpl : public ECCVMMSMRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMMSMRelationImpl<FF>;

    // Tightened per-subrelation partial lengths. The "EC arithmetic" block — ADD_*, SKEW_*, DOUBLE_*,
    // COLLISION_CHECK_*, IDLE_ROW_* — keeps length 8 to preserve sharing of q_add_scaled / q_double_scaled /
    // q_skew_scaled / q_add_acc / q_skew_acc / acc_x/y promotions across multiple subrelations. The independent
    // "tail" subrelations (inactive slice, continuity, transitions, decomposition) shrink to their true degree+1.
    static constexpr std::array<size_t, Base::NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
        8, // ADD_ACC_X
        8, // ADD_ACC_Y
        8, // ADD_SLOPE_1
        8, // SKEW_ACC_X
        8, // SKEW_ACC_Y
        8, // SKEW_SLOPE_1
        8, // COLLISION_CHECK_1
        8, // COLLISION_CHECK_2
        8, // COLLISION_CHECK_3
        8, // COLLISION_CHECK_4
        8, // DOUBLE_ACC_X
        8, // DOUBLE_ACC_Y
        8, // DOUBLE_SLOPE_1
        3, // INACTIVE_SLICE_1 (deg 2)
        3, // INACTIVE_SLICE_2 (deg 2)
        3, // INACTIVE_SLICE_3 (deg 2)
        3, // INACTIVE_SLICE_4 (deg 2)
        3, // PHASE_SELECTOR_MUTUAL_EXCLUSIVITY (deg 2)
        4, // ROUND_TRANSITION_FORCES_DELTA_ONE (deg 3)
        5, // ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31 (deg 4)
        4, // ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW (deg 3)
        5, // ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW (deg 4)
        3, // DOUBLE_IMPLIES_NEXT_IS_ADD (deg 2)
        3, // COUNT_SHIFT_ZERO_ON_ROUND_CHANGE (deg 2)
        4, // COUNT_INCREMENT_WITHIN_ROUND (deg 3)
        5, // COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION (deg 4)
        3, // MSM_TRANSITION_ROUND_ZERO (deg 2)
        4, // MSM_TRANSITION_PC (deg 3)
        3, // ADD_CONTINUITY_2 (deg 2)
        3, // ADD_CONTINUITY_3 (deg 2)
        3, // ADD_CONTINUITY_4 (deg 2)
        5, // ADD_CROSS_ROW_CONTINUITY (deg 4)
        2, // ADD1_DECOMPOSITION (deg 1)
        4, // SKEW_PERSISTS_UNTIL_MSM_TRANSITION (deg 3)
        3, // SKEW_IMPLIES_ROUND_32 (deg 2)
        3, // DOUBLE_REQUIRES_ROUND_CHANGE (deg 2)
        8, // ADD_SLOPE_2
        8, // ADD_SLOPE_3
        8, // ADD_SLOPE_4
        8, // DOUBLE_SLOPE_2
        8, // DOUBLE_SLOPE_3
        8, // DOUBLE_SLOPE_4
        8, // SKEW_SLOPE_2
        8, // SKEW_SLOPE_3
        8, // SKEW_SLOPE_4
        8, // IDLE_ROW_PRESERVES_ACC_X
        8, // IDLE_ROW_PRESERVES_ACC_Y
    };
    static_assert(Base::NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMShortRelation = Relation<ECCVMMSMShortRelationImpl<FF>>;

} // namespace bb

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

template <typename FF_> class ECCVMMSMAddShortRelationImpl {
  public:
    using FF = FF_;

    // Local indices map to base MSM subrelations ADD_ACC_X..ADD_SLOPE_4.
    enum SubrelationIndex : size_t {
        ADD_ACC_X = 0,
        ADD_ACC_Y = 1,
        ADD_SLOPE_1 = 2,
        ADD_SLOPE_2 = 3,
        ADD_SLOPE_3 = 4,
        ADD_SLOPE_4 = 5,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{ 8, 8, 8, 8, 8, 8 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.msm_add.is_zero(); }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMAddShortRelation = Relation<ECCVMMSMAddShortRelationImpl<FF>>;

template <typename FF_> class ECCVMMSMDoubleShortRelationImpl {
  public:
    using FF = FF_;

    // Local indices map to base MSM subrelations DOUBLE_ACC_X..DOUBLE_SLOPE_4.
    enum SubrelationIndex : size_t {
        DOUBLE_ACC_X = 0,
        DOUBLE_ACC_Y = 1,
        DOUBLE_SLOPE_1 = 2,
        DOUBLE_SLOPE_2 = 3,
        DOUBLE_SLOPE_3 = 4,
        DOUBLE_SLOPE_4 = 5,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{ 8, 8, 8, 8, 8, 8 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.msm_double.is_zero(); }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMDoubleShortRelation = Relation<ECCVMMSMDoubleShortRelationImpl<FF>>;

template <typename FF_> class ECCVMMSMSkewShortRelationImpl {
  public:
    using FF = FF_;

    // Local indices map to base MSM subrelations SKEW_ACC_X..SKEW_SLOPE_4.
    enum SubrelationIndex : size_t {
        SKEW_ACC_X = 0,
        SKEW_ACC_Y = 1,
        SKEW_SLOPE_1 = 2,
        SKEW_SLOPE_2 = 3,
        SKEW_SLOPE_3 = 4,
        SKEW_SLOPE_4 = 5,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{ 8, 8, 8, 8, 8, 8 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.msm_skew.is_zero(); }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMSkewShortRelation = Relation<ECCVMMSMSkewShortRelationImpl<FF>>;

template <typename FF_> class ECCVMMSMShortRelationImpl {
  public:
    using FF = FF_;

    // Shared collision checks and the cheap MSM tail. These local indices map in order to base MSM subrelations
    // COLLISION_CHECK_1..IDLE_ROW_PRESERVES_ACC_Y, after the ADD/DOUBLE/SKEW split pieces in the short flavor.
    enum SubrelationIndex : size_t {
        COLLISION_CHECK_1 = 0,
        COLLISION_CHECK_2 = 1,
        COLLISION_CHECK_3 = 2,
        COLLISION_CHECK_4 = 3,
        INACTIVE_SLICE_1 = 4,
        INACTIVE_SLICE_2 = 5,
        INACTIVE_SLICE_3 = 6,
        INACTIVE_SLICE_4 = 7,
        PHASE_SELECTOR_MUTUAL_EXCLUSIVITY = 8,
        ROUND_TRANSITION_FORCES_DELTA_ONE = 9,
        ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31 = 10,
        ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW = 11,
        ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW = 12,
        DOUBLE_IMPLIES_NEXT_IS_ADD = 13,
        COUNT_SHIFT_ZERO_ON_ROUND_CHANGE = 14,
        COUNT_INCREMENT_WITHIN_ROUND = 15,
        COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION = 16,
        MSM_TRANSITION_ROUND_ZERO = 17,
        MSM_TRANSITION_PC = 18,
        ADD_CONTINUITY_2 = 19,
        ADD_CONTINUITY_3 = 20,
        ADD_CONTINUITY_4 = 21,
        ADD_CROSS_ROW_CONTINUITY = 22,
        ADD1_DECOMPOSITION = 23,
        SKEW_PERSISTS_UNTIL_MSM_TRANSITION = 24,
        SKEW_IMPLIES_ROUND_32 = 25,
        DOUBLE_REQUIRES_ROUND_CHANGE = 26,
        IDLE_ROW_PRESERVES_ACC_X = 27,
        IDLE_ROW_PRESERVES_ACC_Y = 28,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 29> SUBRELATION_PARTIAL_LENGTHS{
        8, // COLLISION_CHECK_1
        8, // COLLISION_CHECK_2
        8, // COLLISION_CHECK_3
        8, // COLLISION_CHECK_4
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
        8, // IDLE_ROW_PRESERVES_ACC_X
        8, // IDLE_ROW_PRESERVES_ACC_Y
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMShortRelation = Relation<ECCVMMSMShortRelationImpl<FF>>;

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief ECCVMBoolsRelationImpl evaluates the correctness of ECCVM boolean checks
 *
 * @details There are a lot of columns in ECCVM that are boolean. As these are all low-degree we place them in a
 * separate relation class
 * @tparam FF
 */
template <typename FF_> class ECCVMBoolsRelationImpl {
  public:
    using FF = FF_;

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    // Each constrains a specific column to be boolean: col * (col - 1) == 0.
    enum SubrelationIndex : size_t {
        BOOL_Q_EQ = 0,
        BOOL_Q_ADD = 1,
        BOOL_Q_MUL = 2,
        BOOL_Q_RESET_ACCUMULATOR = 3,
        BOOL_MSM_TRANSITION = 4,
        BOOL_ACCUMULATOR_NOT_EMPTY = 5,
        BOOL_Z1_ZERO = 6,
        BOOL_Z2_ZERO = 7,
        BOOL_ADD_X_EQUAL = 8,
        BOOL_ADD_Y_EQUAL = 9,
        BOOL_BASE_INFINITY = 10,
        BOOL_MSM_INFINITY = 11,
        BOOL_MSM_COUNT_ZERO_AT_TRANSITION = 12,
        BOOL_MSM_TRANSITION_MSM = 13,
        BOOL_PRECOMPUTE_POINT_TRANSITION = 14,
        BOOL_MSM_ADD = 15,
        BOOL_MSM_DOUBLE = 16,
        BOOL_MSM_SKEW = 17,
        BOOL_PRECOMPUTE_SELECT = 18,
        BOOL_MSM_ADD1 = 19,
        BOOL_MSM_ADD2 = 20,
        BOOL_MSM_ADD3 = 21,
        BOOL_MSM_ADD4 = 22,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 23> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMBoolsRelation = Relation<ECCVMBoolsRelationImpl<FF>>;

} // namespace bb
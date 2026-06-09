// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMPointTableDoubleShortRelationImpl {
  public:
    using FF = FF_;

    // Local indices map to base point-table subrelations DOUBLE_X and DOUBLE_Y.
    enum SubrelationIndex : size_t {
        DOUBLE_X = 0,
        DOUBLE_Y = 1,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        6, // DOUBLE_X (deg 5)
        5, // DOUBLE_Y (deg 4)
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.precompute_point_transition.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMPointTableDoubleShortRelation = Relation<ECCVMPointTableDoubleShortRelationImpl<FF>>;

template <typename FF_> class ECCVMPointTableShortRelationImpl {
  public:
    using FF = FF_;

    // Local indices map in order to base point-table subrelations D_PROPAGATE_X..ADD_Y.
    enum SubrelationIndex : size_t {
        D_PROPAGATE_X = 0,
        D_PROPAGATE_Y = 1,
        ADD_X = 2,
        ADD_Y = 3,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        4, // D_PROPAGATE_X (deg 3)
        4, // D_PROPAGATE_Y (deg 3)
        6, // ADD_X (deg 5)
        5, // ADD_Y (deg 4)
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMPointTableShortRelation = Relation<ECCVMPointTableShortRelationImpl<FF>>;

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMWnafShortRelationImpl : public ECCVMWnafRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMWnafRelationImpl<FF>;

    // Tightened partial lengths per actual subrelation degree. The base relation declares all 5; many subrelations
    // are deg 2 or deg 3 and only need partial length 3 or 4. The deepest (RANGE_S* and FIRST_SLICE_POSITIVE) stay
    // at 5, so MAX_PARTIAL_RELATION_LENGTH at the flavor level is unchanged.
    static constexpr std::array<size_t, Base::NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
        5, 5, 5, 5, 5, 5, 5, 5, // RANGE_S1HI..RANGE_S4LO (deg 4)
        4,                      // SCALAR_SUM_CHECK (deg 3)
        4,                      // ROUND_CHECK (deg 3)
        4,                      // ROUND_SHIFT_ZERO (deg 3)
        4,                      // SCALAR_SUM_SHIFT_ZERO (deg 3)
        4,                      // PC_CHECK (deg 3)
        4,                      // SKEW_RANGE (deg 3)
        3, 3, 3, 3,             // INACTIVE_SLICE_W0..W3 (deg 2)
        3,                      // INACTIVE_ROUND (deg 2)
        3,                      // INACTIVE_PC (deg 2)
        5,                      // FIRST_SLICE_POSITIVE (deg 4)
        3,                      // INACTIVE_POINT_TRANSITION (deg 2)
        4,                      // PRECOMPUTE_SELECT_SHAPE (deg 3)
    };
    static_assert(Base::NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMWnafShortRelation = Relation<ECCVMWnafShortRelationImpl<FF>>;

} // namespace bb

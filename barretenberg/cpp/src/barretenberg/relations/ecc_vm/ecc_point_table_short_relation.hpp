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

template <typename FF_> class ECCVMPointTableShortRelationImpl : public ECCVMPointTableRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMPointTableRelationImpl<FF>;

    // DOUBLE_X / ADD_X are deg 5 (length 6). The other four subrelations are deg ≤ 4.
    static constexpr std::array<size_t, Base::NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
        6, // DOUBLE_X (deg 5)
        5, // DOUBLE_Y (deg 4)
        4, // D_PROPAGATE_X (deg 3)
        4, // D_PROPAGATE_Y (deg 3)
        6, // ADD_X (deg 5)
        5, // ADD_Y (deg 4)
    };
    static_assert(Base::NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMPointTableShortRelation = Relation<ECCVMPointTableShortRelationImpl<FF>>;

} // namespace bb

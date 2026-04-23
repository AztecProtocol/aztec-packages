// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/offset_boundary_relation.hpp"

namespace bb {

/**
 * @brief Policy enforcing `ecc_op_wire_j = 0` on the offset area (rows 0..3) for Mega flavors.
 *
 * @details Mega's ECC op wires are not masked in ZK flavors (random ECC ops provide ZK hiding
 * instead, see ProverInstance_::allocate_ecc_op_polynomials), so the "= 0 on offset rows"
 * boundary check is consistent with both non-ZK and ZK Mega.
 *
 * Produces four degree-1 subrelations, one per ecc_op_wire. Combined with
 * `OffsetBoundaryRelation`'s `IS_OFFSET_ONLY = true` tag, sumcheck scales these by `L(x)` so
 * they only fire on rows 0..3.
 */
template <typename FF_> struct MegaEccOpBoundaryPolicy {
    using FF = FF_;

    static constexpr size_t NUM_SUBRELATIONS = 4;

    template <typename AllEntities> static auto entities(const AllEntities& in)
    {
        return std::tie(in.ecc_op_wire_1, in.ecc_op_wire_2, in.ecc_op_wire_3, in.ecc_op_wire_4);
    }
};

template <typename FF> using MegaEccOpBoundaryRelation = OffsetBoundaryRelation<MegaEccOpBoundaryPolicy<FF>>;

} // namespace bb

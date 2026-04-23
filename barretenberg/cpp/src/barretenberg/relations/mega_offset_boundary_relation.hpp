// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/offset_boundary_relation.hpp"

namespace bb {

/**
 * @brief `OffsetBoundaryRelation` policy for Mega: `ecc_op_wire_j(x) = 0` on rows 0..3,
 * for `j = 1..4`.
 *
 * @details Mega's ECC op wires are not masked in ZK flavors — ZK hiding is provided by random
 * ECC ops inserted into the op queue, not by masking polynomial rows (see
 * `ProverInstance_::allocate_ecc_op_polynomials`). The boundary condition is therefore valid in
 * both non-ZK and ZK Mega.
 *
 * Produces four degree-1 subrelations. Via `OffsetBoundaryRelation`'s `IS_OFFSET_ONLY` tag,
 * sumcheck scales each contribution by `L(x) = L_0 + L_1 + L_2 + L_3`.
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

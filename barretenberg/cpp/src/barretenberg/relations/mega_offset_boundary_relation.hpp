// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/relation_types.hpp"
#include <array>

namespace bb {

/**
 * @brief Enforces `ecc_op_wire_j(x) = 0` on rows 0..3 (the offset area) for Mega flavors, for
 * `j = 1..4`.
 *
 * @details Mega's ECC op wires are not masked in ZK flavors — ZK hiding is provided by random
 * ECC ops inserted into the op queue, not by masking polynomial rows (see
 * `ProverInstance_::allocate_ecc_op_polynomials`). The boundary condition is therefore valid in
 * both non-ZK and ZK Mega.
 *
 * Produces four degree-1 subrelations. The `IS_OFFSET_ONLY` tag causes sumcheck to scale each
 * contribution by `L(x) = L_0 + L_1 + L_2 + L_3` (indicator of rows 0..3) rather than `(1 - L)`.
 */
template <typename FF_> class MegaEccOpBoundaryRelationImpl {
  public:
    using FF = FF_;

    static constexpr bool IS_OFFSET_ONLY = true;

    // Four subrelations `ecc_op_wire_j = 0`, each degree 1 (partial length 2).
    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{ 2, 2, 2, 2 };

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  const Parameters& /*params*/,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        std::get<0>(evals) += Accumulator(CoefficientAccumulator(in.ecc_op_wire_1)) * scaling_factor;
        std::get<1>(evals) += Accumulator(CoefficientAccumulator(in.ecc_op_wire_2)) * scaling_factor;
        std::get<2>(evals) += Accumulator(CoefficientAccumulator(in.ecc_op_wire_3)) * scaling_factor;
        std::get<3>(evals) += Accumulator(CoefficientAccumulator(in.ecc_op_wire_4)) * scaling_factor;
    }
};

template <typename FF> using MegaEccOpBoundaryRelation = Relation<MegaEccOpBoundaryRelationImpl<FF>>;

} // namespace bb

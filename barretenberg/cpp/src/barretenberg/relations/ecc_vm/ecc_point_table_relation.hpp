// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief ECCVMPointTableRelationImpl
 * @details These relations define the set of point lookup tables we will use in `ecc_msm_relation.hpp`, to evaluate
 * multiscalar multiplication. For every point [P] = (Px, Py) involved in an MSM, we need to do define a lookup
 * table out of the following points: { -15[P], -13[P], -11[P], -9[P], -7[P], -5[P], -3[P], -[P] }
 * ECCVMPointTableRelationImpl defines relations that define the lookup table.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF_> class ECCVMPointTableRelationImpl {
  public:
    using FF = FF_;

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    enum SubrelationIndex : size_t {
        // Point doubling: Dx = 2*Tx when point_transition = 1
        DOUBLE_X = 0,
        DOUBLE_Y = 1,
        // D propagation: Dx_shift = Dx when not at transition
        D_PROPAGATE_X = 2,
        D_PROPAGATE_Y = 3,
        // Point addition: T = T_shift + D when not at transition
        ADD_X = 4,
        ADD_Y = 5,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{ 6, 6, 6, 6, 6, 6 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMPointTableRelation = Relation<ECCVMPointTableRelationImpl<FF>>;

} // namespace bb

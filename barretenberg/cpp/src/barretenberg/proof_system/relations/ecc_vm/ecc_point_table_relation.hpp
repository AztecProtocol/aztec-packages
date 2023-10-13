#pragma once
#include "barretenberg/proof_system/relations/relation_types.hpp"

namespace proof_system::honk::sumcheck {

/**
 * @brief ECCVMPointTableRelationBase
 * @details These relations define the set of point lookup tables we will use in `ecc_msm_relation.hpp`, to evaluate
 * multiscalar multiplication. For every point [P] = (Px, Py) involved in an MSM, we need to do define a lookup
 * table out of the following points: { -15[P], -13[P], -11[P], -9[P], -7[P], -5[P], -3[P], -[P] }
 * ECCVMPointTableRelationBase defines relations that define the lookup table.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF_> class ECCVMPointTableRelationBase {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 6> SUBRELATION_LENGTHS{ 6, 6, 6, 6, 6, 6 };

    template <typename ContainerOverSubrelations, typename AllEntities>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const RelationParameters<FF>& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMPointTableRelation = Relation<ECCVMPointTableRelationBase<FF>>;

} // namespace proof_system::honk::sumcheck

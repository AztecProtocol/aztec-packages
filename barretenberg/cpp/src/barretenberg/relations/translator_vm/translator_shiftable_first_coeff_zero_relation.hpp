// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class TranslatorShiftableFirstCoeffZeroRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    // degree(lagrange_first * ordered_range_constraints_i) = 2, so length = 3
    static constexpr size_t RELATION_LENGTH = 3;

    static constexpr std::array<size_t, 5> SUBRELATION_PARTIAL_LENGTHS{
        3, // ordered_range_constraints_0 starts at 0 subrelation
        3, // ordered_range_constraints_1 starts at 0 subrelation
        3, // ordered_range_constraints_2 starts at 0 subrelation
        3, // ordered_range_constraints_3 starts at 0 subrelation
        3  // ordered_range_constraints_4 starts at 0 subrelation
    };

    /**
     * @brief Anchors the first coefficient of the shiftable ordered_range_constraints polynomials to zero.
     *
     * @details A to-be-shifted polynomial g is opened as the left-shift g/X off the same commitment, so the
     * Gemini/Shplemini PCS already forces g[0] = 0. This relation makes that invariant explicit at the relation level
     * for the ordered_range_constraints wires, which are the only shiftable Translator polynomials whose first
     * coefficient is not already pinned to 0 by another relation: z_perm is anchored by the permutation relation, and
     * the range-constraint and op-queue wires are pinned by the zero-constraints relation (which forces them to 0 on
     * every row outside the minicircuit, including the first row). Anchoring the lower endpoint of each sorted range
     * here removes the delta-range argument's dependence on the PCS shift property.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor);
};

template <typename FF>
using TranslatorShiftableFirstCoeffZeroRelation = Relation<TranslatorShiftableFirstCoeffZeroRelationImpl<FF>>;

} // namespace bb

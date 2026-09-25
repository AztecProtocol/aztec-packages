// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/translator_vm/translator_short_monomial_relation_utils.hpp"

namespace bb {

template <typename FF_> class TranslatorShiftableFirstCoeffZeroShortRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    // degree(lagrange_first * wire) = 2, so length = 3
    static constexpr size_t RELATION_LENGTH = 3;

    static constexpr std::array<size_t, 18> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero.
     *
     * @details Every subrelation carries a lagrange_first factor, so on any edge where lagrange_first is identically
     * zero all contributions are the zero polynomial. lagrange_first is nonzero only on the first row, so this
     * skips the degree-2 products on essentially every edge. This tests the actual edge values (not a selector), so it
     * is sound in every sumcheck round.
     */
    template <typename AllEntities> static bool skip(const AllEntities& in) { return in.lagrange_first.is_zero(); }

    /**
     * @brief Anchors the first value of the ordered-range and non-range main wires to zero.
     *
     * @details PCS shiftability pins only the first block's first value in the concatenated main-wire commitment.
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
using TranslatorShiftableFirstCoeffZeroShortRelation = Relation<TranslatorShiftableFirstCoeffZeroShortRelationImpl<FF>>;

} // namespace bb

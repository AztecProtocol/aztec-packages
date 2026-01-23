// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class TranslatorDeltaRangeConstraintRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH =
        6; // degree((lagrange_real_last + lagrange_masking - 1) * D(D - 1)(D - 2)(D - 3)) = 6

    static constexpr std::array<size_t, 10> SUBRELATION_PARTIAL_LENGTHS{
        6, // ordered_range_constraints_0 step in {0,1,2,3} subrelation
        6, // ordered_range_constraints_1 step in {0,1,2,3} subrelation
        6, // ordered_range_constraints_2 step in {0,1,2,3} subrelation
        6, // ordered_range_constraints_3 step in {0,1,2,3} subrelation
        6, // ordered_range_constraints_4 step in {0,1,2,3} subrelation
        3, // ordered_range_constraints_0 ends with defined maximum value subrelation
        3, // ordered_range_constraints_1 ends with defined maximum value subrelation
        3, // ordered_range_constraints_2 ends with defined maximum value subrelation
        3, // ordered_range_constraints_3 ends with defined maximum value subrelation
        3  // ordered_range_constraints_4 ends with defined maximum value subrelation

    };

    /**
     * @brief Expression for the generalized permutation sort relation
     *
     * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
     * 1) 2 sequential values are non-descending and have a difference of at most 3. This check is skipped
     *    at the real_last index (lagrange_real_last = 1) and in the masking region (lagrange_masking = 1).
     * 2) The value at the real_last index is 2¹⁴ - 1.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1607): This only enforces <254-bit range constraints,
     * NOT strict <q checks. Values in [q, 2^254) pass verification, potentially creating inconsistency with
     * native/Ultra verification which reject such aliased representations.
     *
     * The delta constraint uses: not_last_or_masking = lagrange_real_last + lagrange_masking - 1
     * which equals 0 when checks should be skipped, and -1 when checks should be enforced.
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
using TranslatorDeltaRangeConstraintRelation = Relation<TranslatorDeltaRangeConstraintRelationImpl<FF>>;

} // namespace bb

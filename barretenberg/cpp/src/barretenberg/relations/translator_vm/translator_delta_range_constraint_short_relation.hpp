// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/translator_vm/translator_short_monomial_relation_utils.hpp"

namespace bb {

template <typename FF_> class TranslatorDeltaRangeConstraintShortRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    // degree((1-lagrange_real_last-lagrange_ordered_masking) * D(D-1)(D-2)(D-3)) = 4+1 = 5, so length = 6
    static constexpr size_t RELATION_LENGTH = 6;

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
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     * @details The ordered_range_constraints wires are sorted ascending, so each is constant across long runs. On an
     * edge where ordered_i is locally constant, delta_i = ordered_i_shift - ordered_i is the zero edge polynomial, so
     * the degree-4 product P(delta_i) = delta_i(delta_i-1)(delta_i-2)(delta_i-3) vanishes identically and the delta-sort
     * subrelation contributes nothing. The max-value subrelations carry a lagrange_real_last factor, so they vanish on
     * any edge where lagrange_real_last is identically zero. We can therefore skip an edge only when all five deltas and
     * lagrange_real_last are identically zero across it. This tests the actual edge values (not a selector), so it is
     * sound in every sumcheck round with no masking-row subtlety.
     */
    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        return (in.ordered_range_constraints_0_shift - in.ordered_range_constraints_0).is_zero() &&
               (in.ordered_range_constraints_1_shift - in.ordered_range_constraints_1).is_zero() &&
               (in.ordered_range_constraints_2_shift - in.ordered_range_constraints_2).is_zero() &&
               (in.ordered_range_constraints_3_shift - in.ordered_range_constraints_3).is_zero() &&
               (in.ordered_range_constraints_4_shift - in.ordered_range_constraints_4).is_zero() &&
               in.lagrange_real_last.is_zero();
    }

    /**
     * @brief Expression for the generalized permutation sort relation
     *
     * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
     * 1) 2 sequential values are non-descending and have a difference of at most 3. This check is skipped
     *    at the real_last index (lagrange_real_last = 1) and in the ordered masking region
     *    (lagrange_ordered_masking = 1).
     * 2) The value at the real_last index is 2¹⁴ - 1.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1607): This only enforces <254-bit range constraints,
     * NOT strict <q checks. Values in [q, 2^254) pass verification, potentially creating inconsistency with
     * native/Ultra verification which reject such aliased representations.
     *
     * The delta constraint uses: not_last_or_masking = 1 - lagrange_real_last - lagrange_ordered_masking
     * which equals 0 when checks should be skipped, and 1 when checks should be enforced.
     * This works because lagrange_real_last and lagrange_ordered_masking have disjoint support.
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
using TranslatorDeltaRangeConstraintShortRelation = Relation<TranslatorDeltaRangeConstraintShortRelationImpl<FF>>;

} // namespace bb

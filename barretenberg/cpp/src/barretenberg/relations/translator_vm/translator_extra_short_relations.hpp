// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/translator_vm/translator_short_monomial_relation_utils.hpp"

namespace bb {

template <typename FF_> class TranslatorOpcodeConstraintShortRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 6;
    static constexpr std::array<size_t, 5> SUBRELATION_PARTIAL_LENGTHS{
        6, // opcode constraint relation
        6, // opcode constraint relation
        6, // opcode constraint relation
        6, // opcode constraint relation
        6  // opcode constraint relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        // Skip evaluation when not at even indices in the minicircuit and not in the masking area
        // as the contribution is zero in these regions.
        return (in.lagrange_even_in_minicircuit + in.lagrange_mini_masking).is_zero();
    }
    /**
     * @brief Enforces two constraints on the opcode value:
     *          1. opcode ∈ {0,3,4,8} (nop, eq and reset, mul or add)
     *          2. at even indices when op = 0 (no-op), accumulator limbs stay the same
     *
     * @details The first constraint validates that the opcode is one of the described values on even rows.
     * On odd rows, the opcode value is set to 0 and so it is always valid, so the check is trivial. The second
     * constraint ensures that at even indices when the opcode is 0 (no-op), the accumulator limbs do not change
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

template <typename FF_> class TranslatorAccumulatorTransferShortRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 4; // degree((SOME_LAGRANGE)(A-B)) = 2
    static constexpr std::array<size_t, 12> SUBRELATION_PARTIAL_LENGTHS{
        4, // transfer accumulator limb 0 at odd index subrelation
        4, // transfer accumulator limb 1 at odd index subrelation
        4, // transfer accumulator limb 2 at odd index subrelation
        4, // transfer accumulator limb 3 at odd index subrelation
        3, // accumulator limb 0 is zero at the start of accumulation subrelation
        3, // accumulator limb 1 is zero at the start of accumulation subrelation
        3, // accumulator limb 2 is zero at the start of accumulation subrelation
        3, // accumulator limb 3 is zero at the start of accumulation subrelation
        3, // accumulator limb 0 is equal to given result at the end of accumulation subrelation
        3, // accumulator limb 1 is equal to given result at the end of accumulation subrelation
        3, // accumulator limb 2 is equal to given result at the end of accumulation subrelation
        3  // accumulator limb 3 is equal to given result at the end of accumulation subrelation

    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     * @details This has a negligible chance of failing in sumcheck (not in the first round) because effectively
     * transform original coefficients into a random linear combination. But checking each individually is noticeably
     * slower.
     *
     */
    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        // All contributions are zero outside the minicircuit and at even indices within the minicircuit
        // (except the last and result row in minicircuit)
        return (in.lagrange_odd_in_minicircuit + in.lagrange_last_in_minicircuit + in.lagrange_result_row).is_zero();
    }
    /**
     * @brief Relation enforcing non-arithmetic transitions of accumulator (value that is tracking the batched
     * evaluation of polynomials in non-native field)
     * @details This relation enforces three pieces of logic:
     * 1) Accumulator starts as zero before we start accumulating stuff
     * 2) Accumulator limbs are propagated correctly from an odd row to the next even row
     * 3) Accumulator limbs result in the values specified by relation parameters after accumulation
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF_> class TranslatorZeroConstraintsShortRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3; // degree((some lagrange)(A)) = 2

    static constexpr std::array<size_t, 68> SUBRELATION_PARTIAL_LENGTHS{
        3, // p_x_low_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // p_x_low_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // p_x_low_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // p_x_low_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // p_x_low_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_4 is zero outside of the minicircuit
        3, // relation_wide_limbs_range_constraint_0 is zero outside of the minicircuit
        3, // relation_wide_limbs_range_constraint_1 is zero outside of the minicircuit
        3, // relation_wide_limbs_range_constraint_2 is zero outside of the minicircuit
        3, // relation_wide_limbs_range_constraint_3 is zero outside of the minicircuit
        3, // p_x_low_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // p_x_high_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // p_y_low_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // p_y_high_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // z_low_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // z_high_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // accumulator_low_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // accumulator_high_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // quotient_low_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // quotient_high_limbs_range_constraint_tail is zero outside of the minicircuit
        3, // op is zero outside of the minicircuit
        3, // x_lo_y_hi is zero outside of the minicircuit
        3, // x_hi_z_1 is zero outside of the minicircuit
        3, // y_lo_z_2 is zero outside of the minicircuit
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     *
     */
    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        // The contribution of every subrelation is wire * (lagrange_odd + lagrange_even + lagrange_mini_masking - 1).
        // Let s = lagrange_odd + lagrange_even + lagrange_mini_masking. Per row s is 1 exactly where this relation is
        // inactive (the minicircuit processing rows and the masking rows, where the selector s - 1 vanishes) and 0 on
        // the remaining rows (the no-op head and the zero-padding tail). On the s == 0 rows every constrained wire is
        // identically zero for the honest prover, so the contribution vanishes there too.
        //
        // We may therefore skip any edge on which s is constant: s == 1 makes the selector identically zero, and s == 0
        // makes all wires identically zero (this is preserved under partial evaluation, since a folded s evaluates to 0
        // only when both endpoints had s == 0, where the folded wires are likewise 0). Only edges straddling the
        // active/inactive boundary, where s is non-constant, must be evaluated. Skipping only on s - 1 == 0 (as a pure
        // selector argument would) needlessly evaluates the large zero-padding tail; skipping only on lagrange_odd +
        // lagrange_even == 0 would be unsound, as it also drops masking-vs-head/tail straddle edges whose contribution
        // is non-zero away from the edge endpoints.
        static constexpr auto minus_one = -FF(1);
        const auto s = in.lagrange_odd_in_minicircuit + in.lagrange_even_in_minicircuit + in.lagrange_mini_masking;
        return (s + minus_one).is_zero() || s.is_zero();
    }
    /**
     * @brief Relation enforcing all the range-constraint polynomials to be zero after the minicircuit
     * @details This relation ensures that while we are out of the minicircuit the range constraint polynomials are zero
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF>
using TranslatorOpcodeConstraintShortRelation = Relation<TranslatorOpcodeConstraintShortRelationImpl<FF>>;

template <typename FF>
using TranslatorAccumulatorTransferShortRelation = Relation<TranslatorAccumulatorTransferShortRelationImpl<FF>>;

template <typename FF>
using TranslatorZeroConstraintsShortRelation = Relation<TranslatorZeroConstraintsShortRelationImpl<FF>>;

} // namespace bb

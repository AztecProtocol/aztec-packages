// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class TranslatorOpcodeConstraintRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 6; // degree((lagrange_masking - 1)⋅op ⋅(op - 3)⋅(op - 4)⋅(op - 8)) = 5
    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        6 // opcode constraint relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.op.is_zero(); }
    /**
     * @brief Expression for enforcing the value of the Opcode to be {0,3,4,8}
     * @details This relation enforces the opcode to be one of described values. Since we don't care about even
     * values in the opcode wire and usually just set them to zero, we don't use a lagrange polynomial to specify
     * the relation to be enforced just at odd indices, which brings the degree down by 1.
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

template <typename FF_> class TranslatorAccumulatorTransferRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 4; // degree((SOME_LAGRANGE)(A-B)) = 2
    static constexpr std::array<size_t, 12> SUBRELATION_PARTIAL_LENGTHS{
        4, // transfer accumulator limb 0 at odd index subrelation
        4, // transfer accumulator limb 1 at odd index subrelation
        4, // transfer accumulator limb 2 at odd index subrelation
        4, // transfer accumulator limb 3 at odd index subrelation
        4, // accumulator limb 0 is zero at the start of accumulation subrelation
        4, // accumulator limb 1 is zero at the start of accumulation subrelation
        4, // accumulator limb 2 is zero at the start of accumulation subrelation
        4, // accumulator limb 3 is zero at the start of accumulation subrelation
        4, // accumulator limb 0 is equal to given result at the end of accumulation subrelation
        4, // accumulator limb 1 is equal to given result at the end of accumulation subrelation
        4, // accumulator limb 2 is equal to given result at the end of accumulation subrelation
        4  // accumulator limb 3 is equal to given result at the end of accumulation subrelation

    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     * @details This has a negligible chance of failing in sumcheck (not in the first round) because effectively
     * transfrom original coefficients into a random linear combination. But checking each individually is noticeably
     * slower.
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.lagrange_odd_in_minicircuit + in.lagrange_last_in_minicircuit + in.lagrange_result_row).is_zero();
    }
    /**
     * @brief Relation enforcing non-arithmetic transitions of accumulator (value that is tracking the batched
     * evaluation of polynomials in non-native field)
     * @details This relation enforces three pieces of logic:
     * 1) Accumulator starts as zero before we start accumulating stuff
     * 2) Accumulator limbs stay the same if accumulation is not occurring (at odd indices)
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

template <typename FF_> class TranslatorZeroConstraintsRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 4; // degree((some lagrange)(A)) = 2

    static constexpr std::array<size_t, 64> SUBRELATION_PARTIAL_LENGTHS{
        4, // p_x_low_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // p_x_low_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // p_x_low_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // p_x_low_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // p_x_low_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_4 is zero outside of the minicircuit
        4, // relation_wide_limbs_range_constraint_0 is zero outside of the minicircuit
        4, // relation_wide_limbs_range_constraint_1 is zero outside of the minicircuit
        4, // relation_wide_limbs_range_constraint_2 is zero outside of the minicircuit
        4, // relation_wide_limbs_range_constraint_3 is zero outside of the minicircuit
        4, // p_x_low_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // p_x_high_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // p_y_low_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // p_y_high_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // z_low_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // z_high_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // accumulator_low_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // accumulator_high_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // quotient_low_limbs_range_constraint_tail is zero outside of the minicircuit
        4, // quotient_high_limbs_range_constraint_tail is zero outside of the minicircuit

    };

    /**
     * @brief Might return true if the contribution from all subrelations for the provided inputs is identically zero
     *
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        static constexpr auto minus_one = -FF(1);
        return (in.lagrange_even_in_minicircuit + in.lagrange_last_in_minicircuit + minus_one).is_zero();
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

template <typename FF> using TranslatorOpcodeConstraintRelation = Relation<TranslatorOpcodeConstraintRelationImpl<FF>>;

template <typename FF>
using TranslatorAccumulatorTransferRelation = Relation<TranslatorAccumulatorTransferRelationImpl<FF>>;

template <typename FF> using TranslatorZeroConstraintsRelation = Relation<TranslatorZeroConstraintsRelationImpl<FF>>;

} // namespace bb

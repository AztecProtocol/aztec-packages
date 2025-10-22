// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ArithmeticRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        6, // primary arithmetic sub-relation
        5  // secondary arithmetic sub-relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.q_arith.is_zero(); }

    /**
     * @brief Expression for the Ultra (width-4) Arithmetic gate.
     * @details This relation contains two subrelations and encapsulates several identities, toggled by the value of
     * q_arith in [0, 1, 2, 3].
     *
     * Subrelation 1:
     *      q_arith *
     *         [ (-1/2) * (q_arith - 3) * (q_m * w_1 * w_2) + \sum_{i=1..4} q_i * w_i + q_c + (q_arith - 1) * w_4_shift]
     *
     * Subrelation 2:
     *      q_arith * (q_arith - 1) * (q_arith - 2) * (w_1 + w_4 - w_1_shift + q_m)
     *
     * These formulas result in several cases depending on q_arith:
     *
     * CASE q_arith == 0: Arithmetic gate is completely disabled
     *
     * CASE q_arith == 1: Conventional 4-wire Ultra arithmetic relation
     *      Subrelation 1: q_m * w_1 * w_2 + \sum_{i=1..4} q_i * w_i + q_c
     *      Subrelation 2: Disabled
     *
     * CASE q_arith == 2: Same as above but with an additional linear term: +w_4_shift
     *      Subrelation 1: q_m * w_1 * w_2 + [ \sum_{i=1..4} q_i * w_i + q_c + w_4_shift ] * 2
     *      Subrelation 2: Disabled
     *      Note: Factor of 2 on the linear term must be accounted for when constructing inputs to the relation.
     *
     * CASE q_arith == 3:
     *      Subrelation 1: [ \sum_{i=1..4} q_i * w_i + q_c + (2 * w_4_shift) ] * 3
     *      Subrelation 2: [ w_1 + w_4 - w_1_shift + q_m ] * 6
     *      Note: We are repurposing q_m here as an additive term in the second subrelation.
     *      Note: Factor of 2 on the w_4_shift term must be accounted for when constructing inputs to the relation.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in Inputs to the relation algebra
     * @param parameters Unused in this relation
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  BB_UNUSED const Parameters& params,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto w_l_m = CoefficientAccumulator(in.w_l);
        auto w_4_m = CoefficientAccumulator(in.w_4);
        auto q_arith_m = CoefficientAccumulator(in.q_arith);
        auto q_m_m = CoefficientAccumulator(in.q_m);

        auto q_arith_sub_1 = q_arith_m - FF(1);
        auto scaled_q_arith = q_arith_m * scaling_factor;
        // Subrelation 1
        {
            using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

            auto w_4_shift_m = CoefficientAccumulator(in.w_4_shift);
            auto w_r_m = CoefficientAccumulator(in.w_r);
            auto w_o_m = CoefficientAccumulator(in.w_o);
            auto q_l_m = CoefficientAccumulator(in.q_l);
            auto q_r_m = CoefficientAccumulator(in.q_r);
            auto q_o_m = CoefficientAccumulator(in.q_o);
            auto q_4_m = CoefficientAccumulator(in.q_4);
            auto q_c_m = CoefficientAccumulator(in.q_c);

            static const FF neg_half = FF(-2).invert();

            auto tmp0 = Accumulator(w_r_m * w_l_m * neg_half) * Accumulator((q_arith_m - 3) * q_m_m);
            auto tmp1 = (q_l_m * w_l_m) + (q_r_m * w_r_m) + (q_o_m * w_o_m) + (q_4_m * w_4_m) + q_c_m;
            tmp1 += q_arith_sub_1 * w_4_shift_m;

            std::get<0>(evals) += (tmp0 + Accumulator(tmp1)) * Accumulator(scaled_q_arith);
        }
        // Subrelation 2
        {
            using ShortAccumulator = std::tuple_element_t<1, ContainerOverSubrelations>;

            auto w_l_shift_m = CoefficientAccumulator(in.w_l_shift);

            auto tmp_0 = w_l_m + w_4_m - w_l_shift_m + q_m_m;
            auto tmp_1 = tmp_0 * (q_arith_m - FF(2));
            auto tmp_2 = q_arith_sub_1 * scaled_q_arith;
            std::get<1>(evals) += ShortAccumulator(tmp_1) * ShortAccumulator(tmp_2);
        };
    };
};

template <typename FF> using ArithmeticRelation = Relation<ArithmeticRelationImpl<FF>>;
} // namespace bb

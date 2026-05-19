// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Delta Range Constraint Relation for efficient range checks
 *
 * @details This relation enables efficient range proofs by enforcing that consecutive wire values differ by at most 3.
 * When witnesses are sorted in ascending order, constraining adjacent differences to be in {0, 1, 2, 3} proves that
 * the full range of values lies within a bounded interval.
 *
 */
template <typename FF_> class DeltaRangeConstraintRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        6, // sub-relation 1: D_0 = w_2 - w_1
        6, // sub-relation 2: D_1 = w_3 - w_2
        6, // sub-relation 3: D_2 = w_4 - w_3
        6  // sub-relation 4: D_3 = w_1_shifst - w_4
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_delta_range].is_zero();
    }

    /**
     * @brief Expression for the generalized permutation sort gate.
     * @details The relation is defined as C(in(X)...) =
     *    q_delta_range * \sum{ i = [0, 3]} \alpha^i D_i(D_i - 1)(D_i - 2)(D_i - 3)
     *      where
     *      D_0 = w_2 - w_1
     *      D_1 = w_3 - w_2
     *      D_2 = w_4 - w_3
     *      D_3 = w_1_shift - w_4
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters unused
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  BB_UNUSED const Parameters&,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto w_1 = CoefficientAccumulator(in[AllEntities::EntityId::w_l]);
        auto w_2 = CoefficientAccumulator(in[AllEntities::EntityId::w_r]);
        auto w_3 = CoefficientAccumulator(in[AllEntities::EntityId::w_o]);
        auto w_4 = CoefficientAccumulator(in[AllEntities::EntityId::w_4]);
        auto w_1_shift = CoefficientAccumulator(in[AllEntities::EntityId::w_l_shift]);
        auto q_delta_range_m = CoefficientAccumulator(in[AllEntities::EntityId::q_delta_range]);

        auto q_delta_range_scaled_m = q_delta_range_m * scaling_factor;
        Accumulator q_delta_range_scaled(q_delta_range_scaled_m);

        // Compute wire differences
        auto delta_1 = Accumulator(w_2 - w_1);
        auto delta_2 = Accumulator(w_3 - w_2);
        auto delta_3 = Accumulator(w_4 - w_3);
        auto delta_4 = Accumulator(w_1_shift - w_4);

        // Polynomial trick: if T = (D - 3) * D, then T * (T + 2) == D * (D - 1) * (D - 2) * (D - 3)

        // Contribution (1)
        auto tmp_1 = (delta_1 - FF(3)) * delta_1;
        tmp_1 *= (tmp_1 + FF(2));
        tmp_1 *= q_delta_range_scaled;
        std::get<0>(accumulators) += tmp_1;

        // Contribution (2)
        auto tmp_2 = (delta_2 - FF(3)) * delta_2;
        tmp_2 *= (tmp_2 + FF(2));
        tmp_2 *= q_delta_range_scaled;
        std::get<1>(accumulators) += tmp_2;

        // Contribution (3)
        auto tmp_3 = (delta_3 - FF(3)) * delta_3;
        tmp_3 *= (tmp_3 + FF(2));
        tmp_3 *= q_delta_range_scaled;
        std::get<2>(accumulators) += tmp_3;

        // Contribution (4)
        auto tmp_4 = (delta_4 - FF(3)) * delta_4;
        tmp_4 *= (tmp_4 + FF(2));
        tmp_4 *= q_delta_range_scaled;
        std::get<3>(accumulators) += tmp_4;
    };
};

template <typename FF> using DeltaRangeConstraintRelation = Relation<DeltaRangeConstraintRelationImpl<FF>>;

} // namespace bb

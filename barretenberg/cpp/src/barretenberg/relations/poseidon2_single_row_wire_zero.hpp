#pragma once
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Companion relation for Poseidon2SingleRowRelation: enforces that wires are zero
 * when the selector is inactive.
 *
 * @details The Poseidon2SingleRowRelation folds q_poseidon2_single_row into the round constants
 * rather than multiplying every subrelation by the selector. This means the 88 main subrelations
 * are satisfied when q=0 AND all wires/columns are zero. This companion relation enforces the
 * wire-zeroing condition:
 *
 *   (1 - q_poseidon2_single_row) * w_l = 0
 *   (1 - q_poseidon2_single_row) * w_r = 0
 *   (1 - q_poseidon2_single_row) * w_o = 0
 *   (1 - q_poseidon2_single_row) * w_4 = 0
 *
 * The skip condition is inverted: this relation is skipped when q=1 (the common case).
 * It only activates on rows where q=0 to verify wires are zero there.
 *
 * 4 subrelations, each degree 2 (partial length 3).
 */
template <typename FF_> class Poseidon2SingleRowWireZeroRelationImpl {
  public:
    using FF = FF_;

    static constexpr size_t NUM_SUBRELATIONS = 4;
    static constexpr std::array<size_t, NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{ 3, 3, 3, 3 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // Skip when q_poseidon2_single_row = 1 (the active case). Only evaluate on inactive rows.
        return !in.q_poseidon2_single_row.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // (1 - q) * scaling_factor in CoefficientAccumulator
        auto one_minus_q_scaled =
            (-CoefficientAccumulator(in.q_poseidon2_single_row) + FF(1)) * scaling_factor;

        // (1 - q) * w_i = 0 for each wire
        // Degree: 1 * 1 = 2, partial length = 3
        auto w_l = CoefficientAccumulator(in.w_l);
        auto w_r = CoefficientAccumulator(in.w_r);
        auto w_o = CoefficientAccumulator(in.w_o);
        auto w_4 = CoefficientAccumulator(in.w_4);

        std::get<0>(evals) += Accumulator(w_l * one_minus_q_scaled);
        std::get<1>(evals) += Accumulator(w_r * one_minus_q_scaled);
        std::get<2>(evals) += Accumulator(w_o * one_minus_q_scaled);
        std::get<3>(evals) += Accumulator(w_4 * one_minus_q_scaled);
    };
};

template <typename FF>
using Poseidon2SingleRowWireZeroRelation = Relation<Poseidon2SingleRowWireZeroRelationImpl<FF>>;
} // namespace bb

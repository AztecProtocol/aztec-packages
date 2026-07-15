#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Initial-linear-layer relation for Poseidon2 (Mega).
 *
 * @details Poseidon2 begins with a linear-only application of the external matrix. Given input
 * \f$ \mathbf{x} = (x_0, x_1, x_2, x_3) \f$, this relation enforces
 * \f$ \mathbf{y} = M_E \cdot \mathbf{x} \f$.
 *
 * The row's wires hold the raw input; the next row's wires hold M_E · input. That next row is
 * the first external-round row, which consumes M_E · input as its starting state.
 *
 * Subrelations (each × q_poseidon2_external_initial × gate separator, partial degree 3):
 *   A_0:  5 w_l + 7 w_r +   w_o + 3 w_4  =  w_l_shift
 *   A_1:  4 w_l + 6 w_r +   w_o +   w_4  =  w_r_shift
 *   A_2:    w_l + 3 w_r + 5 w_o + 7 w_4  =  w_o_shift
 *   A_3:    w_l +   w_r + 4 w_o + 6 w_4  =  w_4_shift
 */
template <typename FF_> class Poseidon2InitialExternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        3, // A_0
        3, // A_1
        3, // A_2
        3, // A_3
    };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_poseidon2_external_initial].is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto x_0 = CoeffAcc(in[AllEntities::EntityId::w_l]);
        const auto x_1 = CoeffAcc(in[AllEntities::EntityId::w_r]);
        const auto x_2 = CoeffAcc(in[AllEntities::EntityId::w_o]);
        const auto x_3 = CoeffAcc(in[AllEntities::EntityId::w_4]);
        const auto y_0 = CoeffAcc(in[AllEntities::EntityId::w_l_shift]);
        const auto y_1 = CoeffAcc(in[AllEntities::EntityId::w_r_shift]);
        const auto y_2 = CoeffAcc(in[AllEntities::EntityId::w_o_shift]);
        const auto y_3 = CoeffAcc(in[AllEntities::EntityId::w_4_shift]);

        const auto q_sel = CoeffAcc(in[AllEntities::EntityId::q_poseidon2_external_initial]);
        const auto q_by_scaling = Accumulator(q_sel * scaling_factor);

        // Shared partial sums for M_E:
        //   y0 = 5x0 + 7x1 +  x2 + 3x3 = (4x0 + 6x1 + x2 + x3) + (x0 + x1 + 2x3)
        //   y1 = 4x0 + 6x1 +  x2 +  x3 = (2x0 + 2x1) + (2x0 + 2x1) + (2x1 + x2 + x3)
        //   y2 =  x0 + 3x1 + 5x2 + 7x3 = (2x1 + x2 + x3) + (x0 + x1 + 4x2 + 6x3)
        //   y3 =  x0 +  x1 + 4x2 + 6x3
        auto t0 = x_0 + x_1;      // x0 + x1
        auto t1 = x_2 + x_3;      // x2 + x3
        auto t2 = x_1 + x_1 + t1; // 2x1 + x2 + x3
        auto t3 = x_3 + x_3 + t0; // x0 + x1 + 2x3

        auto y3_calc = t1 + t1;
        y3_calc = y3_calc + y3_calc + t3; // 4x2 + 4x3 + (x0 + x1 + 2x3) = x0 + x1 + 4x2 + 6x3
        auto y1_calc = t0 + t0;
        y1_calc = y1_calc + y1_calc + t2; // 4x0 + 4x1 + (2x1 + x2 + x3) = 4x0 + 6x1 + x2 + x3
        auto y0_calc = t3 + y1_calc;      // (x0 + x1 + 2x3) + (4x0 + 6x1 + x2 + x3) = 5x0 + 7x1 + x2 + 3x3
        auto y2_calc = t2 + y3_calc;      // (2x1 + x2 + x3) + (x0 + x1 + 4x2 + 6x3) = x0 + 3x1 + 5x2 + 7x3

        // Each subrelation: q_sel · (y_k_calc - y_k) = 0.
        std::get<0>(evals) += q_by_scaling * Accumulator(y0_calc - y_0);
        std::get<1>(evals) += q_by_scaling * Accumulator(y1_calc - y_1);
        std::get<2>(evals) += q_by_scaling * Accumulator(y2_calc - y_2);
        std::get<3>(evals) += q_by_scaling * Accumulator(y3_calc - y_3);
    }
};

template <typename FF> using Poseidon2InitialExternalRelation = Relation<Poseidon2InitialExternalRelationImpl<FF>>;

} // namespace bb

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Initial-linear-layer relation for Poseidon2 (Mega).
 *
 * @details The standard Poseidon2 permutation begins with a "linear-only" application of the
 * external MDS matrix to the raw input — no S-box, no round constants. Concretely, given input
 * \f$ \mathbf{u} = (u_1, u_2, u_3, u_4) \f$, it computes \f$ \mathbf{v} = M_E \cdot \mathbf{u} \f$,
 * where M_E is the same matrix used by `Poseidon2ExternalRelation`.
 *
 * Without this relation, the initial linear layer would lower into ~6 arithmetic gates per hash
 * (see the previous `matrix_multiplication_external` lowering). Replacing those gates with a
 * single bespoke row constrained by this relation saves ~5 trace rows per Poseidon2 hash on Mega.
 *
 * The row's wires hold the **raw input** (\f$u_k = w_k\f$); the next row's wires hold M_E · input
 * (\f$v_k = w_{k,\text{shift}}\f$) — and that next row is the first external-round row, which
 * consumes M_E · input as its starting state.
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
        return in.q_poseidon2_external_initial.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto u_1 = CoeffAcc(in.w_l);
        const auto u_2 = CoeffAcc(in.w_r);
        const auto u_3 = CoeffAcc(in.w_o);
        const auto u_4 = CoeffAcc(in.w_4);
        const auto v_1 = CoeffAcc(in.w_l_shift);
        const auto v_2 = CoeffAcc(in.w_r_shift);
        const auto v_3 = CoeffAcc(in.w_o_shift);
        const auto v_4 = CoeffAcc(in.w_4_shift);

        const auto q_sel = CoeffAcc(in.q_poseidon2_external_initial);
        const auto q_by_scaling = Accumulator(q_sel * scaling_factor);

        // Shared partial sums (CoeffAcc-level — all free adds, no muls).
        // M_E layout (matching Poseidon2ExternalRelation):
        //   v1 = 5u1 + 7u2 +  u3 + 3u4 = (4u1 + 6u2 + u3 + u4) + (u1 + u2 + 2u4)
        //   v2 = 4u1 + 6u2 +  u3 +  u4 = (2u1 + 2u2) + (2u1 + 2u2) + (2u2 + u3 + u4)
        //   v3 =  u1 + 3u2 + 5u3 + 7u4 = (2u2 + u3 + u4) + (u1 + u2 + 4u3 + 6u4)
        //   v4 =  u1 +  u2 + 4u3 + 6u4
        auto t0 = u_1 + u_2;      // u1 + u2
        auto t1 = u_3 + u_4;      // u3 + u4
        auto t2 = u_2 + u_2 + t1; // 2u2 + u3 + u4
        auto t3 = u_4 + u_4 + t0; // u1 + u2 + 2u4

        auto v4_calc = t1 + t1;
        v4_calc = v4_calc + v4_calc + t3; // 4u3 + 4u4 + (u1 + u2 + 2u4) = u1 + u2 + 4u3 + 6u4
        auto v2_calc = t0 + t0;
        v2_calc = v2_calc + v2_calc + t2; // 4u1 + 4u2 + (2u2 + u3 + u4) = 4u1 + 6u2 + u3 + u4
        auto v1_calc = t3 + v2_calc;      // (u1 + u2 + 2u4) + (4u1 + 6u2 + u3 + u4) = 5u1 + 7u2 + u3 + 3u4
        auto v3_calc = t2 + v4_calc;      // (2u2 + u3 + u4) + (u1 + u2 + 4u3 + 6u4) = u1 + 3u2 + 5u3 + 7u4

        // Each subrelation: q_sel · (v_k_calc - v_k) = 0, with v_k_calc - v_k in CoeffAcc form
        // (free adds), promoted once per subrelation.
        std::get<0>(evals) += q_by_scaling * Accumulator(v1_calc - v_1);
        std::get<1>(evals) += q_by_scaling * Accumulator(v2_calc - v_2);
        std::get<2>(evals) += q_by_scaling * Accumulator(v3_calc - v_3);
        std::get<3>(evals) += q_by_scaling * Accumulator(v4_calc - v_4);
    }
};

template <typename FF> using Poseidon2InitialExternalRelation = Relation<Poseidon2InitialExternalRelationImpl<FF>>;

} // namespace bb

#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation for the K=4 compressed Poseidon2 internal block.
 *
 * @details The entry row holds the external-round output in standard encoding:
 *     (w_l, w_r, w_o, w_4) = (s_0, s_1, s_2, s_3) at the internal-block entry.
 * Its wires share witness indices with the `poseidon2_external` propagate row, so they
 * are copy-constrained to the true external output by the permutation relation.
 *
 * The successor is the first compressed row, whose wires encode state[0] at 4 consecutive rounds:
 *     (w_l_shift, w_r_shift, w_o_shift, w_4_shift)
 *       = (state[0] at round 0, round 1, round 2, round 3).
 *
 * w_l_shift = state[0] at round 0 = s_0 is enforced by the permutation relation because it shares
 * the entry row's w_l witness. The three subrelations below cover rounds 1, 2, 3.
 *
 * Each subrelation computes state[0] at the target round using the previous shifted wire, keeping
 * the per-variable degree at 5.
 *
 * Subrelations (each × q_poseidon2_transition_entry × gate separator, degree 7):
 *
 *   A_0 (round 1):
 *     w_r_shift = D_1 u_0 + w_r + w_o + w_4,     u_0 = (w_l + q_l)^5
 *
 *   A_1 (round 2):
 *     w_o_shift = D_1 u_1 + 3 u_0 + (D_2+2) w_r + (D_3+2) w_o + (D_4+2) w_4
 *     where u_1 = (w_r_shift + q_r)^5.
 *
 *   A_2 (round 3):
 *     w_4_shift = D_1 u_2 + 3 u_1 + (Σ + 6) u_0
 *                 + (D_2^2 + D_2 + Σ + 4) w_r
 *                 + (D_3^2 + D_3 + Σ + 4) w_o
 *                 + (D_4^2 + D_4 + Σ + 4) w_4
 *     where u_2 = (w_o_shift + q_o)^5.
 *
 * Selector layout on the entry row:
 *     q_l = c_{rounds_f_begin + 0}   // 1st internal round constant
 *     q_r = c_{rounds_f_begin + 1}
 *     q_o = c_{rounds_f_begin + 2}
 *     q_4, q_m, q_c, q_5 = 0 (unused)
 */
template <typename FF_> class Poseidon2TransitionEntryRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: w_r_shift check  (state[0] at round 1)
        7, // A_1: w_o_shift check  (state[0] at round 2)
        7, // A_2: w_4_shift check  (state[0] at round 3)
    };

    static constexpr fr D1 = QuadParams::D1;

    // Linear round-propagation vectors shared with the closed-form interior relation:
    //   A_one[j]  = D_{j+1} + 2                    — wire coefs in A_1 (state[0] at round 2)
    //   A2_one[j] = D_{j+1}^2 + D_{j+1} + Σ + 4    — wire coefs in A_2 (state[0] at round 3)
    //   sum_A_one = Σ + 6                          — u_0 coefficient in A_2
    static constexpr auto& A_one = QuadParams::A_one;
    static constexpr auto& A2_one = QuadParams::A2_one;
    static constexpr fr sum_A_one = QuadParams::sum_A_one;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_poseidon2_transition_entry].is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters& /*params*/,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto w_l = CoeffAcc(in[AllEntities::EntityId::w_l]);
        const auto w_r = CoeffAcc(in[AllEntities::EntityId::w_r]);
        const auto w_o = CoeffAcc(in[AllEntities::EntityId::w_o]);
        const auto w_4 = CoeffAcc(in[AllEntities::EntityId::w_4]);

        const auto w_r_shift = CoeffAcc(in[AllEntities::EntityId::w_r_shift]);
        const auto w_o_shift = CoeffAcc(in[AllEntities::EntityId::w_o_shift]);
        const auto w_4_shift = CoeffAcc(in[AllEntities::EntityId::w_4_shift]);

        const auto q_l = CoeffAcc(in[AllEntities::EntityId::q_l]);
        const auto q_r = CoeffAcc(in[AllEntities::EntityId::q_r]);
        const auto q_o = CoeffAcc(in[AllEntities::EntityId::q_o]);
        const auto q_sel = CoeffAcc(in[AllEntities::EntityId::q_poseidon2_transition_entry]);

        // The pow5 input is degree 1. We square it in the coefficient basis (x_m.sqr()) before promoting to the
        // Lagrange accumulator: squaring the narrow degree-1 representation is cheaper for the prover than promoting
        // to the wide univariate and squaring there. For the verifiers the coefficient basis is the scalar field,
        // so this is the same operation as promote-then-square -- no prover/verifier branch is needed and the
        // verification key is unchanged (guarded by RelationVkPinning).
        auto pow5 = [](const auto& x_m) -> Accumulator {
            const Accumulator x(x_m);
            const Accumulator sq(x_m.sqr());
            return sq.sqr() * x;
        };

        // u_0 = (w_l + q_l)^5
        auto u_0 = pow5(w_l + q_l);
        // u_1 = (w_r_shift + q_r)^5
        auto u_1 = pow5(w_r_shift + q_r);
        // u_2 = (w_o_shift + q_o)^5
        auto u_2 = pow5(w_o_shift + q_o);

        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        // Wire parts of the three subrelations, including shifted-row targets.
        auto wp_0 = w_r + w_o + w_4 - w_r_shift;
        auto wp_1 = w_r * A_one[0] + w_o * A_one[1] + w_4 * A_one[2] - w_o_shift;
        auto wp_2 = w_r * A2_one[0] + w_o * A2_one[1] + w_4 * A2_one[2] - w_4_shift;

        // A_0: D_1 u_0 + (w_r + w_o + w_4) - w_r_shift = 0.
        auto a0_body = u_0 * D1 + Accumulator(wp_0);
        std::get<0>(evals) += q_by_scaling * a0_body;

        // A_1: D_1 u_1 + 3 u_0 + (A·1)_j-weighted wire combo - w_o_shift = 0.
        auto a1_body = u_1 * D1 + u_0 * fr(3) + Accumulator(wp_1);
        std::get<1>(evals) += q_by_scaling * a1_body;

        // A_2: D_1 u_2 + 3 u_1 + (Σ+6) u_0 + (A^2·1)_j-weighted wire combo - w_4_shift = 0.
        auto a2_body = u_2 * D1 + u_1 * fr(3) + u_0 * sum_A_one + Accumulator(wp_2);
        std::get<2>(evals) += q_by_scaling * a2_body;
    }
};

template <typename FF> using Poseidon2TransitionEntryRelation = Relation<Poseidon2TransitionEntryRelationImpl<FF>>;

} // namespace bb

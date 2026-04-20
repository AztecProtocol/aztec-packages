#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation for the K=4 compressed Poseidon2 internal block.
 *
 * @details The entry row holds the external-round output in standard encoding:
 *     (w_l, w_r, w_o, w_4) = (s_0, s_1, s_2, s_3) at round 0 of internal rounds.
 * Its wires share witness indices with the `poseidon2_external` propagate row, so they
 * cryptographically match the true external output via the sigma permutation.
 *
 * The successor is the first compressed row, whose wires encode state[0] at 4 consecutive rounds:
 *     (w_l_shift, w_r_shift, w_o_shift, w_4_shift)
 *       = (state[0] at round 0, round 1, round 2, round 3).
 *
 * w_l_shift = state[0] at round 0 = s_0 — established via shared witness indices with the entry
 * row's w_l (enforced by the permutation relation). We therefore do NOT duplicate this as a
 * subrelation here; the three subrelations below cover rounds 1, 2, 3.
 *
 * The stepwise degree firewall uses shifted wires as fresh variables for rounds 2 and 3 so the
 * S-box never lands on a derived value. With committed-square S-boxes (u_k = z_k² · (w_k + c_k)),
 * each subrelation is degree 3 before selector multiplication; after the q_sel multiplication
 * they land at degree 4 (partial length 5).
 *
 * Subrelations (each × q_poseidon2_transition_entry × gate separator):
 *
 *   A_0 (round 1):
 *     w_r_shift = D_1 u_0 + w_r + w_o + w_4,     u_0 = z_l² · (w_l + q_l)
 *
 *   A_1 (round 2):
 *     w_o_shift = D_1 u_1 + 3 u_0 + (D_2+2) w_r + (D_3+2) w_o + (D_4+2) w_4
 *     where u_1 = z_r_shift² · (w_r_shift + q_r).
 *
 *   A_2 (round 3):
 *     w_4_shift = D_1 u_2 + 3 u_1 + (Σ + 6) u_0
 *                 + (D_2^2 + D_2 + Σ + 4) w_r
 *                 + (D_3^2 + D_3 + Σ + 4) w_o
 *                 + (D_4^2 + D_4 + Σ + 4) w_4
 *     where u_2 = z_o_shift² · (w_o_shift + q_o).
 *
 * Z-check: only z_l (current row) needs enforcement here — z_r_shift and z_o_shift are
 * enforced by the next row's double_internal z-check subrels (the next row's q_r and q_o
 * match this row's q_r and q_o respectively, since both encode the same internal round
 * constants c_{rounds_f_begin+1} and c_{rounds_f_begin+2}).
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

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        5, // A_0: w_r_shift check  (state[0] at round 1)
        5, // A_1: w_o_shift check  (state[0] at round 2)
        5, // A_2: w_4_shift check  (state[0] at round 3)
        4, // z_l - (w_l + q_l)^2 = 0   (shift-side z's enforced by next row)
    };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr SIGMA = QuadParams::SIGMA;

    // Linear coefficients on (w_r, w_o, w_4) in A_1 (state[0] at round 2):
    //   coefficient of w_k = D_{k+1} + 2
    static constexpr fr A1_COEF_WR = D2 + fr(2);
    static constexpr fr A1_COEF_WO = D3 + fr(2);
    static constexpr fr A1_COEF_W4 = D4 + fr(2);

    // Linear coefficients on (w_r, w_o, w_4) in A_2 (state[0] at round 3):
    //   coefficient of w_k = D_{k+1}^2 + D_{k+1} + Σ + 4
    static constexpr fr A2_COEF_WR = D2 * D2 + D2 + SIGMA + fr(4);
    static constexpr fr A2_COEF_WO = D3 * D3 + D3 + SIGMA + fr(4);
    static constexpr fr A2_COEF_W4 = D4 * D4 + D4 + SIGMA + fr(4);

    // Coefficient on u_0 in A_2:  Σ + 6
    static constexpr fr A2_COEF_U0 = SIGMA + fr(6);

    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_transition_entry.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters& /*params*/,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);

        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);
        const auto q_sel = CoeffAcc(in.q_poseidon2_transition_entry);

        // Committed S-box squares: z_l on current row, z_r_shift/z_o_shift from the next row.
        const auto z_l_ca = CoeffAcc(in.z_l);
        const auto z_r_shift_ca = CoeffAcc(in.z_r_shift);
        const auto z_o_shift_ca = CoeffAcc(in.z_o_shift);

        // x_l = w_l + q_l in CoefficientAccumulator (shared between u_0 and z-check).
        auto x_l_ca = w_l + q_l;

        // u_k = z_k² · x_k via CA square + one pointwise Lagrange multiplication.
        auto u_0 = Accumulator(z_l_ca * z_l_ca) * Accumulator(x_l_ca);
        auto u_1 = Accumulator(z_r_shift_ca * z_r_shift_ca) * Accumulator(w_r_shift + q_r);
        auto u_2 = Accumulator(z_o_shift_ca * z_o_shift_ca) * Accumulator(w_o_shift + q_o);

        const auto q_by_scaling_ca = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_ca);

        // ── A_0: w_r_shift - D_1 u_0 - w_r - w_o - w_4 = 0 ──
        auto a0_body = u_0 * D1 + Accumulator(w_r + w_o + w_4) - Accumulator(w_r_shift);
        std::get<0>(evals) += q_by_scaling * a0_body;

        // ── A_1: w_o_shift - D_1 u_1 - 3 u_0 - (D_2+2) w_r - (D_3+2) w_o - (D_4+2) w_4 = 0 ──
        auto a1_body = u_1 * D1 + u_0 * fr(3) + Accumulator(w_r * A1_COEF_WR + w_o * A1_COEF_WO + w_4 * A1_COEF_W4) -
                       Accumulator(w_o_shift);
        std::get<1>(evals) += q_by_scaling * a1_body;

        // ── A_2: w_4_shift - D_1 u_2 - 3 u_1 - (Σ+6) u_0 - (linear in w_r, w_o, w_4) = 0 ──
        auto a2_body = u_2 * D1 + u_1 * fr(3) + u_0 * A2_COEF_U0 +
                       Accumulator(w_r * A2_COEF_WR + w_o * A2_COEF_WO + w_4 * A2_COEF_W4) - Accumulator(w_4_shift);
        std::get<2>(evals) += q_by_scaling * a2_body;

        // ── Z-check for z_l: q_sel · (x_l² − z_l), promoted from CA to length-4 Accumulator ──
        using ZCheckAccumulator = std::tuple_element_t<3, ContainerOverSubrelations>;
        std::get<3>(evals) -= ZCheckAccumulator(q_by_scaling_ca) * ZCheckAccumulator(x_l_ca * x_l_ca - z_l_ca);
    }
};

template <typename FF> using Poseidon2TransitionEntryRelation = Relation<Poseidon2TransitionEntryRelationImpl<FF>>;

} // namespace bb

#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief K=8 compressed internal-round relation for Poseidon2.
 *
 * @details Processes EIGHT consecutive internal rounds per row. The row stores state[0] at eight
 * consecutive rounds across 4 standard wires plus 4 auxiliary Poseidon2 wires:
 *     w_l = s_0^{(0)},  w_r = s_0^{(1)},  w_o = s_0^{(2)},  w_4 = s_0^{(3)},
 *     p2_w_5 = s_0^{(4)},  p2_w_6 = s_0^{(5)},  p2_w_7 = s_0^{(6)},  p2_w_8 = s_0^{(7)}
 * plus this row's 8 round constants in q_l, q_r, q_o, q_4, q_m, q_c, q_5, q_6.
 *
 * Next-pair round constants (for the shift-side forward-Vandermonde check) are read via
 * SELECTOR SHIFTS:
 *     q_l_shift = c_{8(i+1)+0}, q_r_shift = c_{8(i+1)+1}, q_o_shift = c_{8(i+1)+2}.
 *
 * The non-S-boxed state cells (s_1, s_2, s_3) at round-start are DERIVED (not committed) by
 * solving the same 3x3 Vandermonde linear system as the K=4 relation:
 *     V * (s_1, s_2, s_3)^T = (b_1, b_2, b_3)^T,
 *     V = [[1,1,1],[D_2,D_3,D_4],[D_2^2,D_3^2,D_4^2]],
 *     b_1 = w_r - D_1 u_0
 *     b_2 = w_o - 2 w_r + (2 D_1 - 3) u_0 - D_1 u_1
 *     b_3 = w_4 - w_o - (Σ+2) w_r + ((Σ+2) D_1 - Σ - 3) u_0 + (D_1 - 3) u_1 - D_1 u_2
 * where u_k = (s_0^{(k)} + c_k)^5 and Σ = D_2 + D_3 + D_4. The 3-row system is solved via the
 * pre-computed Lagrange coefficients α_j^(k) from `Poseidon2QuadBn254Params`:
 *     s_j = α_j^(1) b_1 + α_j^(2) b_2 + α_j^(3) b_3.
 *
 * After the 8 rounds are applied natively inside the relation, we obtain
 *     (out_0, out_1, out_2, out_3) = state after round 8.
 *
 * The intermediate s_0 witnesses at rounds 4..7 (p2_w_5..p2_w_8) are NOT consumed by the b_1/b_2/b_3
 * Vandermonde rows (those use w_r, w_o, w_4 at rounds 1..3 only). They are constrained by 4
 * additional internal-consistency subrelations: the recurrence-computed s_0 at rounds 4..7 must
 * equal the prover-supplied witnesses.
 *
 * Subrelations:
 *
 *   Internal consistency (4 × degree 7):
 *     A_4: computed s_0^{(4)} = p2_w_5  (after recurrence step 3)
 *     A_5: computed s_0^{(5)} = p2_w_6  (after step 4)
 *     A_6: computed s_0^{(6)} = p2_w_7  (after step 5)
 *     A_7: computed s_0^{(7)} = p2_w_8  (after step 6)
 *
 *   Inter-row boundary (4 × degree 7):
 *     A_0: out_0 = w_l_shift                                                       (direct)
 *     A_1: out_1 + out_2 + out_3           = b_1_next
 *     A_2: D_2 out_1 + D_3 out_2 + D_4 out_3 = b_2_next
 *     A_3: D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3 = b_3_next
 *   where b_k_next are the same RHS formulas applied to the shifted wires + selector-shift
 *   next-pair constants.
 *
 * Degree: each subrelation has degree 5 in any single sumcheck variable (all S-boxes land on
 * distinct wires — degree firewall). Plus selector + gate separator → partial length 7.
 */
template <typename FF_> class Poseidon2QuadInternalK8RelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: out_0 - w_l_shift
        7, // A_1: forward Vandermonde row 1
        7, // A_2: forward Vandermonde row 2
        7, // A_3: forward Vandermonde row 3
        7, // A_4: internal consistency at round 4 (vs p2_w_5)
        7, // A_5: internal consistency at round 5 (vs p2_w_6)
        7, // A_6: internal consistency at round 6 (vs p2_w_7)
        7, // A_7: internal consistency at round 7 (vs p2_w_8)
    };

    // Diagonal constants
    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr SIGMA = QuadParams::SIGMA;

    // Lagrange coefficients for the inverse Vandermonde solve
    static constexpr fr A11 = QuadParams::alpha_1_1, A12 = QuadParams::alpha_1_2, A13 = QuadParams::alpha_1_3;
    static constexpr fr A21 = QuadParams::alpha_2_1, A22 = QuadParams::alpha_2_2, A23 = QuadParams::alpha_2_3;
    static constexpr fr A31 = QuadParams::alpha_3_1, A32 = QuadParams::alpha_3_2, A33 = QuadParams::alpha_3_3;

    // Pre-computed scalars used in b_2 and b_3 (same as K=4)
    static constexpr fr TWO_D1_MINUS_3 = D1 + D1 - fr(3);                  // 2 D_1 - 3
    static constexpr fr SIGMA_PLUS_2 = SIGMA + fr(2);                      // Σ + 2
    static constexpr fr B3_U0_COEF = (SIGMA + fr(2)) * D1 - SIGMA - fr(3); // (Σ+2) D_1 - Σ - 3
    static constexpr fr D1_MINUS_3 = D1 - fr(3);                           // D_1 - 3
    static constexpr fr D2_SQ = D2 * D2;
    static constexpr fr D3_SQ = D3 * D3;
    static constexpr fr D4_SQ = D4 * D4;

    /**
     * @brief Skip when the selector is identically zero on this edge.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_k8_internal.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        // ── Wire values (coefficient basis) ──
        // Standard wires: s_0 at rounds 0..3
        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);
        // Auxiliary Poseidon2 wires: s_0 at rounds 4..7
        const auto p2_w_5 = CoeffAcc(in.p2_w_5);
        const auto p2_w_6 = CoeffAcc(in.p2_w_6);
        const auto p2_w_7 = CoeffAcc(in.p2_w_7);
        const auto p2_w_8 = CoeffAcc(in.p2_w_8);

        // Shifted standard wires (next row's row-start state, used in forward-Vandermonde shift-side check)
        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        // Round constants for the current row (rounds 0..7).
        // q_m, q_c, q_5, q_6 are repurposed as round-constant slots on K=8 internal rows.
        const auto q_l = CoeffAcc(in.q_l); // c_0
        const auto q_r = CoeffAcc(in.q_r); // c_1
        const auto q_o = CoeffAcc(in.q_o); // c_2
        const auto q_4 = CoeffAcc(in.q_4); // c_3
        const auto q_m = CoeffAcc(in.q_m); // c_4
        const auto q_c = CoeffAcc(in.q_c); // c_5
        const auto q_5 = CoeffAcc(in.q_5); // c_6
        const auto q_6 = CoeffAcc(in.q_6); // c_7

        // Next-pair round constants (rounds 8, 9, 10) read via selector shifts. The successor row
        // is also a K=8 interior row, so its q_l, q_r, q_o carry rounds 0, 1, 2 of the next pair —
        // i.e. rounds 8, 9, 10 of the global sequence.
        const auto q_l_shift = CoeffAcc(in.q_l_shift); // c_8
        const auto q_r_shift = CoeffAcc(in.q_r_shift); // c_9
        const auto q_o_shift = CoeffAcc(in.q_o_shift); // c_10

        const auto q_sel = CoeffAcc(in.q_poseidon2_k8_internal);

        // Helper: compute fifth power as Accumulator (degree 5 in the input wire)
        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // ── Current row: u_k = (s_0^{(k)} + c_k)^5 for k = 0..7 ──
        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r + q_r));
        auto u_2 = pow5(Accumulator(w_o + q_o));
        auto u_3 = pow5(Accumulator(w_4 + q_4));
        auto u_4 = pow5(Accumulator(p2_w_5 + q_m));
        auto u_5 = pow5(Accumulator(p2_w_6 + q_c));
        auto u_6 = pow5(Accumulator(p2_w_7 + q_5));
        auto u_7 = pow5(Accumulator(p2_w_8 + q_6));

        // ── Compute b_1_next, b_2_next, b_3_next using shifted wires + next-pair constants ──
        auto u_0_next = pow5(Accumulator(w_l_shift + q_l_shift));
        auto u_1_next = pow5(Accumulator(w_r_shift + q_r_shift));
        auto u_2_next = pow5(Accumulator(w_o_shift + q_o_shift));

        auto u_0_next_D1 = u_0_next * D1;

        auto row_u_terms_4 = [&](const auto& row) { return u_0 * row[3] + u_1 * row[4] + u_2 * row[5] + u_3 * row[6]; };
        auto row_u_terms_5 = [&](const auto& row) { return row_u_terms_4(row) + u_4 * row[7]; };
        auto row_u_terms_6 = [&](const auto& row) { return row_u_terms_5(row) + u_5 * row[8]; };
        auto row_u_terms_7 = [&](const auto& row) { return row_u_terms_6(row) + u_6 * row[9]; };
        auto row_u_terms_8 = [&](const auto& row) {
            return u_0 * row[3] + u_1 * row[4] + u_2 * row[5] + u_3 * row[6] + u_4 * row[7] + u_5 * row[8] +
                   u_6 * row[9] + u_7 * row[10];
        };

        const auto& out_0_4_row = QuadParams::k8_tables.s0_after_round[0];
        const auto& out_0_5_row = QuadParams::k8_tables.s0_after_round[1];
        const auto& out_0_6_row = QuadParams::k8_tables.s0_after_round[2];
        const auto& out_0_7_row = QuadParams::k8_tables.s0_after_round[3];
        const auto& out_0_row = QuadParams::k8_tables.output_after_round_8[0];
        const auto& lhs_1_row = QuadParams::k8_tables.forward_vandermonde_lhs[0];
        const auto& lhs_2_row = QuadParams::k8_tables.forward_vandermonde_lhs[1];
        const auto& lhs_3_row = QuadParams::k8_tables.forward_vandermonde_lhs[2];

        auto out_0_4_wire = w_r * out_0_4_row[0] + w_o * out_0_4_row[1] + w_4 * out_0_4_row[2] - p2_w_5;
        auto out_0_5_wire = w_r * out_0_5_row[0] + w_o * out_0_5_row[1] + w_4 * out_0_5_row[2] - p2_w_6;
        auto out_0_6_wire = w_r * out_0_6_row[0] + w_o * out_0_6_row[1] + w_4 * out_0_6_row[2] - p2_w_7;
        auto out_0_7_wire = w_r * out_0_7_row[0] + w_o * out_0_7_row[1] + w_4 * out_0_7_row[2] - p2_w_8;
        auto out_0_wire = w_r * out_0_row[0] + w_o * out_0_row[1] + w_4 * out_0_row[2] - w_l_shift;

        auto lhs_1_wire = w_r * lhs_1_row[0] + w_o * lhs_1_row[1] + w_4 * lhs_1_row[2] - w_r_shift;
        auto lhs_2_wire =
            w_r * lhs_2_row[0] + w_o * lhs_2_row[1] + w_4 * lhs_2_row[2] - w_o_shift + w_r_shift + w_r_shift;
        auto lhs_3_wire = w_r * lhs_3_row[0] + w_o * lhs_3_row[1] + w_4 * lhs_3_row[2] - w_4_shift + w_o_shift +
                          w_r_shift * SIGMA_PLUS_2;

        // ── Constraint scalings ──
        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // ── A_0: out_0 - w_l_shift = 0 ──
        std::get<0>(evals) += q_times_scaling * (row_u_terms_8(out_0_row) + Accumulator(out_0_wire));

        // ── A_1: (out_1 + out_2 + out_3) - b_1_next = 0 ──
        std::get<1>(evals) += q_times_scaling * (row_u_terms_8(lhs_1_row) + u_0_next_D1 + Accumulator(lhs_1_wire));

        // ── A_2: (D_2 out_1 + D_3 out_2 + D_4 out_3) - b_2_next = 0 ──
        std::get<2>(evals) +=
            q_times_scaling * (row_u_terms_8(lhs_2_row) - (u_0_next_D1 + u_0_next_D1) +
                               (u_0_next + u_0_next + u_0_next) + u_1_next * D1 + Accumulator(lhs_2_wire));

        // ── A_3: (D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3) - b_3_next = 0 ──
        std::get<3>(evals) += q_times_scaling * (row_u_terms_8(lhs_3_row) - u_0_next * B3_U0_COEF -
                                                 u_1_next * D1_MINUS_3 + u_2_next * D1 + Accumulator(lhs_3_wire));

        // ── Internal consistency at rounds 4..7 ──
        std::get<4>(evals) += q_times_scaling * (row_u_terms_4(out_0_4_row) + Accumulator(out_0_4_wire));
        std::get<5>(evals) += q_times_scaling * (row_u_terms_5(out_0_5_row) + Accumulator(out_0_5_wire));
        std::get<6>(evals) += q_times_scaling * (row_u_terms_6(out_0_6_row) + Accumulator(out_0_6_wire));
        std::get<7>(evals) += q_times_scaling * (row_u_terms_7(out_0_7_row) + Accumulator(out_0_7_wire));
    }
};

template <typename FF> using Poseidon2QuadInternalK8Relation = Relation<Poseidon2QuadInternalK8RelationImpl<FF>>;

} // namespace bb

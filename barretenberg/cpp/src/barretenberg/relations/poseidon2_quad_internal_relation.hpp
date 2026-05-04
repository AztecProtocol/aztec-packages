#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief K=4 compressed internal-round relation for Poseidon2.
 *
 * @details Processes four consecutive internal rounds per row. The row stores state[0] at four
 * consecutive rounds:
 *     w_l = s_0^{(0)}, w_r = s_0^{(1)}, w_o = s_0^{(2)}, w_4 = s_0^{(3)}
 * plus this quad's four round constants in q_l, q_r, q_o, q_4 and the next quad's first three round
 * constants in q_m, q_c, q_5 (used for the shifted Vandermonde check).
 *
 * The non-S-boxed state elements (s_1, s_2, s_3) at round-start are derived, not committed, by
 * solving a 3x3 Vandermonde linear system:
 *     V * (s_1, s_2, s_3)^T = (b_1, b_2, b_3)^T
 * with V = [[1,1,1],[D_2,D_3,D_4],[D_2^2,D_3^2,D_4^2]] and
 *     b_1 = w_r - D_1 u_0
 *     b_2 = w_o - 2 w_r + (2 D_1 - 3) u_0 - D_1 u_1
 *     b_3 = w_4 - w_o - (Σ+2) w_r + ((Σ+2) D_1 - Σ - 3) u_0 + (D_1 - 3) u_1 - D_1 u_2
 * where u_k = (s_0^{(k)} + c_k)^5 and Σ = D_2 + D_3 + D_4.
 *
 * The inverse uses pre-computed Lagrange coefficients α_j^(k) from `Poseidon2QuadBn254Params`:
 *     s_j = α_j^(1) b_1 + α_j^(2) b_2 + α_j^(3) b_3.
 *
 * The closed-form table represents the result after applying the four internal rounds:
 *     (out_0, out_1, out_2, out_3) = state after round 4.
 * The constraints against the next row use the forward Vandermonde matrix (avoids Lagrange on the
 * shift side): if the successor is another compressed row with wires
 * (w_l_shift, w_r_shift, w_o_shift, w_4_shift) and next-quad constants (q_m, q_c, q_5), then
 *     A_0: out_0 = w_l_shift                                                       (direct)
 *     A_1: out_1 + out_2 + out_3           = b_1_next
 *     A_2: D_2 out_1 + D_3 out_2 + D_4 out_3 = b_2_next
 *     A_3: D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3 = b_3_next
 * where b_k_next are the same RHS formulas applied to the shifted wires and next-quad constants.
 *
 * Degree: each subrelation has degree 5 in any single sumcheck variable (all S-boxes land on
 * distinct wires). Plus selector + gate separator = 7.
 */
template <typename FF_> class Poseidon2QuadInternalRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: out_0 - w_l_shift
        7, // A_1: forward Vandermonde row 1
        7, // A_2: forward Vandermonde row 2
        7, // A_3: forward Vandermonde row 3
    };

    // Constants used only by the shift-side b_k_next reconstruction. The wire/u multipliers
    // for out_0 and the three forward-Vandermonde LHS rows live in `QuadParams::closed_form`
    // and `QuadParams::forward_vandermonde_lhs`, so D_2..D_4 / Σ / D_*² are not needed here.
    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr SIGMA_PLUS_2 = QuadParams::SIGMA + fr(2);                   // Σ + 2
    static constexpr fr B3_U0_COEF = SIGMA_PLUS_2 * D1 - QuadParams::SIGMA - fr(3); // (Σ+2) D_1 - Σ - 3
    static constexpr fr D1_MINUS_3 = D1 - fr(3);                                    // D_1 - 3

    /**
     * @brief Skip when the selector is identically zero on this row.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_quad_internal.is_zero();
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
        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);

        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        // Round constants (current row)
        const auto q_l = CoeffAcc(in.q_l); // c_{4i}
        const auto q_r = CoeffAcc(in.q_r); // c_{4i+1}
        const auto q_o = CoeffAcc(in.q_o); // c_{4i+2}
        const auto q_4 = CoeffAcc(in.q_4); // c_{4i+3}
        // Next-quad round constants (for forward-Vandermonde shift-side check)
        const auto q_m = CoeffAcc(in.q_m); // c_{4(i+1)}
        const auto q_c = CoeffAcc(in.q_c); // c_{4(i+1)+1}
        const auto q_5 = CoeffAcc(in.q_5); // c_{4(i+1)+2}

        const auto q_sel = CoeffAcc(in.q_poseidon2_quad_internal);

        // Helper: compute fifth power as Accumulator (degree 5 in the input wire).
        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // ── Current row: u_k = (s_0^{(k)} + c_k)^5 ──
        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r + q_r));
        auto u_2 = pow5(Accumulator(w_o + q_o));
        auto u_3 = pow5(Accumulator(w_4 + q_4));

        // ── Closed-form linear combinations consumed by the four subrelations ──
        // A_0 needs `out_0` (state[0] at round 4); coefficients in `closed_form[0]`.
        // A_1, A_2, A_3 need the three forward-Vandermonde LHS sums of (out_1, out_2, out_3),
        // each itself a fixed linear combo of (w_r, w_o, w_4, u_0..u_3) with coefficients in
        // `forward_vandermonde_lhs`. We compute those LHS sums directly — `out_1, out_2, out_3`
        // never need to be materialized individually here.
        //
        // Table row layout: 7 coefficients on (w_r, w_o, w_4, u_0, u_1, u_2, u_3). Wire scalings
        // stay in CoeffAcc; u-scalings are Acc×Fr.
        // ── Shift-side S-boxes (next-quad constants on shifted wires) ──
        auto u_0_next = pow5(Accumulator(w_l_shift + q_m));
        auto u_1_next = pow5(Accumulator(w_r_shift + q_c));
        auto u_2_next = pow5(Accumulator(w_o_shift + q_5));
        auto u_0_next_D1 = u_0_next * D1;

        // ── Subrelation bodies, with shift-side wire offsets folded into the CoeffAcc combo ──
        // Each subrelation body has the form
        //     (u-coef · u_*) + (shift-side u-contribution from -b_k_next) + Accumulator(wp_full)
        // where wp_full bundles the LHS closed-form wire-coefs AND the RHS shifted-wire offsets
        // (from -b_k_next or -w_l_shift). This collapses what used to be three separate
        // promotions per row (one for the LHS wire combo, one for `Accumulator(w_*_shift)` /
        // `Accumulator(b_k_next wire part)`) into a single promotion per subrelation.
        const auto& cf0 = QuadParams::tables.closed_form[0];
        const auto& l0 = QuadParams::tables.forward_vandermonde_lhs[0];
        const auto& l1 = QuadParams::tables.forward_vandermonde_lhs[1];
        const auto& l2 = QuadParams::tables.forward_vandermonde_lhs[2];

        auto wp0_full = w_r * cf0[0] + w_o * cf0[1] + w_4 * cf0[2] - w_l_shift;
        auto wp1_full = w_r * l0[0] + w_o * l0[1] + w_4 * l0[2] - w_r_shift;
        auto wp2_full = w_r * l1[0] + w_o * l1[1] + w_4 * l1[2] - w_o_shift + w_r_shift + w_r_shift;
        auto wp3_full = w_r * l2[0] + w_o * l2[1] + w_4 * l2[2] - w_4_shift + w_o_shift + w_r_shift * SIGMA_PLUS_2;

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // ── A_0: out_0 - w_l_shift = 0 ──
        auto a0_body = u_0 * cf0[3] + u_1 * cf0[4] + u_2 * cf0[5] + u_3 * cf0[6] + Accumulator(wp0_full);
        std::get<0>(evals) += q_times_scaling * a0_body;

        // ── A_1: (out_1 + out_2 + out_3) - b_1_next = 0
        //        b_1_next = Acc(w_r_shift) - u_0_next * D_1, so subtraction adds +u_0_next_D1.
        auto a1_body = u_0 * l0[3] + u_1 * l0[4] + u_2 * l0[5] + u_3 * l0[6] + u_0_next_D1 + Accumulator(wp1_full);
        std::get<1>(evals) += q_times_scaling * a1_body;

        // ── A_2: (D_2 out_1 + D_3 out_2 + D_4 out_3) - b_2_next = 0
        //        b_2_next u-part = 2 u_0_next_D1 - 3 u_0_next - u_1_next * D_1
        //        subtraction flips sign: -2 u_0_next_D1 + 3 u_0_next + u_1_next * D_1
        auto a2_body = u_0 * l1[3] + u_1 * l1[4] + u_2 * l1[5] + u_3 * l1[6] - (u_0_next_D1 + u_0_next_D1) +
                       (u_0_next + u_0_next + u_0_next) + u_1_next * D1 + Accumulator(wp2_full);
        std::get<2>(evals) += q_times_scaling * a2_body;

        // ── A_3: (D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3) - b_3_next = 0
        //        b_3_next u-part = u_0_next * B3_U0_COEF + u_1_next * D1_MINUS_3 - u_2_next * D_1
        //        subtraction flips sign on each.
        auto a3_body = u_0 * l2[3] + u_1 * l2[4] + u_2 * l2[5] + u_3 * l2[6] - u_0_next * B3_U0_COEF -
                       u_1_next * D1_MINUS_3 + u_2_next * D1 + Accumulator(wp3_full);
        std::get<3>(evals) += q_times_scaling * a3_body;
    }
};

template <typename FF> using Poseidon2QuadInternalRelation = Relation<Poseidon2QuadInternalRelationImpl<FF>>;

} // namespace bb

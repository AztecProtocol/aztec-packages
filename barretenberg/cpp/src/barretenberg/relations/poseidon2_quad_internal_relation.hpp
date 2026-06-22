#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief K=4 compressed internal-round relation for Poseidon2.
 *
 * @details Each active row stores state[0] at four consecutive internal rounds:
 *     w_l = s_0^{(0)}, w_r = s_0^{(1)}, w_o = s_0^{(2)}, w_4 = s_0^{(3)}
 * and uses q_l, q_r, q_o, q_4 as the four current-round constants. For a non-terminal row, q_m,
 * q_c, q_5 contain the next quad's first three constants.
 *
 * `Poseidon2QuadBn254Params` provides closed-form coefficients for the state after four rounds:
 *     (out_0, out_1, out_2, out_3).
 * This relation connects that output to the next compressed row:
 *     A_0: out_0 = w_l_shift                                                       (direct)
 *     A_1: out_1 + out_2 + out_3           = b_1_next
 *     A_2: D_2 out_1 + D_3 out_2 + D_4 out_3 = b_2_next
 *     A_3: D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3 = b_3_next
 * where b_k_next are the Vandermonde right-hand sides reconstructed from the shifted row.
 *
 * High-level picture. The relation never recovers any hidden-lane vector — at runtime there is
 * no matrix inversion and no committed s_1, s_2, s_3 anywhere. Instead, both sides of the
 * cross-row hidden-lane equation are computed as linear combinations of committed wires, and
 * only those linear combinations are compared. The trick is:
 *
 *   1. Predicted output (from current row): the full state vector at internal round 4(i+1) —
 *      i.e. one round past the four rounds covered by this quad — is denoted
 *        (out_0, out_1, out_2, out_3).
 *      Each component is a fixed linear combination of the current row's committed lane-0 chain
 *      and S-box outputs (u_0..u_3), precomputed as the closed-form matrix C in
 *      `Poseidon2QuadBn254Params::tables.closed_form`. Then apply V to the predicted hidden
 *      lanes (out_1, out_2, out_3) — that's also a fixed linear combination of the same wires,
 *      precomputed as `forward_vandermonde_lhs`. Call the result LHS_k for k = 1, 2, 3.
 *   2. Encoded next-row input (from next row): the next row's start-of-row hidden lanes
 *      (s_1', s_2', s_3') are NOT committed. But Theorem (1) of QUAD_THEOREM.md says
 *        V · (s_1', s_2', s_3')^T  =  (b_1', b_2', b_3')
 *      where the b'-formulas express b_k' as an explicit linear combination of the next row's
 *      committed lane-0 chain and S-box outputs (using the next quad's first three round
 *      constants, carried on this row in q_m, q_c, q_5 because Mega lacks shifted selectors).
 *      So V · (next row's hidden input) is computable without ever committing the hidden input
 *      — call this RHS_k.
 *   3. Set them equal:
 *        - lane 0: out_0 = w_l_shift directly (subrelation A_0).
 *        - lanes 1..3: LHS_k = RHS_k for k = 1, 2, 3 (subrelations A_1, A_2, A_3).
 *      Both sides are polynomials in committed wires; the verifier evaluates them and checks
 *      equality. No hidden lanes are ever materialized; no V^{-1} is ever applied at runtime.
 *
 * Why equality of encodings suffices. We're really enforcing
 *      V · (out_1, out_2, out_3)^T  =  V · (s_1', s_2', s_3')^T.
 * Because V is invertible (D_2, D_3, D_4 pairwise distinct, statically asserted in
 * `poseidon2_quad_params.hpp`), this is mathematically equivalent to the desired
 *      (out_1, out_2, out_3)  =  (s_1', s_2', s_3').
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

    // Constants used by the shifted-row Vandermonde RHS reconstruction.
    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr SIGMA_PLUS_2 = QuadParams::SIGMA + fr(2);                   // Σ + 2
    static constexpr fr B3_U0_COEF = SIGMA_PLUS_2 * D1 - QuadParams::SIGMA - fr(3); // (Σ+2) D_1 - Σ - 3
    static constexpr fr D1_MINUS_3 = D1 - fr(3);                                    // D_1 - 3

    /**
     * @brief Skip when the selector is identically zero on this row.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_poseidon2_quad_internal].is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        // Wire values: current row's committed lane-0 chain (state[0] at the four rounds covered
        // by this quad).
        const auto w_l = CoeffAcc(in[AllEntities::EntityId::w_l]); // s_0^(0): row's lane-0 at round 4i
        const auto w_r = CoeffAcc(in[AllEntities::EntityId::w_r]); // s_0^(1): row's lane-0 at round 4i+1
        const auto w_o = CoeffAcc(in[AllEntities::EntityId::w_o]); // s_0^(2): row's lane-0 at round 4i+2
        const auto w_4 = CoeffAcc(in[AllEntities::EntityId::w_4]); // s_0^(3): row's lane-0 at round 4i+3

        // Next row's committed lane-0 chain.
        const auto w_l_shift =
            CoeffAcc(in[AllEntities::EntityId::w_l_shift]); // next row's s_0^(0) (= state[0] at round 4(i+1))
        const auto w_r_shift = CoeffAcc(in[AllEntities::EntityId::w_r_shift]); // next row's s_0^(1)
        const auto w_o_shift = CoeffAcc(in[AllEntities::EntityId::w_o_shift]); // next row's s_0^(2)
        const auto w_4_shift = CoeffAcc(in[AllEntities::EntityId::w_4_shift]); // next row's s_0^(3)

        // Round constants (current row), used to compute u_0..u_3.
        const auto q_l = CoeffAcc(in[AllEntities::EntityId::q_l]); // c_{4i}
        const auto q_r = CoeffAcc(in[AllEntities::EntityId::q_r]); // c_{4i+1}
        const auto q_o = CoeffAcc(in[AllEntities::EntityId::q_o]); // c_{4i+2}
        const auto q_4 = CoeffAcc(in[AllEntities::EntityId::q_4]); // c_{4i+3}
        // Next quad's first three round constants. Needed to compute u_0', u_1', u_2', which
        // appear in the b'-formulas (RHS of the cross-row encoding equation). Carried on the
        // current row in q_m, q_c, q_5 because Mega has no shifted selectors.
        const auto q_m = CoeffAcc(in[AllEntities::EntityId::q_m]); // c_{4(i+1)}
        const auto q_c = CoeffAcc(in[AllEntities::EntityId::q_c]); // c_{4(i+1)+1}
        const auto q_5 = CoeffAcc(in[AllEntities::EntityId::q_5]); // c_{4(i+1)+2}

        const auto q_sel = CoeffAcc(in[AllEntities::EntityId::q_poseidon2_quad_internal]);

        // Helper: compute fifth power as Accumulator (degree 5 in the input wire).
        // The pow5 input is degree 1. In the prover (Accumulator is a Univariate, so it has ::LENGTH)
        // the first square is taken in coefficient basis (3 muls) before promoting to the length-7
        // Lagrange accumulator. Both verifiers accumulate into scalars (Accumulator = FF, no ::LENGTH)
        // and keep the original promote-then-square path, so their constraints are unchanged.
        auto pow5 = [](const auto& x_m) -> Accumulator {
            const Accumulator x(x_m);
            if constexpr (requires { Accumulator::LENGTH; }) {
                const Accumulator sq(x_m.sqr());
                return sq.sqr() * x;
            } else {
                const auto sq = x.sqr();
                return sq.sqr() * x;
            }
        };

        // ── Current row: u_k = (s_0^{(k)} + c_k)^5. The four S-box outputs feed the closed-form
        //                   prediction of the row-end state. ──
        auto u_0 = pow5(w_l + q_l); // u_0 = (s_0^(0) + c_{4i})^5
        auto u_1 = pow5(w_r + q_r); // u_1 = (s_0^(1) + c_{4i+1})^5
        auto u_2 = pow5(w_o + q_o); // u_2 = (s_0^(2) + c_{4i+2})^5
        auto u_3 = pow5(w_4 + q_4); // u_3 = (s_0^(3) + c_{4i+3})^5

        // ── Next row's S-box outputs. Together with the next row's lane-0 wires they let us
        //    forward-compute V · (next row's hidden lanes) via the b'-formulas, without ever
        //    materializing the hidden lanes themselves. Only three (not four) because the
        //    b'-formulas only depend on u_0', u_1', u_2'. ──
        auto u_0_next = pow5(w_l_shift + q_m); // u_0' = (next_s_0^(0) + c_{4(i+1)})^5
        auto u_1_next = pow5(w_r_shift + q_c); // u_1' = (next_s_0^(1) + c_{4(i+1)+1})^5
        auto u_2_next = pow5(w_o_shift + q_5); // u_2' = (next_s_0^(2) + c_{4(i+1)+2})^5
        auto u_0_next_D1 = u_0_next * D1;      // CSE: D_1 · u_0' is reused in A_1 and A_2

        // Precomputed coefficient vectors. Each is indexed [W_R, W_O, W_4, U_0, U_1, U_2, U_3].
        const auto& cf0 = QuadParams::tables.closed_form[0];            // out_0 (row-end lane 0)
        const auto& l0 = QuadParams::tables.forward_vandermonde_lhs[0]; // out_1 + out_2 + out_3
        const auto& l1 = QuadParams::tables.forward_vandermonde_lhs[1]; // D_2 out_1 + D_3 out_2 + D_4 out_3
        const auto& l2 = QuadParams::tables.forward_vandermonde_lhs[2]; // D_2² out_1 + D_3² out_2 + D_4² out_3

        // Wire-only parts of the four subrelations. Each subrelation A_K has the form
        //   A_K  =  (LHS_K computed from current row)  -  (RHS_K computed from next row).
        // wpK_full collects all the wire-only terms (no u_*) from BOTH sides at once; the u_*
        // terms are folded in below in aK_body.
        //   A_0:  LHS = out_0,                              RHS = w_l_shift.
        //   A_1:  LHS = out_1 + out_2 + out_3,              RHS = b_1' = w_r' - D_1 u_0'.
        //   A_2:  LHS = D_2 out_1 + D_3 out_2 + D_4 out_3,  RHS = b_2' = w_o' - 2 w_r' + (2 D_1 - 3) u_0' - D_1 u_1'.
        //   A_3:  LHS = D_2² out_1 + D_3² out_2 + D_4² out_3, RHS = b_3' = w_4' - w_o' - (Σ+2) w_r' + ...
        // The LHS wire contributions come from cf0 / l0 / l1 / l2 (forward V applied to predicted
        // output); the RHS wire contributions are the shifted lane-0 wires multiplied by the
        // coefficients with which they appear in the b'-formulas above.
        auto wp0_full = w_r * cf0[0] + w_o * cf0[1] + w_4 * cf0[2] - w_l_shift;
        auto wp1_full = w_r * l0[0] + w_o * l0[1] + w_4 * l0[2] - w_r_shift;
        auto wp2_full = w_r * l1[0] + w_o * l1[1] + w_4 * l1[2] - w_o_shift + w_r_shift + w_r_shift;
        auto wp3_full = w_r * l2[0] + w_o * l2[1] + w_4 * l2[2] - w_4_shift + w_o_shift + w_r_shift * SIGMA_PLUS_2;

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // A_0: out_0 - w_l_shift = 0.
        auto a0_body = u_0 * cf0[3] + u_1 * cf0[4] + u_2 * cf0[5] + u_3 * cf0[6] + Accumulator(wp0_full);
        std::get<0>(evals) += q_times_scaling * a0_body;

        // A_1: (out_1 + out_2 + out_3) - b_1_next = 0.
        auto a1_body = u_0 * l0[3] + u_1 * l0[4] + u_2 * l0[5] + u_3 * l0[6] + u_0_next_D1 + Accumulator(wp1_full);
        std::get<1>(evals) += q_times_scaling * a1_body;

        // A_2: (D_2 out_1 + D_3 out_2 + D_4 out_3) - b_2_next = 0.
        auto a2_body = u_0 * l1[3] + u_1 * l1[4] + u_2 * l1[5] + u_3 * l1[6] - (u_0_next_D1 + u_0_next_D1) +
                       (u_0_next + u_0_next + u_0_next) + u_1_next * D1 + Accumulator(wp2_full);
        std::get<2>(evals) += q_times_scaling * a2_body;

        // A_3: (D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3) - b_3_next = 0.
        auto a3_body = u_0 * l2[3] + u_1 * l2[4] + u_2 * l2[5] + u_3 * l2[6] - u_0_next * B3_U0_COEF -
                       u_1_next * D1_MINUS_3 + u_2_next * D1 + Accumulator(wp3_full);
        std::get<3>(evals) += q_times_scaling * a3_body;
    }
};

template <typename FF> using Poseidon2QuadInternalRelation = Relation<Poseidon2QuadInternalRelationImpl<FF>>;

} // namespace bb

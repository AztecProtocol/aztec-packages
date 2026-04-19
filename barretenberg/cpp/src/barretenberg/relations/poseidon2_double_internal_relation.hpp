#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief K=4 compressed internal-round relation for Poseidon2, 7-wire committed-state variant.
 *
 * @details Processes FOUR consecutive internal rounds per row. The state at the row's first round
 * is FULLY committed (no Vandermonde reconstruction):
 *
 *     w_l     = s_0 at round 4i            (state[0])
 *     w_r     = s_0 at round 4i+1
 *     w_o     = s_0 at round 4i+2
 *     w_4     = s_0 at round 4i+3
 *     w_p2_s1 = s_1 at round 4i            (state[1] at row-start)
 *     w_p2_s2 = s_2 at round 4i            (state[2])
 *     w_p2_s3 = s_3 at round 4i            (state[3])
 *
 * The four S-box constants for this row are stored in q_l, q_r, q_o, q_4. No next-pair constants
 * are needed — the successor row's state[1..3] at its own row-start are read directly from
 * (w_p2_s1_shift, w_p2_s2_shift, w_p2_s3_shift), so we do not firewall via (w_l_shift + q_m)^5
 * etc. This eliminates the 3 "next-pair" S-boxes per row present in the 4-wire encoding and the
 * entire Vandermonde row-reduction that derived (s_1, s_2, s_3) from (w_r, w_o, w_4).
 *
 * Forward recurrence applied natively inside the relation:
 *
 *     u_k = (s_0^{(4i+k)} + c_{4i+k})^5
 *     s_0^{(4i+k+1)} = D_1 u_k + s_1^{(k)} + s_2^{(k)} + s_3^{(k)}
 *     s_j^{(4i+k+1)} = u_k + sum_j s_j^{(k)} + (D_{j+1} - 1) s_j^{(k)}    (j = 1, 2, 3)
 *
 * 7 subrelations, each of univariate degree 5 (S-box on a fresh committed wire) + 1 (selector)
 * + 1 (gate separator) = 7:
 *
 *     A_0: D_1 u_0 + sum_0       = w_r            (state[0] at round 1)
 *     A_1: D_1 u_1 + sum_1       = w_o            (state[0] at round 2)
 *     A_2: D_1 u_2 + sum_2       = w_4            (state[0] at round 3)
 *     A_3: D_1 u_3 + sum_3       = w_l_shift      (state[0] at round 4 = next row's w_l)
 *     A_4: s_1 at round 4        = w_p2_s1_shift  (state[1] at round 4 = next row's w_p2_s1)
 *     A_5: s_2 at round 4        = w_p2_s2_shift
 *     A_6: s_3 at round 4        = w_p2_s3_shift
 *
 * where `sum_k` denotes s_1^{(k)} + s_2^{(k)} + s_3^{(k)} and is carried across rounds.
 *
 * Degree firewall: each S-box input (w_l, w_r, w_o, w_4) is its own committed wire and appears
 * in exactly one S-box. Each s_j^{(k)} is linear in the preceding u_* and the committed
 * (w_p2_s1, w_p2_s2, w_p2_s3). No composed S-box on a derived quantity — degree stays at 5 in
 * every subrelation.
 */
template <typename FF_> class Poseidon2DoubleInternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: D_1 u_0 + sum_0 - w_r
        7, // A_1: D_1 u_1 + sum_1 - w_o
        7, // A_2: D_1 u_2 + sum_2 - w_4
        7, // A_3: D_1 u_3 + sum_3 - w_l_shift
        7, // A_4: s_1 at round 4 - w_p2_s1_shift
        7, // A_5: s_2 at round 4 - w_p2_s2_shift
        7, // A_6: s_3 at round 4 - w_p2_s3_shift
    };

    static constexpr fr D2_MINUS_1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr fr D3_MINUS_1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr fr D4_MINUS_1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];
    static constexpr fr D1 = fr(1) + crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_double_internal.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        // Committed state[0] at 4 consecutive rounds (current row)
        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);

        // Committed state[1..3] at row start
        const auto s1_0 = CoeffAcc(in.w_p2_s1);
        const auto s2_0 = CoeffAcc(in.w_p2_s2);
        const auto s3_0 = CoeffAcc(in.w_p2_s3);

        // Successor row's state[0..3] at that row's start (= our round-4 state)
        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto s1_shift = CoeffAcc(in.w_p2_s1_shift);
        const auto s2_shift = CoeffAcc(in.w_p2_s2_shift);
        const auto s3_shift = CoeffAcc(in.w_p2_s3_shift);

        // S-box constants for this row's 4 rounds
        const auto q_l = CoeffAcc(in.q_l); // c_{4i+0}
        const auto q_r = CoeffAcc(in.q_r); // c_{4i+1}
        const auto q_o = CoeffAcc(in.q_o); // c_{4i+2}
        const auto q_4 = CoeffAcc(in.q_4); // c_{4i+3}

        const auto q_sel = CoeffAcc(in.q_poseidon2_double_internal);
        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // ── S-boxes: each operates on its own committed wire (degree firewall) ──
        const auto u_0 = pow5(Accumulator(w_l + q_l));
        const auto u_1 = pow5(Accumulator(w_r + q_r));
        const auto u_2 = pow5(Accumulator(w_o + q_o));
        const auto u_3 = pow5(Accumulator(w_4 + q_4));

        // Forward recurrence. We carry `sum_k = s_1^{(k)} + s_2^{(k)} + s_3^{(k)}` to avoid
        // recomputing it per update, and update (s1, s2, s3) in place.
        Accumulator s1 = Accumulator(s1_0);
        Accumulator s2 = Accumulator(s2_0);
        Accumulator s3 = Accumulator(s3_0);
        Accumulator sum = s1 + s2 + s3;

        // Advance one round: produce state[0] at round k+1 (returned) and update (s1, s2, s3)
        // and sum in place.
        //
        // new_s_i = u + sum + (D_{i+1}-1) * s_i
        // new_sum = 3*(u + sum) + (D_2-1)*s1 + (D_3-1)*s2 + (D_4-1)*s3
        auto advance = [&](const Accumulator& u) -> Accumulator {
            auto t = u + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
            sum = s1 + s2 + s3;
            // s_0 at round k+1 = D_1 u + (sum at round k), but we've already overwritten sum.
            // The caller receives this value via a separate return path below.
            (void)t;
            return Accumulator{}; // placeholder (see below)
        };
        (void)advance; // unused — we inline manually to capture pre-step sum for the A_k bodies.

        // ── Round 0 → 1 ──
        // Capture state[0] at round 1 BEFORE advancing the non-s0 elements (needs old sum).
        auto s0_at_round_1 = u_0 * D1 + sum;

        // Step state[1..3] and refresh `sum`.
        {
            auto t = u_0 + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
            sum = s1 + s2 + s3;
        }

        // ── Round 1 → 2 ──
        auto s0_at_round_2 = u_1 * D1 + sum;
        {
            auto t = u_1 + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
            sum = s1 + s2 + s3;
        }

        // ── Round 2 → 3 ──
        auto s0_at_round_3 = u_2 * D1 + sum;
        {
            auto t = u_2 + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
            sum = s1 + s2 + s3;
        }

        // ── Round 3 → 4 ──
        auto s0_at_round_4 = u_3 * D1 + sum;
        {
            auto t = u_3 + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
            // sum not needed past this point
        }
        auto& s1_at_round_4 = s1;
        auto& s2_at_round_4 = s2;
        auto& s3_at_round_4 = s3;

        // ── Subrelations ──
        //
        // Each body is `q_sel * scaling * (computed - committed)`. The committed side is
        // monomial-only; we fold it into q_by_scaling in length-3 CoefAcc form and promote once,
        // then add the pre-scaled degree-5 computed side. This matches the `Poseidon2InternalRelation`
        // wire-peel pattern.

        std::get<0>(evals) += s0_at_round_1 * q_by_scaling - Accumulator(w_r * q_by_scaling_m);
        std::get<1>(evals) += s0_at_round_2 * q_by_scaling - Accumulator(w_o * q_by_scaling_m);
        std::get<2>(evals) += s0_at_round_3 * q_by_scaling - Accumulator(w_4 * q_by_scaling_m);
        std::get<3>(evals) += s0_at_round_4 * q_by_scaling - Accumulator(w_l_shift * q_by_scaling_m);
        std::get<4>(evals) += s1_at_round_4 * q_by_scaling - Accumulator(s1_shift * q_by_scaling_m);
        std::get<5>(evals) += s2_at_round_4 * q_by_scaling - Accumulator(s2_shift * q_by_scaling_m);
        std::get<6>(evals) += s3_at_round_4 * q_by_scaling - Accumulator(s3_shift * q_by_scaling_m);
    }
};

template <typename FF> using Poseidon2DoubleInternalRelation = Relation<Poseidon2DoubleInternalRelationImpl<FF>>;

} // namespace bb

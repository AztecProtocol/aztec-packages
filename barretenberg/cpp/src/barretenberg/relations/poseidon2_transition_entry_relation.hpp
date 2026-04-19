#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation for the K=4 compressed Poseidon2 internal block, 7-wire variant.
 *
 * @details The entry row holds the external-round output in standard encoding:
 *     (w_l, w_r, w_o, w_4) = (s_0, s_1, s_2, s_3) at internal round 0
 * (copy-constrained via shared witness indices with the `poseidon2_external` propagate row).
 *
 * The successor is the first compressed row, whose committed wires are:
 *     (w_l_shift, w_r_shift, w_o_shift, w_4_shift)   = state[0] at rounds 0, 1, 2, 3
 *     (w_p2_s1_shift, w_p2_s2_shift, w_p2_s3_shift)  = state[1..3] at round 0
 *
 * Bindings we must enforce on the successor row's committed state:
 *
 *     state[0] at round 0 = s_0 (= entry's w_l)         — via sigma/copy-constraint (no subrelation)
 *     state[1..3] at round 0 = (s_1, s_2, s_3)          — 3 linear subrelations below
 *     state[0] at round 1, 2, 3                         — 3 degree-5 subrelations (S-box firewall chain)
 *
 * Round constants for the firewall S-boxes live in q_l, q_r, q_o on the entry row
 * (q_4, q_m, q_c, q_5 unused).
 *
 * Six subrelations, all of partial length 7 (some are effectively linear but padded for uniformity):
 *
 *     A_0:  w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4                     = 0
 *     A_1:  w_o_shift - D_1 (w_r_shift + q_r)^5 - 3 u_0 - (D_2+2) w_r
 *                     - (D_3+2) w_o - (D_4+2) w_4                                = 0
 *     A_2:  w_4_shift - D_1 (w_o_shift + q_o)^5 - 3 u_1 - (Σ + 6) u_0
 *                     - (D_2^2 + D_2 + Σ + 4) w_r - (D_3^2 + D_3 + Σ + 4) w_o
 *                     - (D_4^2 + D_4 + Σ + 4) w_4                                = 0
 *     A_3:  w_p2_s1_shift - w_r                                                  = 0
 *     A_4:  w_p2_s2_shift - w_o                                                  = 0
 *     A_5:  w_p2_s3_shift - w_4                                                  = 0
 */
template <typename FF_> class Poseidon2TransitionEntryRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: w_r_shift check (round 1 state[0])
        7, // A_1: w_o_shift check (round 2 state[0])
        7, // A_2: w_4_shift check (round 3 state[0])
        7, // A_3: w_p2_s1_shift - w_r
        7, // A_4: w_p2_s2_shift - w_o
        7, // A_5: w_p2_s3_shift - w_4
    };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr SIGMA = QuadParams::SIGMA;

    // Linear coefficients on (w_r, w_o, w_4) in A_1 (state[0] at round 2)
    static constexpr fr A1_COEF_WR = D2 + fr(2);
    static constexpr fr A1_COEF_WO = D3 + fr(2);
    static constexpr fr A1_COEF_W4 = D4 + fr(2);

    // Linear coefficients on (w_r, w_o, w_4) in A_2 (state[0] at round 3)
    static constexpr fr A2_COEF_WR = D2 * D2 + D2 + SIGMA + fr(4);
    static constexpr fr A2_COEF_WO = D3 * D3 + D3 + SIGMA + fr(4);
    static constexpr fr A2_COEF_W4 = D4 * D4 + D4 + SIGMA + fr(4);
    static constexpr fr A2_COEF_U0 = SIGMA + fr(6);

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_transition_entry.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
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

        const auto s1_shift = CoeffAcc(in.w_p2_s1_shift);
        const auto s2_shift = CoeffAcc(in.w_p2_s2_shift);
        const auto s3_shift = CoeffAcc(in.w_p2_s3_shift);

        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);

        const auto q_sel = CoeffAcc(in.q_poseidon2_transition_entry);
        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // Degree-firewall S-boxes: each uses a committed wire (w_l, or a shifted wire) as input.
        const auto u_0 = pow5(Accumulator(w_l + q_l));       // firewall via w_l
        const auto u_1 = pow5(Accumulator(w_r_shift + q_r)); // firewall via w_r_shift (fresh witness)
        const auto u_2 = pow5(Accumulator(w_o_shift + q_o)); // firewall via w_o_shift

        // ── A_0: w_r_shift - D_1 u_0 - w_r - w_o - w_4 = 0 ──
        // `u_0 * D1` is degree 5; the wire-only part fuses into q_by_scaling_m in monomial form.
        auto a0_wire_m = (w_r + w_o + w_4 - w_r_shift) * q_by_scaling_m;
        std::get<0>(evals) += u_0 * D1 * q_by_scaling + Accumulator(a0_wire_m);

        // ── A_1: w_o_shift - D_1 u_1 - 3 u_0 - (D_2+2) w_r - (D_3+2) w_o - (D_4+2) w_4 = 0 ──
        auto a1_wire_m = (w_r * A1_COEF_WR + w_o * A1_COEF_WO + w_4 * A1_COEF_W4 - w_o_shift) * q_by_scaling_m;
        std::get<1>(evals) += u_1 * D1 * q_by_scaling + u_0 * fr(3) * q_by_scaling + Accumulator(a1_wire_m);

        // ── A_2: w_4_shift - D_1 u_2 - 3 u_1 - (Σ+6) u_0 - (linear in w_r, w_o, w_4) = 0 ──
        auto a2_wire_m = (w_r * A2_COEF_WR + w_o * A2_COEF_WO + w_4 * A2_COEF_W4 - w_4_shift) * q_by_scaling_m;
        std::get<2>(evals) += u_2 * D1 * q_by_scaling + u_1 * fr(3) * q_by_scaling + u_0 * A2_COEF_U0 * q_by_scaling +
                              Accumulator(a2_wire_m);

        // ── A_3/A_4/A_5: state[1..3] at round 0 of the first compressed row (linear) ──
        // w_p2_s_k_shift - (standard-encoded state[k] at round 0 = w_r / w_o / w_4) = 0
        std::get<3>(evals) += Accumulator((w_r - s1_shift) * q_by_scaling_m);
        std::get<4>(evals) += Accumulator((w_o - s2_shift) * q_by_scaling_m);
        std::get<5>(evals) += Accumulator((w_4 - s3_shift) * q_by_scaling_m);
    }
};

template <typename FF> using Poseidon2TransitionEntryRelation = Relation<Poseidon2TransitionEntryRelationImpl<FF>>;

} // namespace bb

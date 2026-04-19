#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Terminal variant of the K=4 compressed internal-round relation, 7-wire committed-state.
 *
 * @details Same 4-round forward recurrence as `Poseidon2DoubleInternalRelationImpl`, but the
 * successor is the standard-encoded bridge row: its 4 wires hold (s_0, s_1, s_2, s_3) at the
 * post-internal round. Subrelations A_4/A_5/A_6 therefore match the round-4 state[1..3]
 * directly against (w_r_shift, w_o_shift, w_4_shift), not against (w_p2_s1_shift, ...).
 *
 * Committed on the terminal row (same layout as interior):
 *     w_l, w_r, w_o, w_4 = state[0] at rounds 4i..4i+3
 *     w_p2_s1, w_p2_s2, w_p2_s3 = state[1..3] at round 4i
 *
 * 7 subrelations, each degree 7:
 *     A_0: D_1 u_0 + sum_0 = w_r
 *     A_1: D_1 u_1 + sum_1 = w_o
 *     A_2: D_1 u_2 + sum_2 = w_4
 *     A_3: D_1 u_3 + sum_3 = w_l_shift      (bridge row's s_0)
 *     A_4: s_1 at round 4  = w_r_shift      (bridge row's s_1 — standard encoding)
 *     A_5: s_2 at round 4  = w_o_shift      (bridge row's s_2)
 *     A_6: s_3 at round 4  = w_4_shift      (bridge row's s_3)
 */
template <typename FF_> class Poseidon2DoubleInternalTerminalRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7, 7, 7, 7 };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr D2_MINUS_1 = D2 - fr(1);
    static constexpr fr D3_MINUS_1 = D3 - fr(1);
    static constexpr fr D4_MINUS_1 = D4 - fr(1);

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_double_internal_terminal.is_zero();
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

        const auto s1_0 = CoeffAcc(in.w_p2_s1);
        const auto s2_0 = CoeffAcc(in.w_p2_s2);
        const auto s3_0 = CoeffAcc(in.w_p2_s3);

        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);
        const auto q_4 = CoeffAcc(in.q_4);

        const auto q_sel = CoeffAcc(in.q_poseidon2_double_internal_terminal);
        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        const auto u_0 = pow5(Accumulator(w_l + q_l));
        const auto u_1 = pow5(Accumulator(w_r + q_r));
        const auto u_2 = pow5(Accumulator(w_o + q_o));
        const auto u_3 = pow5(Accumulator(w_4 + q_4));

        Accumulator s1 = Accumulator(s1_0);
        Accumulator s2 = Accumulator(s2_0);
        Accumulator s3 = Accumulator(s3_0);
        Accumulator sum = s1 + s2 + s3;

        // Round 0 → 1
        auto s0_r1 = u_0 * D1 + sum;
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
        // Round 1 → 2
        auto s0_r2 = u_1 * D1 + sum;
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
        // Round 2 → 3
        auto s0_r3 = u_2 * D1 + sum;
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
        // Round 3 → 4
        auto s0_r4 = u_3 * D1 + sum;
        {
            auto t = u_3 + sum;
            Accumulator new_s1 = t + s1 * D2_MINUS_1;
            Accumulator new_s2 = t + s2 * D3_MINUS_1;
            Accumulator new_s3 = t + s3 * D4_MINUS_1;
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
        }

        std::get<0>(evals) += s0_r1 * q_by_scaling - Accumulator(w_r * q_by_scaling_m);
        std::get<1>(evals) += s0_r2 * q_by_scaling - Accumulator(w_o * q_by_scaling_m);
        std::get<2>(evals) += s0_r3 * q_by_scaling - Accumulator(w_4 * q_by_scaling_m);
        std::get<3>(evals) += s0_r4 * q_by_scaling - Accumulator(w_l_shift * q_by_scaling_m);
        std::get<4>(evals) += s1 * q_by_scaling - Accumulator(w_r_shift * q_by_scaling_m);
        std::get<5>(evals) += s2 * q_by_scaling - Accumulator(w_o_shift * q_by_scaling_m);
        std::get<6>(evals) += s3 * q_by_scaling - Accumulator(w_4_shift * q_by_scaling_m);
    }
};

template <typename FF>
using Poseidon2DoubleInternalTerminalRelation = Relation<Poseidon2DoubleInternalTerminalRelationImpl<FF>>;

} // namespace bb

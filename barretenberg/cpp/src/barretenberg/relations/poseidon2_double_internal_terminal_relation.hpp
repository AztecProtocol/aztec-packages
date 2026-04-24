#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Terminal variant of the K=4 compressed internal-round relation.
 *
 * @details Same 4-round computation as `Poseidon2DoubleInternalRelationImpl`, but the successor
 * is the standard-encoded bridge row (not another compressed row). The A_k constraints directly
 * match out_k against w_{k,shift} — no forward-Vandermonde reconstruction on the shift side.
 *
 * This ties the compressed chain's output state (state[0..3] after 56 internal rounds) to
 * witnesses that the first final-external gate consumes via shared witness indices.
 *
 * Selector layout on the terminal row:
 *     q_l = c_{4i}, q_r = c_{4i+1}, q_o = c_{4i+2}, q_4 = c_{4i+3}   // this (last) pair
 *     q_m, q_c, q_5 = 0 (unused — no next pair)
 */
template <typename FF_> class Poseidon2DoubleInternalTerminalRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7 };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr SIGMA = QuadParams::SIGMA;

    static constexpr fr A11 = QuadParams::alpha_1_1, A12 = QuadParams::alpha_1_2, A13 = QuadParams::alpha_1_3;
    static constexpr fr A21 = QuadParams::alpha_2_1, A22 = QuadParams::alpha_2_2, A23 = QuadParams::alpha_2_3;
    static constexpr fr A31 = QuadParams::alpha_3_1, A32 = QuadParams::alpha_3_2, A33 = QuadParams::alpha_3_3;

    static constexpr fr TWO_D1_MINUS_3 = D1 + D1 - fr(3);
    static constexpr fr SIGMA_PLUS_2 = SIGMA + fr(2);
    static constexpr fr B3_U0_COEF = (SIGMA + fr(2)) * D1 - SIGMA - fr(3);
    static constexpr fr D1_MINUS_3 = D1 - fr(3);

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_double_internal_terminal.is_zero();
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

        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);
        const auto q_4 = CoeffAcc(in.q_4);

        const auto q_sel = CoeffAcc(in.q_poseidon2_double_internal_terminal);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // ── S-boxes for the 4 rounds ──
        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r + q_r));
        auto u_2 = pow5(Accumulator(w_o + q_o));
        auto u_3 = pow5(Accumulator(w_4 + q_4));

        // ── Vandermonde RHS for the current row ──
        // Share u_0 * D_1 between b_1 and b_2: u_0*(2 D_1 - 3) = 2*(u_0*D_1) - 3*u_0
        auto u_0_D1 = u_0 * D1;
        auto b_1 = Accumulator(w_r) - u_0_D1;
        auto b_2 = Accumulator(w_o - w_r - w_r) + (u_0_D1 + u_0_D1) - (u_0 + u_0 + u_0) - u_1 * D1;
        auto b_3 = Accumulator(w_4 - w_o - w_r * SIGMA_PLUS_2) + u_0 * B3_U0_COEF + u_1 * D1_MINUS_3 - u_2 * D1;

        // ── Lagrange solve for (s_1, s_2, s_3) at row start ──
        auto s1 = b_1 * A11 + b_2 * A12 + b_3 * A13;
        auto s2 = b_1 * A21 + b_2 * A22 + b_3 * A23;
        auto s3 = b_1 * A31 + b_2 * A32 + b_3 * A33;

        // ── Iterate the recurrence 4 rounds ──
        auto step = [](Accumulator& x1, Accumulator& x2, Accumulator& x3, const Accumulator& u) {
            auto sum = x1 + x2 + x3;
            auto t = u + sum;
            Accumulator new_s1 = t + x1 * (D2 - fr(1));
            Accumulator new_s2 = t + x2 * (D3 - fr(1));
            Accumulator new_s3 = t + x3 * (D4 - fr(1));
            x1 = new_s1;
            x2 = new_s2;
            x3 = new_s3;
        };

        step(s1, s2, s3, u_0);
        step(s1, s2, s3, u_1);
        step(s1, s2, s3, u_2);
        // After 3 steps, (s1, s2, s3) = state[1..3] at round 3.
        auto T_3 = s1 + s2 + s3;
        auto out_0 = u_3 * D1 + T_3;

        step(s1, s2, s3, u_3);
        auto& out_1 = s1;
        auto& out_2 = s2;
        auto& out_3 = s3;

        // ── Direct match against standard-encoded successor ──
        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        std::get<0>(evals) += q_by_scaling * (out_0 - Accumulator(w_l_shift));
        std::get<1>(evals) += q_by_scaling * (out_1 - Accumulator(w_r_shift));
        std::get<2>(evals) += q_by_scaling * (out_2 - Accumulator(w_o_shift));
        std::get<3>(evals) += q_by_scaling * (out_3 - Accumulator(w_4_shift));
    }
};

template <typename FF>
using Poseidon2DoubleInternalTerminalRelation = Relation<Poseidon2DoubleInternalTerminalRelationImpl<FF>>;

} // namespace bb

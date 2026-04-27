#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief K=8 compressed internal-round terminal relation for Poseidon2.
 *
 * @details Same row layout as `Poseidon2QuadInternalK8RelationImpl` (8 internal rounds per row,
 * s_0 in w_l..w_4 + p2_w_5..p2_w_8, 8 round constants in q_l..q_4, q_m, q_c, q_5, q_6,
 * (s_1, s_2, s_3) at row-start derived via 3x3 Vandermonde solve from b_1, b_2, b_3) but the
 * successor row is STANDARD-ENCODED (post-internal external block), not another K=8 row. The
 * shift-side forward-Vandermonde check is therefore replaced by direct 4-wire checks against
 * the successor's standard state.
 *
 * Subrelations (each * q_poseidon2_k8_internal_terminal * gate separator, partial length 7):
 *
 *   Internal consistency at rounds 4..7 (4 subrels, identical to interior):
 *     A_4: computed s_0^{(4)} = p2_w_5
 *     A_5: computed s_0^{(5)} = p2_w_6
 *     A_6: computed s_0^{(6)} = p2_w_7
 *     A_7: computed s_0^{(7)} = p2_w_8
 *
 *   Inter-row boundary at round 8 (4 subrels, direct standard-state checks):
 *     A_0: out_0 = w_l_shift   (s_0 at round 8)
 *     A_1: out_1 = w_r_shift   (s_1 at round 8)
 *     A_2: out_2 = w_o_shift   (s_2 at round 8)
 *     A_3: out_3 = w_4_shift   (s_3 at round 8)
 */
template <typename FF_> class Poseidon2QuadInternalK8TerminalRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7, 7, 7, 7, 7 };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;
    static constexpr fr SIGMA = QuadParams::SIGMA;

    static constexpr fr A11 = QuadParams::alpha_1_1, A12 = QuadParams::alpha_1_2, A13 = QuadParams::alpha_1_3;
    static constexpr fr A21 = QuadParams::alpha_2_1, A22 = QuadParams::alpha_2_2, A23 = QuadParams::alpha_2_3;
    static constexpr fr A31 = QuadParams::alpha_3_1, A32 = QuadParams::alpha_3_2, A33 = QuadParams::alpha_3_3;

    static constexpr fr SIGMA_PLUS_2 = SIGMA + fr(2);
    static constexpr fr B3_U0_COEF = (SIGMA + fr(2)) * D1 - SIGMA - fr(3);
    static constexpr fr D1_MINUS_3 = D1 - fr(3);

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_k8_internal_terminal.is_zero();
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
        const auto p2_w_5 = CoeffAcc(in.p2_w_5);
        const auto p2_w_6 = CoeffAcc(in.p2_w_6);
        const auto p2_w_7 = CoeffAcc(in.p2_w_7);
        const auto p2_w_8 = CoeffAcc(in.p2_w_8);

        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);
        const auto q_4 = CoeffAcc(in.q_4);
        const auto q_m = CoeffAcc(in.q_m);
        const auto q_c = CoeffAcc(in.q_c);
        const auto q_5 = CoeffAcc(in.q_5);
        const auto q_6 = CoeffAcc(in.q_6);

        const auto q_sel = CoeffAcc(in.q_poseidon2_k8_internal_terminal);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r + q_r));
        auto u_2 = pow5(Accumulator(w_o + q_o));
        auto u_3 = pow5(Accumulator(w_4 + q_4));
        auto u_4 = pow5(Accumulator(p2_w_5 + q_m));
        auto u_5 = pow5(Accumulator(p2_w_6 + q_c));
        auto u_6 = pow5(Accumulator(p2_w_7 + q_5));
        auto u_7 = pow5(Accumulator(p2_w_8 + q_6));

        // Vandermonde RHS (b_1, b_2, b_3) — same as interior.
        auto u_0_D1 = u_0 * D1;
        auto b_1 = Accumulator(w_r) - u_0_D1;
        auto b_2 = Accumulator(w_o - w_r - w_r) + (u_0_D1 + u_0_D1) - (u_0 + u_0 + u_0) - u_1 * D1;
        auto b_3 = Accumulator(w_4 - w_o - w_r * SIGMA_PLUS_2) + u_0 * B3_U0_COEF + u_1 * D1_MINUS_3 - u_2 * D1;

        // Lagrange solve at round 0.
        auto s1 = b_1 * A11 + b_2 * A12 + b_3 * A13;
        auto s2 = b_1 * A21 + b_2 * A22 + b_3 * A23;
        auto s3 = b_1 * A31 + b_2 * A32 + b_3 * A33;

        auto step = [](Accumulator& s1, Accumulator& s2, Accumulator& s3, const Accumulator& u) {
            auto sum = s1 + s2 + s3;
            auto t = u + sum;
            Accumulator new_s1 = t + s1 * (D2 - fr(1));
            Accumulator new_s2 = t + s2 * (D3 - fr(1));
            Accumulator new_s3 = t + s3 * (D4 - fr(1));
            s1 = new_s1;
            s2 = new_s2;
            s3 = new_s3;
        };

        step(s1, s2, s3, u_0);
        step(s1, s2, s3, u_1);
        step(s1, s2, s3, u_2);

        // After step 3, capture s_0_4 and check vs p2_w_5.
        auto T_3 = s1 + s2 + s3;
        auto out_0_4 = u_3 * D1 + T_3;
        step(s1, s2, s3, u_3);

        auto T_4 = s1 + s2 + s3;
        auto out_0_5 = u_4 * D1 + T_4;
        step(s1, s2, s3, u_4);

        auto T_5 = s1 + s2 + s3;
        auto out_0_6 = u_5 * D1 + T_5;
        step(s1, s2, s3, u_5);

        auto T_6 = s1 + s2 + s3;
        auto out_0_7 = u_6 * D1 + T_6;
        step(s1, s2, s3, u_6);

        auto T_7 = s1 + s2 + s3;
        auto out_0 = u_7 * D1 + T_7;
        step(s1, s2, s3, u_7);
        auto& out_1 = s1;
        auto& out_2 = s2;
        auto& out_3 = s3;

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // Boundary: standard 4-wire check (no shift-side Vandermonde — successor is standard-encoded).
        std::get<0>(evals) += q_times_scaling * (out_0 - Accumulator(w_l_shift));
        std::get<1>(evals) += q_times_scaling * (out_1 - Accumulator(w_r_shift));
        std::get<2>(evals) += q_times_scaling * (out_2 - Accumulator(w_o_shift));
        std::get<3>(evals) += q_times_scaling * (out_3 - Accumulator(w_4_shift));

        // Internal consistency at rounds 4..7.
        std::get<4>(evals) += q_times_scaling * (out_0_4 - Accumulator(p2_w_5));
        std::get<5>(evals) += q_times_scaling * (out_0_5 - Accumulator(p2_w_6));
        std::get<6>(evals) += q_times_scaling * (out_0_6 - Accumulator(p2_w_7));
        std::get<7>(evals) += q_times_scaling * (out_0_7 - Accumulator(p2_w_8));
    }
};

template <typename FF>
using Poseidon2QuadInternalK8TerminalRelation = Relation<Poseidon2QuadInternalK8TerminalRelationImpl<FF>>;

} // namespace bb

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
        const auto& out_1_row = QuadParams::k8_tables.output_after_round_8[1];
        const auto& out_2_row = QuadParams::k8_tables.output_after_round_8[2];
        const auto& out_3_row = QuadParams::k8_tables.output_after_round_8[3];

        auto out_0_wire = w_r * out_0_row[0] + w_o * out_0_row[1] + w_4 * out_0_row[2] - w_l_shift;
        auto out_1_wire = w_r * out_1_row[0] + w_o * out_1_row[1] + w_4 * out_1_row[2] - w_r_shift;
        auto out_2_wire = w_r * out_2_row[0] + w_o * out_2_row[1] + w_4 * out_2_row[2] - w_o_shift;
        auto out_3_wire = w_r * out_3_row[0] + w_o * out_3_row[1] + w_4 * out_3_row[2] - w_4_shift;

        auto out_0_4_wire = w_r * out_0_4_row[0] + w_o * out_0_4_row[1] + w_4 * out_0_4_row[2] - p2_w_5;
        auto out_0_5_wire = w_r * out_0_5_row[0] + w_o * out_0_5_row[1] + w_4 * out_0_5_row[2] - p2_w_6;
        auto out_0_6_wire = w_r * out_0_6_row[0] + w_o * out_0_6_row[1] + w_4 * out_0_6_row[2] - p2_w_7;
        auto out_0_7_wire = w_r * out_0_7_row[0] + w_o * out_0_7_row[1] + w_4 * out_0_7_row[2] - p2_w_8;

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // Boundary: standard 4-wire check (no shift-side Vandermonde — successor is standard-encoded).
        std::get<0>(evals) += q_times_scaling * (row_u_terms_8(out_0_row) + Accumulator(out_0_wire));
        std::get<1>(evals) += q_times_scaling * (row_u_terms_8(out_1_row) + Accumulator(out_1_wire));
        std::get<2>(evals) += q_times_scaling * (row_u_terms_8(out_2_row) + Accumulator(out_2_wire));
        std::get<3>(evals) += q_times_scaling * (row_u_terms_8(out_3_row) + Accumulator(out_3_wire));

        // Internal consistency at rounds 4..7.
        std::get<4>(evals) += q_times_scaling * (row_u_terms_4(out_0_4_row) + Accumulator(out_0_4_wire));
        std::get<5>(evals) += q_times_scaling * (row_u_terms_5(out_0_5_row) + Accumulator(out_0_5_wire));
        std::get<6>(evals) += q_times_scaling * (row_u_terms_6(out_0_6_row) + Accumulator(out_0_6_wire));
        std::get<7>(evals) += q_times_scaling * (row_u_terms_7(out_0_7_row) + Accumulator(out_0_7_wire));
    }
};

template <typename FF>
using Poseidon2QuadInternalK8TerminalRelation = Relation<Poseidon2QuadInternalK8TerminalRelationImpl<FF>>;

} // namespace bb

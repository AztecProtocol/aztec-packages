#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation for the K=8 compressed Poseidon2 internal block.
 *
 * @details The entry row holds the standard-encoded state at the start of internal rounds:
 *     (w_l, w_r, w_o, w_4) = (s_0, s_1, s_2, s_3) at internal round 0.
 * Aux wires p2_w_5..p2_w_8 are zero on this row.
 *
 * The successor is the first K=8 interior row, whose wires encode s_0 at 8 consecutive rounds:
 *     (w_l_shift, w_r_shift, w_o_shift, w_4_shift)         = s_0 at rounds 0, 1, 2, 3
 *     (p2_w_5_shift, p2_w_6_shift, p2_w_7_shift, p2_w_8_shift) = s_0 at rounds 4, 5, 6, 7.
 *
 * w_l_shift = state[0] at round 0 = s_0 — established via shared witness indices with the entry
 * row's w_l (enforced by the permutation relation). We therefore do NOT duplicate this as a
 * subrelation; the seven subrelations below cover rounds 1..7.
 *
 * The "stepwise degree firewall" pattern keeps each subrelation at degree 5: each subrelation
 * computes state[0] at the target round using the *previous* shifted wire as a fresh variable
 * (instead of inlining its degree-5 definition).
 *
 * Subrelations (each * q_poseidon2_transition_entry_k8 * gate separator, partial length 7):
 *
 *   A_0 (round 1):
 *     w_r_shift = D_1 u_0 + w_r + w_o + w_4,     u_0 = (w_l + q_l)^5
 *
 *   A_1 (round 2):
 *     w_o_shift = D_1 u_1 + 3 u_0 + (D_2+2) w_r + (D_3+2) w_o + (D_4+2) w_4
 *     u_1 = (w_r_shift + q_r)^5
 *
 *   A_2 (round 3):
 *     w_4_shift = D_1 u_2 + 3 u_1 + (Σ + 6) u_0
 *                 + (D_2^2 + D_2 + Σ + 4) w_r
 *                 + (D_3^2 + D_3 + Σ + 4) w_o
 *                 + (D_4^2 + D_4 + Σ + 4) w_4
 *     u_2 = (w_o_shift + q_o)^5
 *
 *   A_3 (round 4): p2_w_5_shift = D_1 u_3 + (linear in earlier u_*, w_*)
 *     u_3 = (w_4_shift + q_4)^5
 *
 *   A_4 (round 5): p2_w_6_shift = D_1 u_4 + (linear in earlier u_*, w_*)
 *     u_4 = (p2_w_5_shift + q_m)^5
 *
 *   A_5 (round 6): p2_w_7_shift = D_1 u_5 + (linear in earlier u_*, w_*)
 *     u_5 = (p2_w_6_shift + q_c)^5
 *
 *   A_6 (round 7): p2_w_8_shift = D_1 u_6 + (linear in earlier u_*, w_*)
 *     u_6 = (p2_w_7_shift + q_5)^5
 *
 * Selector layout on the entry row:
 *     q_l = c_{rounds_f_begin + 0}, q_r = c_{rounds_f_begin + 1}, ..., q_5 = c_{rounds_f_begin + 6}
 *     q_4, q_m, q_c, q_6 = unused
 *
 * Implementation note: rather than building closed-form expressions for the higher-round
 * coefficients, this relation iterates the recurrence natively step-by-step, using the
 * appropriate shifted wire as the "fresh" S-box input each step. This keeps every subrelation
 * at partial length 7 and avoids the increasingly complex coefficient algebra of higher orders.
 */
template <typename FF_> class Poseidon2TransitionEntryK8RelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7, 7, 7, 7 };

    static constexpr fr D1 = QuadParams::D1;
    static constexpr fr D2 = QuadParams::D2;
    static constexpr fr D3 = QuadParams::D3;
    static constexpr fr D4 = QuadParams::D4;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_transition_entry_k8.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        // Entry row's standard 4-wide state at internal round 0.
        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);

        // Successor (first K=8 interior) row's wires: s_0 at rounds 1..7. Round 0 is enforced by
        // copy constraint from entry row's w_l to successor's w_l.
        const auto w_r_shift = CoeffAcc(in.w_r_shift);       // s_0 at round 1
        const auto w_o_shift = CoeffAcc(in.w_o_shift);       // s_0 at round 2
        const auto w_4_shift = CoeffAcc(in.w_4_shift);       // s_0 at round 3
        const auto p2_w_5_shift = CoeffAcc(in.p2_w_5_shift); // s_0 at round 4
        const auto p2_w_6_shift = CoeffAcc(in.p2_w_6_shift); // s_0 at round 5
        const auto p2_w_7_shift = CoeffAcc(in.p2_w_7_shift); // s_0 at round 6
        const auto p2_w_8_shift = CoeffAcc(in.p2_w_8_shift); // s_0 at round 7

        // Round constants for rounds 0..6 (7 needed; 7th round at p2_w_8 has no follow-on).
        const auto q_l = CoeffAcc(in.q_l); // c_0
        const auto q_r = CoeffAcc(in.q_r); // c_1
        const auto q_o = CoeffAcc(in.q_o); // c_2
        const auto q_4 = CoeffAcc(in.q_4); // c_3
        const auto q_m = CoeffAcc(in.q_m); // c_4
        const auto q_c = CoeffAcc(in.q_c); // c_5
        const auto q_5 = CoeffAcc(in.q_5); // c_6

        const auto q_sel = CoeffAcc(in.q_poseidon2_transition_entry_k8);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r_shift + q_r));
        auto u_2 = pow5(Accumulator(w_o_shift + q_o));
        auto u_3 = pow5(Accumulator(w_4_shift + q_4));
        auto u_4 = pow5(Accumulator(p2_w_5_shift + q_m));
        auto u_5 = pow5(Accumulator(p2_w_6_shift + q_c));
        auto u_6 = pow5(Accumulator(p2_w_7_shift + q_5));

        auto row_u_terms_1 = [&](const auto& row) { return u_0 * row[3]; };
        auto row_u_terms_2 = [&](const auto& row) { return row_u_terms_1(row) + u_1 * row[4]; };
        auto row_u_terms_3 = [&](const auto& row) { return row_u_terms_2(row) + u_2 * row[5]; };
        auto row_u_terms_4 = [&](const auto& row) { return row_u_terms_3(row) + u_3 * row[6]; };
        auto row_u_terms_5 = [&](const auto& row) { return row_u_terms_4(row) + u_4 * row[7]; };
        auto row_u_terms_6 = [&](const auto& row) { return row_u_terms_5(row) + u_5 * row[8]; };
        auto row_u_terms_7 = [&](const auto& row) { return row_u_terms_6(row) + u_6 * row[9]; };

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        const auto& row_1 = QuadParams::k8_tables.entry_s0_after_round[0];
        const auto& row_2 = QuadParams::k8_tables.entry_s0_after_round[1];
        const auto& row_3 = QuadParams::k8_tables.entry_s0_after_round[2];
        const auto& row_4 = QuadParams::k8_tables.entry_s0_after_round[3];
        const auto& row_5 = QuadParams::k8_tables.entry_s0_after_round[4];
        const auto& row_6 = QuadParams::k8_tables.entry_s0_after_round[5];
        const auto& row_7 = QuadParams::k8_tables.entry_s0_after_round[6];

        auto wire_1 = w_r * row_1[0] + w_o * row_1[1] + w_4 * row_1[2] - w_r_shift;
        auto wire_2 = w_r * row_2[0] + w_o * row_2[1] + w_4 * row_2[2] - w_o_shift;
        auto wire_3 = w_r * row_3[0] + w_o * row_3[1] + w_4 * row_3[2] - w_4_shift;
        auto wire_4 = w_r * row_4[0] + w_o * row_4[1] + w_4 * row_4[2] - p2_w_5_shift;
        auto wire_5 = w_r * row_5[0] + w_o * row_5[1] + w_4 * row_5[2] - p2_w_6_shift;
        auto wire_6 = w_r * row_6[0] + w_o * row_6[1] + w_4 * row_6[2] - p2_w_7_shift;
        auto wire_7 = w_r * row_7[0] + w_o * row_7[1] + w_4 * row_7[2] - p2_w_8_shift;

        std::get<0>(evals) += q_times_scaling * (row_u_terms_1(row_1) + Accumulator(wire_1));
        std::get<1>(evals) += q_times_scaling * (row_u_terms_2(row_2) + Accumulator(wire_2));
        std::get<2>(evals) += q_times_scaling * (row_u_terms_3(row_3) + Accumulator(wire_3));
        std::get<3>(evals) += q_times_scaling * (row_u_terms_4(row_4) + Accumulator(wire_4));
        std::get<4>(evals) += q_times_scaling * (row_u_terms_5(row_5) + Accumulator(wire_5));
        std::get<5>(evals) += q_times_scaling * (row_u_terms_6(row_6) + Accumulator(wire_6));
        std::get<6>(evals) += q_times_scaling * (row_u_terms_7(row_7) + Accumulator(wire_7));
    }
};

template <typename FF> using Poseidon2TransitionEntryK8Relation = Relation<Poseidon2TransitionEntryK8RelationImpl<FF>>;

} // namespace bb

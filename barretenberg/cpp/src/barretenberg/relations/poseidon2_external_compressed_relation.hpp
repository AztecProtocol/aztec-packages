#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Two-rounds-per-row compressed Poseidon2 external-round relation.
 *
 * @details Each row encodes the external-round state at two consecutive rounds:
 *     w_l..w_4         = state at round 2k         (s_0..s_3)
 *     p2_w_5..p2_w_8   = state at round 2k+1       (s_0..s_3)
 * The successor row's wires (w_l_shift..w_4_shift) hold the state at round 2k+2.
 *
 * Per-row round constants (s_0..s_3 lanes for rounds 2k and 2k+1, 8 total):
 *     q_l, q_r, q_o, q_4 = c_{2k}[0..3]
 *     q_m, q_c, q_5, q_6 = c_{2k+1}[0..3]
 *
 * Each external round applies M_E to sbox(state + round_constant). With state in 4 wires per
 * round, each row enforces 8 subrelations (4 per round): the components of the matrix
 * multiplication v = M_E . sbox(state + c) compared against the next round's witness.
 *
 * The external matrix M_E is:
 *     M_E = [[5, 7, 1, 3],
 *            [4, 6, 1, 1],
 *            [1, 3, 5, 7],
 *            [1, 1, 4, 6]]
 *
 * Subrelations (each * q_poseidon2_external_compressed * gate separator, partial length 7):
 *   First-round (state at round 2k → state at round 2k+1, comparing to p2_w_5..p2_w_8):
 *     A_0: 5 u_l + 7 u_r + u_o + 3 u_4 = p2_w_5
 *     A_1: 4 u_l + 6 u_r + u_o + u_4   = p2_w_6
 *     A_2: u_l + 3 u_r + 5 u_o + 7 u_4 = p2_w_7
 *     A_3: u_l + u_r + 4 u_o + 6 u_4   = p2_w_8
 *   where u_X = (X + q_X)^5 for X in {l, r, o, 4}.
 *
 *   Second-round (state at round 2k+1 → state at round 2k+2, comparing to w_l_shift..w_4_shift):
 *     A_4: 5 v_5 + 7 v_6 + v_7 + 3 v_8 = w_l_shift
 *     A_5: 4 v_5 + 6 v_6 + v_7 + v_8   = w_r_shift
 *     A_6: v_5 + 3 v_6 + 5 v_7 + 7 v_8 = w_o_shift
 *     A_7: v_5 + v_6 + 4 v_7 + 6 v_8   = w_4_shift
 *   where v_X = (p2_w_X + q_round2_constant)^5.
 *
 * Degree: each subrelation has degree 5 (single S-box) + 1 (selector) + 1 (gate sep) = 7.
 */
template <typename FF_> class Poseidon2ExternalCompressedRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7, 7, 7, 7, 7 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_external_compressed.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        // State at round 2k (standard wires) and 2k+1 (auxiliary wires).
        const auto w_l = CoeffAcc(in.w_l);
        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);
        const auto p2_w_5 = CoeffAcc(in.p2_w_5);
        const auto p2_w_6 = CoeffAcc(in.p2_w_6);
        const auto p2_w_7 = CoeffAcc(in.p2_w_7);
        const auto p2_w_8 = CoeffAcc(in.p2_w_8);

        // Successor row's standard wires: state at round 2k+2.
        const auto w_l_shift = CoeffAcc(in.w_l_shift);
        const auto w_r_shift = CoeffAcc(in.w_r_shift);
        const auto w_o_shift = CoeffAcc(in.w_o_shift);
        const auto w_4_shift = CoeffAcc(in.w_4_shift);

        // Round constants: q_l..q_4 for round 2k, q_m, q_c, q_5, q_6 for round 2k+1.
        const auto q_l = CoeffAcc(in.q_l);
        const auto q_r = CoeffAcc(in.q_r);
        const auto q_o = CoeffAcc(in.q_o);
        const auto q_4 = CoeffAcc(in.q_4);
        const auto q_m = CoeffAcc(in.q_m);
        const auto q_c = CoeffAcc(in.q_c);
        const auto q_5 = CoeffAcc(in.q_5);
        const auto q_6 = CoeffAcc(in.q_6);

        const auto q_sel = CoeffAcc(in.q_poseidon2_external_compressed);

        auto sbox = [](const Accumulator& x) {
            auto t2 = x.sqr();
            auto t4 = t2.sqr();
            return t4 * x;
        };

        // Round 2k: u = sbox(state + q). Apply M_E to compare against (p2_w_5..p2_w_8).
        auto u_l = sbox(Accumulator(w_l + q_l));
        auto u_r = sbox(Accumulator(w_r + q_r));
        auto u_o = sbox(Accumulator(w_o + q_o));
        auto u_4 = sbox(Accumulator(w_4 + q_4));

        // M_E . u (same minimal-add scheme as standard external relation).
        auto t0 = u_l + u_r;
        auto t1 = u_o + u_4;
        auto t2 = u_r + u_r;
        t2 = t2 + t1;
        auto t3 = u_4 + u_4;
        t3 = t3 + t0;

        auto v4 = t1 + t1;
        v4 = v4 + v4;
        v4 = v4 + t3;

        auto v2 = t0 + t0;
        v2 = v2 + v2;
        v2 = v2 + t2;

        auto v1 = t3 + v2;
        auto v3 = t2 + v4;

        const auto q_times_scaling_m = q_sel * scaling_factor;
        const auto q_times_scaling = Accumulator(q_times_scaling_m);

        // First-round subrelations: M_E . u = (p2_w_5..p2_w_8).
        std::get<0>(evals) += q_times_scaling * (v1 - Accumulator(p2_w_5));
        std::get<1>(evals) += q_times_scaling * (v2 - Accumulator(p2_w_6));
        std::get<2>(evals) += q_times_scaling * (v3 - Accumulator(p2_w_7));
        std::get<3>(evals) += q_times_scaling * (v4 - Accumulator(p2_w_8));

        // Round 2k+1: same algebra applied to (p2_w_5..p2_w_8 + q_m, q_c, q_5, q_6) and compared
        // against (w_l_shift..w_4_shift).
        auto u_5 = sbox(Accumulator(p2_w_5 + q_m));
        auto u_6 = sbox(Accumulator(p2_w_6 + q_c));
        auto u_7 = sbox(Accumulator(p2_w_7 + q_5));
        auto u_8 = sbox(Accumulator(p2_w_8 + q_6));

        auto t0b = u_5 + u_6;
        auto t1b = u_7 + u_8;
        auto t2b = u_6 + u_6;
        t2b = t2b + t1b;
        auto t3b = u_8 + u_8;
        t3b = t3b + t0b;

        auto v4b = t1b + t1b;
        v4b = v4b + v4b;
        v4b = v4b + t3b;

        auto v2b = t0b + t0b;
        v2b = v2b + v2b;
        v2b = v2b + t2b;

        auto v1b = t3b + v2b;
        auto v3b = t2b + v4b;

        std::get<4>(evals) += q_times_scaling * (v1b - Accumulator(w_l_shift));
        std::get<5>(evals) += q_times_scaling * (v2b - Accumulator(w_r_shift));
        std::get<6>(evals) += q_times_scaling * (v3b - Accumulator(w_o_shift));
        std::get<7>(evals) += q_times_scaling * (v4b - Accumulator(w_4_shift));
    }
};

template <typename FF>
using Poseidon2ExternalCompressedRelation = Relation<Poseidon2ExternalCompressedRelationImpl<FF>>;

} // namespace bb

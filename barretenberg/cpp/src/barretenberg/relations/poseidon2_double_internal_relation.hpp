#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Double internal round relation for Poseidon2, processing two consecutive internal rounds per row.
 *
 * @details Instead of storing the full state (s_0, s_1, s_2, s_3) in 4 wires, the compressed encoding stores:
 *   - w_l = state[0] at round 2i
 *   - w_r = state[0] at round 2i+1 (= first output element of round 2i)
 *   - w_o = state[2] at round 2i
 *   - w_4 = state[3] at round 2i
 *
 * The missing state[1] is reconstructed from the M_I first-row equation:
 *   v_0 = D_1 * (s_0 + c)^5 + s_1 + s_2 + s_3  =>  s_1 = w_r - D_1 * (w_l + q_l)^5 - w_o - w_4
 *
 * The intermediate state after round 2i (substituting s_1):
 *   v_0 = w_r                                              (by construction)
 *   v_1 = D_2 * w_r + (1 - D_1*D_2) * u_1 + (1 - D_2) * (w_o + w_4)
 *   v_2 = w_r + (1 - D_1) * u_1 + (D_3 - 1) * w_o
 *   v_3 = w_r + (1 - D_1) * u_1 + (D_4 - 1) * w_4
 * where u_1 = (w_l + q_l)^5.
 *
 * Round 2i+1 applies the S-box to v_0: u_1' = (w_r + q_r)^5, then M_I multiplication.
 *
 * Selectors:
 *   q_l = c_{2i}   (round 2i constant)
 *   q_r = c_{2i+1} (round 2i+1 constant)
 *   q_o = c_{2(i+1)} (next pair's first round constant, used for s_1^next reconstruction)
 *
 * Constraints (4 subrelations):
 *   A_0: out_0 - w_l_shift = 0                                              [degree 7]
 *   A_1: out_1 - s_1^next = 0  where s_1^next = w_r_shift - D_1*(w_l_shift+q_o)^5 - w_o_shift - w_4_shift
 *                                                                            [degree 7]
 *   A_2: out_2 - w_o_shift = 0                                              [degree 7]
 *   A_3: out_3 - w_4_shift = 0                                              [degree 7]
 */
template <typename FF_> class Poseidon2DoubleInternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: out_0 - w_l_shift
        7, // A_1: out_1 - s_1^next (degree 7)
        7, // A_2: out_2 - w_o_shift
        7, // A_3: out_3 - w_4_shift
    };

    // Diagonal constants of M_I
    static constexpr fr D1m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr fr D2m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr fr D3m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr fr D4m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];
    static constexpr fr D1 = fr{ 1 } + D1m1;
    static constexpr fr D2 = fr{ 1 } + D2m1;
    static constexpr fr D3 = fr{ 1 } + D3m1;
    static constexpr fr D4 = fr{ 1 } + D4m1;

    // Precomputed constants for the v_k expressions (after substituting s_1)
    static constexpr fr one_minus_D1 = fr{ 1 } - D1;
    static constexpr fr one_minus_D2 = fr{ 1 } - D2;
    static constexpr fr one_minus_D1_D2 = fr{ 1 } - D1 * D2;

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero.
     * @details The relation only fires on rows inside the compressed internal block where the interior selector
     * is active. Rows outside the block (and the entry/terminal/bridge rows inside it) have the selector at 0,
     * so the prover can skip the accumulate step entirely.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.q_poseidon2_double_internal.is_zero());
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        // Degree-7 accumulator (for all subrelations)
        using Accumulator7 = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator7 = typename Accumulator7::CoefficientAccumulator;

        // Current row wires
        const auto w_l = CoefficientAccumulator7(in.w_l);
        const auto w_r = CoefficientAccumulator7(in.w_r);
        const auto w_o = CoefficientAccumulator7(in.w_o);
        const auto w_4 = CoefficientAccumulator7(in.w_4);

        // Shifted wires (next row)
        const auto w_l_shift = CoefficientAccumulator7(in.w_l_shift);
        const auto w_r_shift = CoefficientAccumulator7(in.w_r_shift);
        const auto w_o_shift = CoefficientAccumulator7(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator7(in.w_4_shift);

        // Selector and round constants
        const auto q_pos_dbl_internal = CoefficientAccumulator7(in.q_poseidon2_double_internal);
        const auto q_l = CoefficientAccumulator7(in.q_l); // c_{2i}
        const auto q_r = CoefficientAccumulator7(in.q_r); // c_{2i+1}
        const auto q_o = CoefficientAccumulator7(in.q_o); // c_{2(i+1)} (next pair constant)

        // ── Round 2i: S-box on state[0] ──
        // u_1 = (w_l + c_{2i})^5
        auto s1 = Accumulator7(w_l + q_l);
        auto u1 = s1.sqr();
        u1 = u1.sqr();
        u1 *= s1;

        // ── Intermediate state v_k after round 2i ──
        // These are expressed directly in terms of wires (s_1 substituted out).
        // v_0 = w_r  (by construction, not needed explicitly)
        // v_1 = D_2*w_r + (1-D_1*D_2)*u_1 + (1-D_2)*(w_o+w_4)
        // v_2 = w_r + (1-D_1)*u_1 + (D_3-1)*w_o
        // v_3 = w_r + (1-D_1)*u_1 + (D_4-1)*w_4

        // Common term: (1 - D_1) * u_1  (appears in v_2 and v_3)
        auto one_minus_D1_u1 = u1 * one_minus_D1;

        auto v1 = u1 * one_minus_D1_D2;
        auto v1_linear = Accumulator7(w_r * D2 + (w_o + w_4) * one_minus_D2);
        v1 += v1_linear;

        auto v2 = one_minus_D1_u1 + Accumulator7(w_r + w_o * D3m1);
        auto v3 = one_minus_D1_u1 + Accumulator7(w_r + w_4 * D4m1);

        // ── Round 2i+1: S-box on v_0 = w_r ──
        // u_1' = (w_r + c_{2i+1})^5
        auto s1_prime = Accumulator7(w_r + q_r);
        auto u1_prime = s1_prime.sqr();
        u1_prime = u1_prime.sqr();
        u1_prime *= s1_prime;

        // ── Output state after round 2i+1 ──
        // out_k = M_I * (u_1', v_1, v_2, v_3)
        auto v_sum = v1 + v2 + v3;
        auto out0 = u1_prime * D1 + v_sum;
        auto out1 = u1_prime + v1 * D2m1 + v_sum;
        auto out2 = u1_prime + v2 * D3m1 + v_sum;
        auto out3 = u1_prime + v3 * D4m1 + v_sum;

        // ── Constraints ──
        const auto q_pos_by_scaling_m = (q_pos_dbl_internal * scaling_factor);
        const auto q_pos_by_scaling = Accumulator7(q_pos_by_scaling_m);

        // A_0: q_sel * (out_0 - w_l_shift) = 0  [degree 7]
        std::get<0>(evals) += q_pos_by_scaling * (out0 - Accumulator7(w_l_shift));

        // A_1: q_sel * (out_1 - s_1^next) = 0  [degree 7]
        // where s_1^next = w_r_shift - D_1*(w_l_shift + q_o)^5 - w_o_shift - w_4_shift
        {
            auto s_next = Accumulator7(w_l_shift + q_o);
            auto u_next = s_next.sqr();
            u_next = u_next.sqr();
            u_next *= s_next;
            auto s1_next = Accumulator7(w_r_shift) - u_next * D1 - Accumulator7(w_o_shift + w_4_shift);

            std::get<1>(evals) += q_pos_by_scaling * (out1 - s1_next);
        }

        // A_2: q_sel * (out_2 - w_o_shift) = 0  [degree 7]
        std::get<2>(evals) += q_pos_by_scaling * (out2 - Accumulator7(w_o_shift));

        // A_3: q_sel * (out_3 - w_4_shift) = 0  [degree 7]
        std::get<3>(evals) += q_pos_by_scaling * (out3 - Accumulator7(w_4_shift));
    };
};

template <typename FF> using Poseidon2DoubleInternalRelation = Relation<Poseidon2DoubleInternalRelationImpl<FF>>;
} // namespace bb

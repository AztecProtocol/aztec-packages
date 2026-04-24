#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/relations/poseidon2_sbox.hpp"
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
 * Constraints (4 subrelations, each degree 7):
 *   A_0: out_0 - w_l_shift = 0
 *   A_1: out_1 - s_1^next = 0  where s_1^next = w_r_shift - D_1*(w_l_shift+q_o)^5 - w_o_shift - w_4_shift
 *   A_2: out_2 - w_o_shift = 0
 *   A_3: out_3 - w_4_shift = 0
 *
 * ── Monomial-accumulator layout ──
 * Each out_k expands into (u_1' coefficient) + (u_1 coefficient) + (affine combination of wires).
 * Only the three quintic values u_1, u_1', u_next need the degree-7 Accumulator; everything else
 * is degree <= 2 and lives in CoefficientAccumulator (2-coefficient monomial). We compute each
 * quintic value once, multiply it by the degree-2 monomial `q_sel * scaling_factor` once to obtain
 * `scaled_u*`, and then each subrelation is assembled as:
 *     scaled_u1_prime * const + scaled_u1 * const [+ scaled_u_next * const for A_1]
 *       + Accumulator( affine_wire_expression * q_by_scaling_m )
 * promoting the linear block to Accumulator exactly once per subrelation.
 */
template <typename FF_> class Poseidon2DoubleInternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: out_0 - w_l_shift
        7, // A_1: out_1 - s_1^next
        7, // A_2: out_2 - w_o_shift
        7, // A_3: out_3 - w_4_shift
    };

    // Diagonal entries of M_I and useful derivatives.
    static constexpr fr D1m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr fr D2m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr fr D3m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr fr D4m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];
    static constexpr fr D1 = fr{ 1 } + D1m1;
    static constexpr fr D2 = fr{ 1 } + D2m1;
    static constexpr fr D3 = fr{ 1 } + D3m1;
    static constexpr fr D4 = fr{ 1 } + D4m1;

    static constexpr fr one_minus_D1 = fr{ 1 } - D1;
    static constexpr fr one_minus_D2 = fr{ 1 } - D2;
    static constexpr fr one_minus_D1_D2 = fr{ 1 } - D1 * D2;

    // u_1 coefficient in v_sum := v_1 + v_2 + v_3 :
    //   v_1 contributes (1 - D_1*D_2);  v_2, v_3 each contribute (1 - D_1).
    static constexpr fr c_u1_sum = fr{ 3 } - D1 * D2 - D1 - D1;

    // u_1 coefficient per sub-relation: c_u1_sum + (extra from (D_k-1) * v_k in out_k).
    static constexpr fr c_u1_0 = c_u1_sum;
    static constexpr fr c_u1_1 = D2m1 * one_minus_D1_D2 + c_u1_sum;
    static constexpr fr c_u1_2 = D3m1 * one_minus_D1 + c_u1_sum;
    static constexpr fr c_u1_3 = D4m1 * one_minus_D1 + c_u1_sum;

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
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // ── Wires in monomial basis ──
        const auto w_l = CoefficientAccumulator(in.w_l);
        const auto w_r = CoefficientAccumulator(in.w_r);
        const auto w_o = CoefficientAccumulator(in.w_o);
        const auto w_4 = CoefficientAccumulator(in.w_4);
        const auto w_l_shift = CoefficientAccumulator(in.w_l_shift);
        const auto w_r_shift = CoefficientAccumulator(in.w_r_shift);
        const auto w_o_shift = CoefficientAccumulator(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator(in.w_4_shift);

        const auto q_sel = CoefficientAccumulator(in.q_poseidon2_double_internal);
        const auto q_l = CoefficientAccumulator(in.q_l); // c_{2i}
        const auto q_r = CoefficientAccumulator(in.q_r); // c_{2i+1}
        const auto q_o = CoefficientAccumulator(in.q_o); // c_{2(i+1)}  (A_1 only)

        // Selector * scaling in monomial form; reused for every sub-relation's linear block.
        const auto q_by_scaling_m = q_sel * scaling_factor;

        // ── Three x^5 S-boxes via binomial expansion + finite-diff extrapolation.
        // 12 full field mults + ~60 adds each, vs. 21 elementwise mults naively. See `poseidon2_sbox.hpp`.
        auto u1 = poseidon2_sbox_lagrange_7<FF>(w_l + q_l);
        auto u1_prime = poseidon2_sbox_lagrange_7<FF>(w_r + q_r);
        auto u_next = poseidon2_sbox_lagrange_7<FF>(w_l_shift + q_o);

        // ── Selector-scaled S-box values (3 Acc×Acc muls, shared across subrelations) ──
        const auto q_by_scaling = Accumulator(q_by_scaling_m);
        const auto scaled_u1 = u1 * q_by_scaling;
        const auto scaled_u1_prime = u1_prime * q_by_scaling;
        const auto scaled_u_next = u_next * q_by_scaling;

        // ── Linear parts of v_k and v_sum (all in monomial basis) ──
        //   v_1 linear : D_2 * w_r + (1 - D_2) * (w_o + w_4)
        //   v_2 linear :  w_r + (D_3 - 1) * w_o
        //   v_3 linear :  w_r + (D_4 - 1) * w_4
        const auto v1_linear = w_r * D2 + (w_o + w_4) * one_minus_D2;
        const auto v2_linear = w_r + w_o * D3m1;
        const auto v3_linear = w_r + w_4 * D4m1;
        const auto vsum_linear = v1_linear + v2_linear + v3_linear;

        // ── A_0: out_0 - w_l_shift = D_1*u_1' + c_u1_0*u_1 + v_sum_linear - w_l_shift ──
        {
            const auto linear_mono = vsum_linear - w_l_shift;
            std::get<0>(evals) += scaled_u1_prime * D1 + scaled_u1 * c_u1_0 + Accumulator(linear_mono * q_by_scaling_m);
        }

        // ── A_1: out_1 - s_1^next
        //   = u_1' + c_u1_1*u_1 + D_1*u_next + (D_2-1)*v_1_linear + v_sum_linear
        //     - w_r_shift + w_o_shift + w_4_shift
        {
            const auto linear_mono = v1_linear * D2m1 + vsum_linear - w_r_shift + w_o_shift + w_4_shift;
            std::get<1>(evals) +=
                scaled_u1_prime + scaled_u1 * c_u1_1 + scaled_u_next * D1 + Accumulator(linear_mono * q_by_scaling_m);
        }

        // ── A_2: out_2 - w_o_shift = u_1' + c_u1_2*u_1 + (D_3-1)*v_2_linear + v_sum_linear - w_o_shift ──
        {
            const auto linear_mono = v2_linear * D3m1 + vsum_linear - w_o_shift;
            std::get<2>(evals) += scaled_u1_prime + scaled_u1 * c_u1_2 + Accumulator(linear_mono * q_by_scaling_m);
        }

        // ── A_3: out_3 - w_4_shift = u_1' + c_u1_3*u_1 + (D_4-1)*v_3_linear + v_sum_linear - w_4_shift ──
        {
            const auto linear_mono = v3_linear * D4m1 + vsum_linear - w_4_shift;
            std::get<3>(evals) += scaled_u1_prime + scaled_u1 * c_u1_3 + Accumulator(linear_mono * q_by_scaling_m);
        }
    };
};

template <typename FF> using Poseidon2DoubleInternalRelation = Relation<Poseidon2DoubleInternalRelationImpl<FF>>;
} // namespace bb

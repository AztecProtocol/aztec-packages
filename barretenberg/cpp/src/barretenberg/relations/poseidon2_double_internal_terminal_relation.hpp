#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/relations/poseidon2_sbox.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Terminal variant of the double-internal round relation.
 *
 * @details Processes two consecutive internal rounds per row, like the interior double-internal
 * relation, but the successor row is expected to use STANDARD 4-element encoding
 * (s_0, s_1, s_2, s_3) rather than the compressed encoding. All four output subrelations
 * match the standard encoding directly:
 *
 *   A_0: out_0 - w_l_shift = 0
 *   A_1: out_1 - w_r_shift = 0
 *   A_2: out_2 - w_o_shift = 0
 *   A_3: out_3 - w_4_shift = 0
 *
 * No s_1^next reconstruction is needed, so the q_o selector is unused on the terminal row.
 *
 * Compared to `Poseidon2DoubleInternalRelationImpl`, this relation is strictly simpler: A_1 is
 * enforced directly against the successor's standard-encoded `w_r_shift`, so we skip the
 * `u_next = (w_l_shift + q_o)^5` S-box and save one Acc×Acc multiplication.
 */
template <typename FF_> class Poseidon2DoubleInternalTerminalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // A_0: out_0 - w_l_shift
        7, // A_1: out_1 - w_r_shift
        7, // A_2: out_2 - w_o_shift
        7, // A_3: out_3 - w_4_shift
    };

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
    static constexpr fr one_minus_D1_D2 = fr{ 1 } - (D1 * D2);

    // u_1 coefficient in v_sum := v_1 + v_2 + v_3.
    static constexpr fr c_u1_sum = fr{ 3 } - D1 * D2 - D1 - D1;

    // u_1 coefficient per sub-relation.
    static constexpr fr c_u1_0 = c_u1_sum;
    static constexpr fr c_u1_1 = D2m1 * one_minus_D1_D2 + c_u1_sum;
    static constexpr fr c_u1_2 = D3m1 * one_minus_D1 + c_u1_sum;
    static constexpr fr c_u1_3 = D4m1 * one_minus_D1 + c_u1_sum;

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero.
     * @details The terminal relation is active on exactly one row per Poseidon2 permutation (the last compressed
     * row whose successor is the standard-encoded transition row). Everywhere else the selector is 0, so the
     * prover skips accumulation.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.q_poseidon2_double_internal_terminal.is_zero());
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto w_l = CoefficientAccumulator(in.w_l);
        const auto w_r = CoefficientAccumulator(in.w_r);
        const auto w_o = CoefficientAccumulator(in.w_o);
        const auto w_4 = CoefficientAccumulator(in.w_4);

        const auto w_l_shift = CoefficientAccumulator(in.w_l_shift);
        const auto w_r_shift = CoefficientAccumulator(in.w_r_shift);
        const auto w_o_shift = CoefficientAccumulator(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator(in.w_4_shift);

        const auto q_sel = CoefficientAccumulator(in.q_poseidon2_double_internal_terminal);
        const auto q_l = CoefficientAccumulator(in.q_l);
        const auto q_r = CoefficientAccumulator(in.q_r);

        const auto q_by_scaling_m = q_sel * scaling_factor;

        // ── Two x^5 S-boxes (no u_next on terminal) via binomial expansion. See `poseidon2_sbox.hpp`. ──
        auto u1 = poseidon2_sbox_lagrange_7<FF>(w_l + q_l);
        auto u1_prime = poseidon2_sbox_lagrange_7<FF>(w_r + q_r);

        // ── Selector-scaled S-box values (2 Acc×Acc muls, shared across subrelations) ──
        const auto q_by_scaling = Accumulator(q_by_scaling_m);
        const auto scaled_u1 = u1 * q_by_scaling;
        const auto scaled_u1_prime = u1_prime * q_by_scaling;

        // ── Linear parts of v_k and v_sum (all in monomial basis) ──
        const auto v1_linear = w_r * D2 + (w_o + w_4) * one_minus_D2;
        const auto v2_linear = w_r + w_o * D3m1;
        const auto v3_linear = w_r + w_4 * D4m1;
        const auto vsum_linear = v1_linear + v2_linear + v3_linear;

        // ── A_0: out_0 - w_l_shift = D_1*u_1' + c_u1_0*u_1 + v_sum_linear - w_l_shift ──
        {
            const auto linear_mono = vsum_linear - w_l_shift;
            std::get<0>(evals) += scaled_u1_prime * D1 + scaled_u1 * c_u1_0 + Accumulator(linear_mono * q_by_scaling_m);
        }

        // ── A_1: out_1 - w_r_shift = u_1' + c_u1_1*u_1 + (D_2-1)*v_1_linear + v_sum_linear - w_r_shift ──
        {
            const auto linear_mono = v1_linear * D2m1 + vsum_linear - w_r_shift;
            std::get<1>(evals) += scaled_u1_prime + scaled_u1 * c_u1_1 + Accumulator(linear_mono * q_by_scaling_m);
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

template <typename FF>
using Poseidon2DoubleInternalTerminalRelation = Relation<Poseidon2DoubleInternalTerminalRelationImpl<FF>>;
} // namespace bb

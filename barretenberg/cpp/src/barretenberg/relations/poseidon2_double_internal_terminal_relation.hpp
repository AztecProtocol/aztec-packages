#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
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
 * Compared to `Poseidon2DoubleInternalRelationImpl`, this relation is strictly simpler:
 * A_1 is enforced directly against the successor's standard-encoded `w_r_shift`. This ties the
 * compressed block's output `state[1]` to a witness that the next block (the single-round tail
 * or a final-external block) can consume via shared witness indices.
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
        using Accumulator7 = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator7 = typename Accumulator7::CoefficientAccumulator;

        const auto w_l = CoefficientAccumulator7(in.w_l);
        const auto w_r = CoefficientAccumulator7(in.w_r);
        const auto w_o = CoefficientAccumulator7(in.w_o);
        const auto w_4 = CoefficientAccumulator7(in.w_4);

        const auto w_l_shift = CoefficientAccumulator7(in.w_l_shift);
        const auto w_r_shift = CoefficientAccumulator7(in.w_r_shift);
        const auto w_o_shift = CoefficientAccumulator7(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator7(in.w_4_shift);

        const auto q_sel = CoefficientAccumulator7(in.q_poseidon2_double_internal_terminal);
        const auto q_l = CoefficientAccumulator7(in.q_l);
        const auto q_r = CoefficientAccumulator7(in.q_r);

        // Round 2i: S-box on state[0].
        auto s1 = Accumulator7(w_l + q_l);
        auto u1 = s1.sqr();
        u1 = u1.sqr();
        u1 *= s1;

        // Intermediate state v_k after round 2i (s_1 substituted out via the M_I first-row equation).
        auto one_minus_D1_u1 = u1 * one_minus_D1;

        auto v1 = u1 * one_minus_D1_D2;
        auto v1_linear = Accumulator7((w_r * D2) + ((w_o + w_4) * one_minus_D2));
        v1 += v1_linear;

        auto v2 = one_minus_D1_u1 + Accumulator7(w_r + (w_o * D3m1));
        auto v3 = one_minus_D1_u1 + Accumulator7(w_r + (w_4 * D4m1));

        // Round 2i+1: S-box on v_0 = w_r.
        auto s1_prime = Accumulator7(w_r + q_r);
        auto u1_prime = s1_prime.sqr();
        u1_prime = u1_prime.sqr();
        u1_prime *= s1_prime;

        auto v_sum = v1 + v2 + v3;
        auto out0 = (u1_prime * D1) + v_sum;
        auto out1 = u1_prime + (v1 * D2m1) + v_sum;
        auto out2 = u1_prime + (v2 * D3m1) + v_sum;
        auto out3 = u1_prime + (v3 * D4m1) + v_sum;

        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator7(q_by_scaling_m);

        std::get<0>(evals) += q_by_scaling * (out0 - Accumulator7(w_l_shift));
        std::get<1>(evals) += q_by_scaling * (out1 - Accumulator7(w_r_shift));
        std::get<2>(evals) += q_by_scaling * (out2 - Accumulator7(w_o_shift));
        std::get<3>(evals) += q_by_scaling * (out3 - Accumulator7(w_4_shift));
    };
};

template <typename FF>
using Poseidon2DoubleInternalTerminalRelation = Relation<Poseidon2DoubleInternalTerminalRelationImpl<FF>>;
} // namespace bb

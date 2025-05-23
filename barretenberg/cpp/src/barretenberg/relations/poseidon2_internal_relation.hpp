// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_types.hpp"

namespace bb {

template <typename FF_> class Poseidon2InternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // internal poseidon2 round sub-relation for first value
        7, // internal poseidon2 round sub-relation for second value
        7, // internal poseidon2 round sub-relation for third value
        7, // internal poseidon2 round sub-relation for fourth value
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_internal.is_zero();
    }

    /**
     * @brief Expression for the poseidon2 internal round relation, based on I_i in Section 6 of
     * https://eprint.iacr.org/2023/323.pdf.
     * @details This relation is defined as C(in(X)...) :=
     * q_poseidon2_internal * ( (v1 - w_1_shift) + \alpha * (v2 - w_2_shift) +
     * \alpha^2 * (v3 - w_3_shift) + \alpha^3 * (v4 - w_4_shift) ) = 0 where:
     *      u1 := (w_1 + q_1)^5
     *      sum := u1 + w_2 + w_3 + w_4
     *      v1 := u1 * D1 + sum
     *      v2 := w_2 * D2 + sum
     *      v3 := w_3 * D3 + sum
     *      v4 := w_4 * D4 + sum
     *      Di is the ith internal diagonal value - 1 of the internal matrix M_I
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        PROFILE_THIS_NAME("PoseidonInt::accumulate");
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto w_l_m = CoefficientAccumulator(in.w_l);
        auto w_l_shift_m = CoefficientAccumulator(in.w_l_shift);
        auto w_r_shift_m = CoefficientAccumulator(in.w_r_shift);
        auto w_o_shift_m = CoefficientAccumulator(in.w_o_shift);
        auto w_4_shift_m = CoefficientAccumulator(in.w_4_shift);
        auto q_l_m = CoefficientAccumulator(in.q_l);
        auto q_poseidon2_internal_m = CoefficientAccumulator(in.q_poseidon2_internal);

        // add round constants
        auto s1 = Accumulator(w_l_m + q_l_m);

        // apply s-box round
        auto u1 = s1.sqr();
        u1 = u1.sqr();
        u1 *= s1;
        auto u2_m = CoefficientAccumulator(in.w_r);
        auto u3_m = CoefficientAccumulator(in.w_o);
        auto u4_m = CoefficientAccumulator(in.w_4);

        auto q_pos_by_scaling_m = (q_poseidon2_internal_m * scaling_factor);
        auto q_pos_by_scaling = Accumulator(q_pos_by_scaling_m);
        // matrix mul with v = M_I * u 4 muls and 7 additions
        auto partial_sum = u2_m + u3_m + u4_m;
        auto scaled_u1 = u1 * q_pos_by_scaling;

        static const auto diagonal_term = FF(1) + crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[0];
        auto barycentric_term = scaled_u1 * (diagonal_term);
        auto monomial_term = partial_sum;
        monomial_term -= w_l_shift_m;
        barycentric_term += Accumulator(monomial_term * q_pos_by_scaling_m);
        std::get<0>(evals) += barycentric_term;

        auto v2_m = u2_m * crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[1];
        v2_m += partial_sum;
        v2_m -= w_r_shift_m;
        barycentric_term = Accumulator(v2_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<1>(evals) += barycentric_term;

        auto v3_m = u3_m * crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[2];
        v3_m += partial_sum;
        v3_m -= w_o_shift_m;
        barycentric_term = Accumulator(v3_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<2>(evals) += barycentric_term;

        auto v4_m = u4_m * crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[3];
        v4_m += partial_sum;
        v4_m -= w_4_shift_m;

        barycentric_term = Accumulator(v4_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<3>(evals) += barycentric_term;
    };
}; // namespace bb

template <typename FF> using Poseidon2InternalRelation = Relation<Poseidon2InternalRelationImpl<FF>>;
} // namespace bb
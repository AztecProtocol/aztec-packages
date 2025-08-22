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

    static constexpr fr D1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[0];
    static constexpr fr D2 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[1];
    static constexpr fr D3 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[2];
    static constexpr fr D4 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[3];
    static constexpr fr D1_plus_1 = fr{ 1 } + D1;
    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.q_poseidon2_internal.value_at(0) == 0) && (in.q_poseidon2_internal.value_at(1) == 0);
    }

    /**
     * @brief Expression for the poseidon2 internal round relation, based on I_i in Section 6 of
     * https://eprint.iacr.org/2023/323.pdf.
     * @details Given internal matrix M_I, which is a 4x4 diagonal matrix
     *  M_I = {{D_1 - 1, 1      , 1       ,  1      },
     *         {1      , D_2 - 1, 1       ,  1      },
     *         {1      , 1      , D_3 - 1 ,  1      },
     *         {1      , 1      , 1       ,  D_4 -1 }}
     *
     * We enforce the relation
     * (w_1_shift, w_2_shift, w_3_shift, w_4_shift) = M_i * ((w_1 + c0)^5, w_2, w_3, w_4)
     * which boils down to 4 linearly independent relations that can be represented as follows:
     * \f{align}
     *   q_poseidon2_internal *
     *   \big[
     *      \alpha_0 * (v1 - w_1_shift) +
     *      \alpha_1 * (v2 - w_2_shift) +
     *      \alpha_2 * (v3 - w_3_shift) +
     *      \alpha_3 * (v4 - w_4_shift)
     *   big]
     *   = 0
     * \f}
     * where:
     *      u1 := (w_1 + c0)^5
     *      c0 := corresponding internal round constant placed in q_l selector
     *      v1 := u_1 * D1 + w_2       + w_3       + w_4
     *      v2 := u_1      + w_2 * D_2 + w_3       + w_4
     *      v3 := u_1      + w_2       + w_3 * D_3 + w_4
     *      v4 := u_1      + w_2       + w_3       + w_4 * D_4
     *
     *      Di is the ith diagonal value of the internal matrix M_I
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
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // Low-degree univariates represented in monomial basis
        const auto w_1_m = CoefficientAccumulator(in.w_l);
        const auto w_1_shift_m = CoefficientAccumulator(in.w_l_shift);
        const auto w_2_shift_m = CoefficientAccumulator(in.w_r_shift);
        const auto w_3_shift_m = CoefficientAccumulator(in.w_o_shift);
        const auto w_4_shift_m = CoefficientAccumulator(in.w_4_shift);
        const auto q_l_m = CoefficientAccumulator(in.q_l);
        const auto q_poseidon2_internal_m = CoefficientAccumulator(in.q_poseidon2_internal);
        const auto w_2_m = CoefficientAccumulator(in.w_r);
        const auto w_3_m = CoefficientAccumulator(in.w_o);
        const auto w_4_m = CoefficientAccumulator(in.w_4);

        Accumulator barycentric_term;

        // Add round constants stored in the `q_l` selector and convert to Lagrange basis
        auto s1 = Accumulator(w_1_m + q_l_m);

        // Apply s-box round. Note that the multiplication is performed point-wise
        auto u1 = s1.sqr();
        u1 = u1.sqr();
        u1 *= s1;

        const auto q_pos_by_scaling_m = (q_poseidon2_internal_m * scaling_factor);
        const auto q_pos_by_scaling = Accumulator(q_pos_by_scaling_m);
        // Common terms
        const auto partial_sum = w_2_m + w_3_m + w_4_m;
        const auto scaled_u1 = u1 * q_pos_by_scaling;
        // Row 1:
        {
            barycentric_term = scaled_u1 * D1_plus_1;
            auto monomial_term = partial_sum - w_1_shift_m;
            barycentric_term += Accumulator(monomial_term * q_pos_by_scaling_m);
            std::get<0>(evals) += barycentric_term;
        }

        // Row 2:
        {
            auto v2_m = w_2_m * D2 + partial_sum - w_2_shift_m;
            barycentric_term = Accumulator(v2_m * q_pos_by_scaling_m);
            barycentric_term += scaled_u1;
            std::get<1>(evals) += barycentric_term;
        }

        // Row 3:
        {
            auto v3_m = w_3_m * D3 + partial_sum - w_3_shift_m;
            barycentric_term = Accumulator(v3_m * q_pos_by_scaling_m);
            barycentric_term += scaled_u1;
            std::get<2>(evals) += barycentric_term;
        }

        // Row 4:
        {
            auto v4_m = w_4_m * D4 + partial_sum - w_4_shift_m;
            barycentric_term = Accumulator(v4_m * q_pos_by_scaling_m);
            barycentric_term += scaled_u1;
            std::get<3>(evals) += barycentric_term;
        }
    };
}; // namespace bb

template <typename FF> using Poseidon2InternalRelation = Relation<Poseidon2InternalRelationImpl<FF>>;
} // namespace bb

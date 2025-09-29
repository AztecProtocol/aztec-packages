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

    static constexpr fr D1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[0]; // decremented by 1
    static constexpr fr D2 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[1]; // decremented by 1
    static constexpr fr D3 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[2]; // decremented by 1
    static constexpr fr D4 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[3]; // decremented by 1
    static constexpr fr D1_plus_1 = fr{ 1 } + D1;
    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.q_poseidon2_internal.is_zero());
    }

    /**
     * @brief Expression for the Poseidon2 internal round relation, based on I_i in Section 6 of
     * https://eprint.iacr.org/2023/323.pdf.
     *
     * @details Let the internal round matrix M_I be the 4×4 matrix
     * \f[
     *   M_I =
     *   \begin{bmatrix}
     *     D_1 + 1 &     1   &     1   &     1   \\
     *         1   & D_2 + 1 &     1   &     1   \\
     *         1   &     1   & D_3 + 1 &     1   \\
     *         1   &     1   &     1   & D_4 + 1
     *   \end{bmatrix},
     * \quad
     * \text{where } D_i \text{ are the diagonal entries of } M_I.
     * \f]
     *
     * Define the state
     * \f[
     *   u_1 = \big(w_1 + \hat{c}_0^{(i)}\big)^{5},\qquad
     *   u_2 = w_2,\quad
     *   u_3 = w_3,\quad
     *   u_4 = w_4,\qquad
     *   \mathbf{u} = (u_1,u_2,u_3,u_4).
     * \f]
     * The internal round computes \f$ \mathbf{v} = M_I \cdot \mathbf{u}^{\top} \f$ and the relation enforces
     * \f$ v_k = w_{k,\mathrm{shift}} \f$ for \f$ k \in \{1,2,3,4\} \f$:
     * \f{align*}
     *   v_1 &= D_1\,u_1 + u_2 + u_3 + u_4,\\
     *   v_2 &= u_1 + D_2\,u_2 + u_3 + u_4,\\
     *   v_3 &= u_1 + u_2 + D_3\,u_3 + u_4,\\
     *   v_4 &= u_1 + u_2 + u_3 + D_4\,u_4,
     * \f}
     * where \f$ \hat{c}_0^{(i)} \f$ is the internal round constant (provided via the \f$ q_l \f$ selector).
     *
     * Concretely, the relation is encoded as four independent constraints multiplied by the
     * \f$\text{q_poseidon2_external}\f$ selector and the scaling factor \f$\hat{g}\f$ arising from the
     * `GateSeparatorPolynomial`. These contributions are added to the corresponding univariate accumulators
     * \f$ A_k \f$ (one per subrelation):
     * \f{align*}
     *   A_1 &\;\mathrel{+}= q_{\mathrm{poseidon2\_internal}}\cdot\big(v_1 - w_{1,\mathrm{shift}}\big)\cdot \hat{g},\\
     *   A_2 &\;\mathrel{+}= q_{\mathrm{poseidon2\_internal}}\cdot\big(v_2 - w_{2,\mathrm{shift}}\big)\cdot \hat{g},\\
     *   A_3 &\;\mathrel{+}= q_{\mathrm{poseidon2\_internal}}\cdot\big(v_3 - w_{3,\mathrm{shift}}\big)\cdot \hat{g},\\
     *   A_4 &\;\mathrel{+}= q_{\mathrm{poseidon2\_internal}}\cdot\big(v_4 - w_{4,\mathrm{shift}}\big)\cdot \hat{g}.
     * \f}
     * At the end of each Sumcheck round, the subrelation accumulators are aggregated with independent challenges
     * \f$ \alpha_i = \alpha_{i,\mathrm{Poseidon2Int}} \f$ (from the `SubrelationSeparators`)
     * \f[
     *     \alpha_{0}A_1 + \alpha_{1}A_2 + \alpha_{2}A_3 + \alpha_{3}A_4
     * \f]
     * and multiplied by the linear factor of the `GateSeparatorPolynomial`.
     * @param evals A tuple of tuples of univariate accumulators; the subtuple for this relation is
     *        \f$[A_1,A_2,A_3,A_4]\f$, with \f$ \deg(A_k) = \text{SUBRELATION_PARTIAL_LENGTHS}[k] - 1 \f$.
     * @param in In round \f$ k \f$ of Sumcheck at the point \f$ i_{>k} = (i_{k+1},\ldots,i_{d-1}) \f$ on the
     *        \f$ d-k-1 \f$ dimensional hypercube, an array of restrictions of the prover polynomials
     *        \f$ P_i(u_{<k}, X_k, i_{>k}) \f$.
     * @param parameters Not used in this relation.
     * @param scaling_factor Scaling term \f$ \hat{g} \f$ from the GateSeparatorPolynomial.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        // Univariates of degree 6 represented in Lagrange basis
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        // Low-degree univariates represented in monomial basis
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // Current state
        const auto w_1 = CoefficientAccumulator(in.w_l);
        const auto w_2 = CoefficientAccumulator(in.w_r);
        const auto w_3 = CoefficientAccumulator(in.w_o);
        const auto w_4 = CoefficientAccumulator(in.w_4);
        // Expected state, contained in the next row
        const auto w_1_shift = CoefficientAccumulator(in.w_l_shift);
        const auto w_2_shift = CoefficientAccumulator(in.w_r_shift);
        const auto w_3_shift = CoefficientAccumulator(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator(in.w_4_shift);
        // Poseidon2 internal relation selector
        const auto q_poseidon2_internal_m = CoefficientAccumulator(in.q_poseidon2_internal);
        // ĉ₀⁽ⁱ⁾ - the round constant in `i`-th  internal round
        const auto c_0_int = CoefficientAccumulator(in.q_l);

        Accumulator barycentric_term;

        // Add ĉ₀⁽ⁱ⁾ stored in the selector and convert to Lagrange basis
        auto s1 = Accumulator(w_1 + c_0_int);

        // Apply S-box. Note that the multiplication is performed point-wise
        auto u1 = s1.sqr();
        u1 = u1.sqr();
        u1 *= s1;

        const auto q_pos_by_scaling_m = (q_poseidon2_internal_m * scaling_factor);
        const auto q_pos_by_scaling = Accumulator(q_pos_by_scaling_m);
        // Common terms
        const auto partial_sum = w_2 + w_3 + w_4;
        const auto scaled_u1 = u1 * q_pos_by_scaling;

        // Row 1:
        barycentric_term = scaled_u1 * D1_plus_1;
        auto monomial_term = partial_sum - w_1_shift;
        barycentric_term += Accumulator(monomial_term * q_pos_by_scaling_m);
        std::get<0>(evals) += barycentric_term;

        // Row 2:
        auto v2_m = w_2 * D2 + partial_sum - w_2_shift;
        barycentric_term = Accumulator(v2_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<1>(evals) += barycentric_term;

        // Row 3:
        auto v3_m = w_3 * D3 + partial_sum - w_3_shift;
        barycentric_term = Accumulator(v3_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<2>(evals) += barycentric_term;

        // Row 4:
        auto v4_m = w_4 * D4 + partial_sum - w_4_shift;
        barycentric_term = Accumulator(v4_m * q_pos_by_scaling_m);
        barycentric_term += scaled_u1;
        std::get<3>(evals) += barycentric_term;
    };
}; // namespace bb

template <typename FF> using Poseidon2InternalRelation = Relation<Poseidon2InternalRelationImpl<FF>>;
} // namespace bb

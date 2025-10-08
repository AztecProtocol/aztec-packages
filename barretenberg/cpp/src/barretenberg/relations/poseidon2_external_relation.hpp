// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
namespace bb {

template <typename FF_> class Poseidon2ExternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        7, // external poseidon2 round sub-relation for first value
        7, // external poseidon2 round sub-relation for second value
        7, // external poseidon2 round sub-relation for third value
        7, // external poseidon2 round sub-relation for fourth value
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_external.is_zero();
    }

    /**
     * @brief Expression for the poseidon2 external round relation, based on \f$ E_i \f$ in Section 6 of
     * https://eprint.iacr.org/2023/323.pdf.
     * @details For state \f$ \mathbf{u} = (u_1, u_2, u_3, u_4)\f$ with \f$ u_i = \big(w_i + c_i^{(i)}\big)^5 \f$, the
     * external round computes \f$ \mathbf{v} = M_E \cdot \mathbf{u}^{\top}\f$, where \f$M_E\f$ is the external round
     * matrix defined as follows:
     *
     * \f[
     *   M_E =
     *   \begin{bmatrix}
     *     5 & 7 & 1 & 3 \\
     *     4 & 6 & 1 & 1 \\
     *     1 & 3 & 5 & 7 \\
     *     1 & 1 & 4 & 6
     *   \end{bmatrix}
     * \f]
     *
     * i.e.
     * \f{align}{
     *   v_1 &= 5u_1 + 7u_2 + u_3 + 3u_4 \\
     *   v_2 &= 4u_1 + 6u_2 + u_3 + u_4 \\
     *   v_3 &= u_1 + 3u_2 + 5u_3 + 7u_4 \\
     *   v_4 &= u_1 + u_2 + 4u_3 + 6u_4
     * \f}
     *
     * The relation enforces \f$ v_k = w_{k,shift}\f$ for \f$ k \in \{1,2,3,4\}\f$.
     * Concretely, the relation is encoded as four independent constraints multiplied by the
     * \f$\text{q_poseidon2_external}\f$ selector and the scaling factor \f$\hat{g}\f$ arising from the
     * `GateSeparatorPolynomial`. These contributions are added to the corresponding univariate accumulator \f$ A_i
     * \f$:
     * \f{align}{
     *   A_1 &\;\mathrel{+}=  \text{q_poseidon2_internal}\cdot \big(v_1 - w_{1,\text{shift}}\big) \cdot \hat{g} \\
     *   A_2 &\;\mathrel{+}=  \text{q_poseidon2_internal}\cdot \big(v_1 - w_{1,\text{shift}}\big) \cdot \hat{g} \\
     *   A_3 &\;\mathrel{+}=  \text{q_poseidon2_internal}\cdot \big(v_3 - w_{3,\text{shift}}\big) \cdot \hat{g} \\
     *   A_4 &\;\mathrel{+}=  \text{q_poseidon2_internal}\cdot \big(v_4 - w_{4,\text{shift}}\big) \cdot \hat{g}
     * \f}
     * At the end of each Sumcheck Round, the subrelation accumulators are aggregated with independent challenges
     * \f$\alpha_{i} = \alpha_{i, \text{Poseidon2Ext}}\f$ taken from the array of `SubrelationSeparators`
     * \f[
     *     \alpha_{0} A_1 +
     *     \alpha_{1} A_2 +
     *     \alpha_{2} A_3 +
     *     \alpha_{3} A_4
     * \f]
     * and multiplied by the linear factor of the `GateSeparatorPolynomial`.
     *
     * @param evals a tuple of tuples of univariate accumulators, the subtuple corresponding to this relation consists
     * of \f$ [A_0, A_1, A_2, A_3]\f$ , such that
     *      \f$ \deg(A_i) = \text{SUBRELATION_PARTIAL_LENGTHS}[i] - 1 \f$.
     * @param in In round \f$ k \f$ of Sumcheck at the point \f$i_{>k} = (i_{k+1}, \ldots, i_{d-1})\f$ on the
     * \f$d-k-1\f$-dimensional hypercube, given by an array containing the restrictions of the prover polynomials
     *      \f$ P_i(u_{<k}, X_k, i_{>k}) \f$.
     * @param parameters Not used in this relation
     * @param scaling_factor scaling term coming from `GateSeparatorPolynomial`.
     *
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
        // i-th external round constants
        const auto c_1 = CoefficientAccumulator(in.q_l);
        const auto c_2 = CoefficientAccumulator(in.q_r);
        const auto c_3 = CoefficientAccumulator(in.q_o);
        const auto c_4 = CoefficientAccumulator(in.q_4);
        // Poseidon2 external relation selector
        const auto q_poseidon2_external = CoefficientAccumulator(in.q_poseidon2_external);

        // add round constants which are loaded in selectors

        auto sbox = [](const Accumulator& x) {
            auto t2 = x.sqr();  // x^2
            auto t4 = t2.sqr(); // x^4
            return t4 * x;      // x^5
        };
        // apply s-box round
        auto u1 = sbox(Accumulator(w_1 + c_1));
        auto u2 = sbox(Accumulator(w_2 + c_2));
        auto u3 = sbox(Accumulator(w_3 + c_3));
        auto u4 = sbox(Accumulator(w_4 + c_4));
        // Matrix mul v = M_E * u with 14 additions.
        // Precompute common summands.
        auto t0 = u1 + u2; // u_1 + u_2
        auto t1 = u3 + u4; // u_3 + u_4
        auto t2 = u2 + u2; // 2u_2
        t2 += t1;          // 2u_2 + u_3 + u_4
        auto t3 = u4 + u4; // 2u_4
        t3 += t0;          // u_1 + u_2 + 2u_4

        // Row 4: u_1 + u_2 + 4u_3 + 6u_4
        auto v4 = t1 + t1;
        v4 += v4;
        v4 += t3;

        // Row 2: 4u_1 + 6u_2 + u_3 + u_4
        auto v2 = t0 + t0;
        v2 += v2;
        v2 += t2;
        // Row 1: 5u_1 + 7u_2 + u_3 + 3u_4
        auto v1 = t3 + v2;

        // Row 3: u_1 + 3u_2 + 5u_3 + 7u_4
        auto v3 = t2 + v4;

        auto q_pos_by_scaling = Accumulator(q_poseidon2_external * scaling_factor);
        std::get<0>(evals) += q_pos_by_scaling * (v1 - Accumulator(w_1_shift));

        std::get<1>(evals) += q_pos_by_scaling * (v2 - Accumulator(w_2_shift));

        std::get<2>(evals) += q_pos_by_scaling * (v3 - Accumulator(w_3_shift));

        std::get<3>(evals) += q_pos_by_scaling * (v4 - Accumulator(w_4_shift));
    };
};

template <typename FF> using Poseidon2ExternalRelation = Relation<Poseidon2ExternalRelationImpl<FF>>;
} // namespace bb

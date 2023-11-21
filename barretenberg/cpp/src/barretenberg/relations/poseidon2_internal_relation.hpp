#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system {

template <typename FF_> class Poseidon2InternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_LENGTHS{
        7, // internal poseidon2 round sub-relation for first value
        7, // internal poseidon2 round sub-relation for second value
        7, // internal poseidon2 round sub-relation for third value
        7, // internal poseidon2 round sub-relation for fourth value
    };

    /**
     * @brief Expression for the poseidon2 internal gate.
     * @details This relation is defined as:
     * q_pos2 * ( (v1 - w_1_shift) + \alpha * (v2 - w_2_shift) +
     * \alpha^2 * (v3 - w_3_shift) + \alpha^3 * (v4 - w_4_shift) ) = 0 where:
     *      v1 := (w_1 + q_1)^5
     *      v2 := w_2
     *      v3 := w_3
     *      v4 := w_4
     *      sum := v1 + v2 + v3 + v4
     *      v1 := v1 * D1 + sum
     *      v2 := v2 * D2 + sum
     *      v3 := v3 * D3 + sum
     *      v4 := v4 * D4 + sum
     *      Di is the ith internal diagonal value - 1 of the internal matrix
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const RelationParameters<FF>&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        auto w_l = View(in.w_l);
        auto w_r = View(in.w_r);
        auto w_o = View(in.w_o);
        auto w_4 = View(in.w_4);
        auto w_l_shift = View(in.w_l_shift);
        auto w_r_shift = View(in.w_r_shift);
        auto w_o_shift = View(in.w_o_shift);
        auto w_4_shift = View(in.w_4_shift);
        auto q_l = View(in.q_l);
        auto q_r = View(in.q_r);
        auto q_o = View(in.q_o);
        auto q_4 = View(in.q_4);
        auto q_poseidon2_internal = View(in.q_poseidon2_internal);

        // add round constants
        w_l += q_l;

        // apply s-box round
        auto v1 = w_l * w_l;
        v1 *= v1;
        v1 *= w_l;
        auto v2 = w_r;
        auto v3 = w_o;
        auto v4 = w_4;

        // matrix mul with 4 muls and 7 additions
        auto sum = v1 + v2 + v3 + v4;
        {
            v1 *= crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[0];
            v1 += sum;
            auto tmp = q_poseidon2_internal * (v1 - w_l_shift);
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        {
            v2 *= crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[1];
            v2 += sum;
            auto tmp = q_poseidon2_internal * (v2 - w_r_shift);
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        {
            v3 *= crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[2];
            v3 += sum;
            auto tmp = q_poseidon2_internal * (v3 - w_o_shift);
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        {
            v4 *= crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal[3];
            v4 += sum;
            auto tmp = q_poseidon2_internal * (v4 - w_4_shift);
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
    };
}; // namespace proof_system

template <typename FF> using Poseidon2InternalRelation = Relation<Poseidon2InternalRelationImpl<FF>>;
} // namespace proof_system

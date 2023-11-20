#pragma once
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system {

template <typename FF_> class Poseidon2ExternalRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_LENGTHS{
        7, // external poseidon2 round sub-relation for first value
        7, // external poseidon2 round sub-relation for second value
        7, // external poseidon2 round sub-relation for third value
        7, // external poseidon2 round sub-relation for fourth value
    };

    /**
     * @brief Expression for the poseidon2 external gate.
     * @details This relation is defined as:
     * q_pos2 * ( (t6 - w_1_shift) + \alpha * (t5 - w_2_shift) + \alpha^2 * (t7 - w_3_shift) + \alpha^3 * (t4 -
     * w_4_shift) ) = 0
     * where:
     *      t0 := w_1 + w_2                                             (1, 1, 0, 0)
     *      t1 := w_3 + w_4                                             (0, 0, 1, 1)
     *      t2 := w_2 + w_2 + t1 = 2 * w_2 + w_3 + w_4                  (0, 2, 1, 1)
     *      t3 := w_4 + w_4 + t0 = w_1 + w_2 + 2 * w_4                  (1, 1, 0, 2)
     *      t4 := 2 * (t1 + t1) + t3 = w_1 + w_2 + 4 * w_3 + 6 * w_4    (1, 1, 4, 6)
     *      t5 := 2 * (t0 + t0) + t2 = 4 * w_1 + 6 * w_2 + w_3 + w_4    (4, 6, 1, 1)
     *      t6 := t3 + t5 = 5 * w_1 + 7 * w_2 + 1 * w_3 + 3 * w_4       (5, 7, 1, 3)
     *      t7 := t2 + t4                                               (1, 3, 5, 7)
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
        auto q_pos2_ext = View(in.q_pos2_ext);

        auto t0 = w_l + w_r; // A + B
        auto t1 = w_o + w_4; // C + D
        auto t2 = w_r + w_r; // 2B
        t2 += t1;            // 2B + C + D
        auto t3 = w_4 + w_4; // 2D
        t3 += t0;            // 2D + A + B
        auto t4 = t1 + t1;
        t4 += t4;
        t4 += t3; // A + B + 4C + 6D
        auto t5 = t0 + t0;
        t5 += t5;
        t5 += t2;          // 4A + 6B + C + D
        auto t6 = t3 + t5; // 5A + 7B + 3C + D
        auto t7 = t2 + t4; // A + 3B + 5D + 7C

        {
            auto tmp = q_pos2_ext * (t6 - w_l_shift);
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        {
            auto tmp = q_pos2_ext * (t5 - w_r_shift);
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        {
            auto tmp = q_pos2_ext * (t7 - w_o_shift);
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        {
            auto tmp = q_pos2_ext * (t4 - w_4_shift);
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
    };
};

template <typename FF> using Poseidon2ExternalRelation = Relation<Poseidon2ExternalRelationImpl<FF>>;
} // namespace proof_system

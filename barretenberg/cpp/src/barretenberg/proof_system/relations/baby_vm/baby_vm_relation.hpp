#pragma once

#include "../relation_parameters.hpp"
#include "../relation_types.hpp"

namespace proof_system {

template <typename FF_> class BabyVMRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3;

    static constexpr size_t LEN_1 = 4; // multiplication sub-relation
    static constexpr size_t LEN_2 = 5; // addition sub-relation
    static constexpr size_t LEN_3 = 3; // boolean condition on q_mul
    static constexpr size_t LEN_4 = 3; // boolean condition on q_add
    static constexpr size_t LEN_5 = 3; // multual exclusion condition: only one operation is active
    template <template <size_t...> typename SubrelationAccumulatorsTemplate>
    using GetAccumulatorTypes = SubrelationAccumulatorsTemplate<LEN_1, LEN_2, LEN_3, LEN_4, LEN_5>;

    /**
     * @brief Expression for the BabyVMMultiplication gate.
     * @details The relation is defined as, for some challenge c,
     *                  (q_add) * (1 - q_mul) * ((w_r + w_l) - w_o)
     *            c   + (q_mul) * (1 - q_add) * ((w_r * w_l) - w_o)
     *            c^2 + (1 - q_mul) * q_mul
     *            c^3 + (1 - q_add) * q_add
     *            c^4 + q_add * q_mul
     *
     * @param accumulator the term being calculated by a sequence of calls to this function
     * @param new_term the term added to the accumulator in this iteration of the function
     * @param parameters inputs not varying between successive executions of this function
     * @param scaling_factor scales the new_term before incorporating it into the accumulator
     */
    template <typename AccumulatorTypes>
    void static accumulate(typename AccumulatorTypes::Accumulators& accumulators,
                           const auto& new_term,
                           [[maybe_unused]] const RelationParameters<FF>& parameters,
                           const FF& scaling_factor)
    {
        // WORKTODO: do this for each relation
        using View = typename std::tuple_element_t<0, typename AccumulatorTypes::AccumulatorViews>;
        auto w_l = View(new_term.w_l);
        auto w_r = View(new_term.w_r);
        auto w_o = View(new_term.w_o);
        auto q_mul = View(new_term.q_mul);
        auto q_add = View(new_term.q_add);

        auto tmp = w_l + w_r - w_o;
        tmp *= q_add;
        tmp *= (FF(1) - q_mul);
        tmp *= scaling_factor;
        std::get<0>(accumulators) += tmp;

        tmp = w_l * w_r - w_o;
        tmp *= q_mul;
        tmp *= (FF(1) - q_add);
        tmp *= scaling_factor;
        std::get<1>(accumulators) += tmp;

        tmp = q_mul;
        tmp *= (FF(1) - q_mul);
        tmp *= scaling_factor;
        std::get<2>(accumulators) += tmp;

        tmp = q_add;
        tmp *= (FF(1) - q_add);
        tmp *= scaling_factor;
        std::get<3>(accumulators) += tmp;

        tmp = q_add;
        tmp *= q_mul;
        tmp *= scaling_factor;
        std::get<4>(accumulators) += tmp;
    };
};

template <typename FF> using BabyVMRelation = Relation<BabyVMRelationImpl<FF>>;
} // namespace proof_system

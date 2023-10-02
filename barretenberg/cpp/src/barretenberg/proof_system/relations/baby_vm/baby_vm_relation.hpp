#pragma once

#include "../relation_parameters.hpp"
#include "../relation_types.hpp"

#define GET_BABYVM_SUBRELATION_RELATION_VIEWS(subrelation_idx)                                                         \
    using View = typename std::tuple_element<subrelation_idx, typename AccumulatorTypes::AccumulatorViews>::type;      \
    [[maybe_unused]] auto scalar = View(new_term.scalar);                                                              \
    [[maybe_unused]] auto q_mul = View(new_term.q_mul);                                                                \
    [[maybe_unused]] auto q_add = View(new_term.q_add);                                                                \
    [[maybe_unused]] auto accumulator = View(new_term.accumulator);                                                    \
    [[maybe_unused]] auto previous_accumulator = View(new_term.previous_accumulator);

namespace proof_system {

template <typename FF_> class BabyVMRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3;

    static constexpr size_t LEN_1 = 3; // multiplication sub-relation
    static constexpr size_t LEN_2 = 3; // addition sub-relation
    static constexpr size_t LEN_3 = 4; // boolean condition on q_mul
    static constexpr size_t LEN_4 = 4; // boolean condition on q_add
    static constexpr size_t LEN_5 = 5; // multual exclusion condition: only one operation is active
    template <template <size_t...> typename SubrelationAccumulatorsTemplate>
    using GetAccumulatorTypes = SubrelationAccumulatorsTemplate<LEN_1, LEN_2, LEN_3, LEN_4, LEN_5>;

    /**
     * @brief Expression for the BabyVMMultiplication gate.
     * @details The relation is defined as, for some challenge c (the scaling factor),
     *
     *     c^0 * (1 - q_mul) *      q_mul
     *   + c^1 * (1 - q_add) *      q_add
     *   + c^2 * (1 - q_add) * (1 - q_mul) * (accumulator - scalar)
     *   + c^3 * (1 - q_mul) *      q_add  * (accumulator - (previous_accumulator + scalar))
     *   + c^4 * (1 - q_add) *      q_mul  * (accumulator - (previous_accumulator * scalar))
     *
     * @param accumulator the term being calculated by a sequence of calls to this function
     * @param new_term the term added to the accumulator in this iteration of the function
     * @param parameters inputs not varying between successive executions of this function
     * @param scaling_factor scales the new_term before incorporating it into the accumulator
     */
    template <typename AccumulatorTypes>
    void static accumulate(typename AccumulatorTypes::Accumulators& accumulators,
                           const auto& new_term,
                           // some relations, such as those used for copy constraints and lookup arguments,
                           // require parameters that are not supplied through the execution trace.
                           [[maybe_unused]] const RelationParameters<FF>& parameters,
                           // scaling factor is needed for protocol correctness.
                           // It is not a part of the relation logic
                           const FF& scaling_factor)
    {
        // EXERCISE NOTE: Executing the relations is one of our two "hot loops", so this will eventually be as optimized
        // as possible. For now I only care about clarity.

        // EXERCISE NOTE: I use immediately returning lambdas rather than unnamed scopes to get around a bug in
        // clang-format that misinterprets unnamed nested scopes and makes the formatting look horrible.

        [&]() { // boolean condition on q_mul
            GET_BABYVM_SUBRELATION_RELATION_VIEWS(0)
            auto tmp = q_mul;
            tmp *= (FF(1) - q_mul);
            tmp *= scaling_factor;
            std::get<0>(accumulators) += tmp;
        }();

        [&]() { // boolean condition on q_add
            GET_BABYVM_SUBRELATION_RELATION_VIEWS(1)
            auto tmp = q_add;
            tmp *= (FF(1) - q_add);
            tmp *= scaling_factor;
            std::get<1>(accumulators) += tmp;
        }();

        [&]() { // showing that the accumulator equals a given value
            GET_BABYVM_SUBRELATION_RELATION_VIEWS(2)
            auto tmp = (FF(1) - q_add);
            tmp *= (FF(1) - q_mul);
            tmp *= (accumulator - scalar);
            tmp *= scaling_factor;
            std::get<2>(accumulators) += tmp;
        }();

        [&]() { // adding something into the accumulator
            GET_BABYVM_SUBRELATION_RELATION_VIEWS(3)
            auto tmp = (FF(1) - q_mul);
            tmp *= q_add;
            tmp *= (accumulator - (previous_accumulator + scalar));
            tmp *= scaling_factor;
            std::get<3>(accumulators) += tmp;
        }();

        [&]() { // multiplying something into the accumulator
            GET_BABYVM_SUBRELATION_RELATION_VIEWS(4)
            auto tmp = (FF(1) - q_add);
            tmp *= q_mul;
            tmp *= (accumulator - (previous_accumulator * scalar));
            tmp *= scaling_factor;
            std::get<4>(accumulators) += tmp;
        }();
    };
};

template <typename FF> using BabyVMRelation = Relation<BabyVMRelationImpl<FF>>;
} // namespace proof_system

#pragma once
#include <array>
#include <tuple>

#include "../polynomials/univariate.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system::honk::sumcheck {

/**
 * @brief Base template for the opcode range constraint relation in goblin translator
 *
 * @tparam FF
 */
template <typename FF> class GoblinTranslatorOpRangeConstraintRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 5;
    static constexpr size_t LEN_1 = 5; // range constrain sub-relation 1
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase = AccumulatorTypesContainer<LEN_1>;

    /**
     * @brief Expression for the Op wire range constraint
     * @details The relation enforces Op to be in the range {0,1,2,3} via a single subrelation
     *
     * @param evals transformed to `evals + C(extended_edges(X)...)*scaling_factor`
     * @param extended_edges an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename AccumulatorTypes>
    void static add_edge_contribution_impl(typename AccumulatorTypes::Accumulators& accumulators,
                                           const auto& extended_edges,
                                           const RelationParameters<FF>&,
                                           const FF& scaling_factor)
    {
        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
        auto op = View(extended_edges.op);
        static const FF minus_one = FF(-1);
        static const FF minus_two = FF(-2);
        static const FF minus_three = FF(-3);

        // Contribution (1) (op(op-1)(op-2)(op-3))
        auto tmp_1 = op * (op + minus_one);
        tmp_1 *= (op + minus_two);
        tmp_1 *= (op + minus_three);
        tmp_1 *= scaling_factor;
        std::get<0>(accumulators) += tmp_1;
    };
};

/**
 * @brief Goblin Translator relation that enforces some additional logic related to the accumulator
 *
 * @details Accumulator Transfer relation has several subrelations enforcing 3 pieces of logic:
 * 1) At even gates in the minicircuit the accumulator limbs are copied from shifted limbs to unshifted
 * 2) At the last gate in the minicircuit where the accumulator value is used it is set to 0 (we accumulate starting
 * from higher indices) 3) At the first gate where accumulator is computed (the last accumulation) it is equal to the
 * submitted accumulation result
 * @tparam FF
 */
template <typename FF> class GoblinTranslatorAccumulatorTransferRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3; // degree((SOME_LAGRANGE)(A-B)) = 2
    static constexpr size_t LEN_1 = 3;
    static constexpr size_t LEN_2 = 3;
    static constexpr size_t LEN_3 = 3;
    static constexpr size_t LEN_4 = 3;
    static constexpr size_t LEN_5 = 3;
    static constexpr size_t LEN_6 = 3;
    static constexpr size_t LEN_7 = 3;
    static constexpr size_t LEN_8 = 3;
    static constexpr size_t LEN_9 = 3;
    static constexpr size_t LEN_10 = 3;
    static constexpr size_t LEN_11 = 3;
    static constexpr size_t LEN_12 = 3;
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase = AccumulatorTypesContainer<LEN_1,
                                                           LEN_2,
                                                           LEN_3,
                                                           LEN_4,
                                                           LEN_5,
                                                           LEN_6,
                                                           LEN_7,
                                                           LEN_8,
                                                           LEN_9,
                                                           LEN_10,
                                                           LEN_11,
                                                           LEN_12>;

    /**
     * @brief Expression for connecting accumulator values with 0, output and between computations tep
     * @details Details can be found in the template description.
     *
     * @param evals transformed to `evals + C(extended_edges(X)...)*scaling_factor`
     * @param extended_edges an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename AccumulatorTypes>
    void static add_edge_contribution_impl(typename AccumulatorTypes::Accumulators& accumulators,
                                           const auto& extended_edges,
                                           const RelationParameters<FF>& relation_parameters,
                                           const FF& scaling_factor)
    {
        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;

        // We use combination of lagrange polynomials at even indices in the minicircuit for copying the accumulator
        auto lagrange_even = View(extended_edges.lagrange_even);

        // Lagrange at index 1 is used to confirm the accumulator result
        auto lagrange_second = View(extended_edges.lagrange_second);

        // Lagrange at index (size of minicircuit - 2) is used to enforce that it starts with zero
        auto lagrange_second_to_last_in_minicircuit = View(extended_edges.lagrange_second_to_last_in_minicircuit);

        auto accumulators_binary_limbs_0 = View(extended_edges.accumulators_binary_limbs_0);
        auto accumulators_binary_limbs_1 = View(extended_edges.accumulators_binary_limbs_1);
        auto accumulators_binary_limbs_2 = View(extended_edges.accumulators_binary_limbs_2);
        auto accumulators_binary_limbs_3 = View(extended_edges.accumulators_binary_limbs_3);
        auto accumulators_binary_limbs_0_shift = View(extended_edges.accumulators_binary_limbs_0_shift);
        auto accumulators_binary_limbs_1_shift = View(extended_edges.accumulators_binary_limbs_1_shift);
        auto accumulators_binary_limbs_2_shift = View(extended_edges.accumulators_binary_limbs_2_shift);
        auto accumulators_binary_limbs_3_shift = View(extended_edges.accumulators_binary_limbs_3_shift);

        // Contribution (1) (1-4 ensure transfer of accumulator limbs at even indices of the minicircuit)
        auto tmp_1 = accumulators_binary_limbs_0 - accumulators_binary_limbs_0_shift;
        tmp_1 *= lagrange_even;
        tmp_1 *= scaling_factor;
        std::get<0>(accumulators) += tmp_1;

        // Contribution (2)
        auto tmp_2 = accumulators_binary_limbs_1 - accumulators_binary_limbs_1_shift;
        tmp_2 *= lagrange_even;
        tmp_2 *= scaling_factor;
        std::get<1>(accumulators) += tmp_2;
        // Contribution (3)
        auto tmp_3 = accumulators_binary_limbs_2 - accumulators_binary_limbs_2_shift;
        tmp_3 *= lagrange_even;
        tmp_3 *= scaling_factor;
        std::get<2>(accumulators) += tmp_3;
        // Contribution (4)
        auto tmp_4 = accumulators_binary_limbs_3 - accumulators_binary_limbs_3_shift;
        tmp_4 *= lagrange_even;
        tmp_4 *= scaling_factor;
        std::get<3>(accumulators) += tmp_4;

        // Contribution (5) (5-9 ensure that accumulator starts with zeroed-out limbs)
        auto tmp_5 = accumulators_binary_limbs_0 * lagrange_second_to_last_in_minicircuit;
        tmp_5 *= scaling_factor;
        std::get<4>(accumulators) += tmp_5;

        // Contribution (6)
        auto tmp_6 = accumulators_binary_limbs_1 * lagrange_second_to_last_in_minicircuit;
        tmp_6 *= scaling_factor;
        std::get<5>(accumulators) += tmp_6;

        // Contribution (7)
        auto tmp_7 = accumulators_binary_limbs_2 * lagrange_second_to_last_in_minicircuit;
        tmp_7 *= scaling_factor;
        std::get<6>(accumulators) += tmp_7;

        // Contribution (8)
        auto tmp_8 = accumulators_binary_limbs_3 * lagrange_second_to_last_in_minicircuit;
        tmp_8 *= scaling_factor;
        std::get<7>(accumulators) += tmp_8;

        // Contribution (9) (9-12 ensure the output is as stated)
        auto tmp_9 = (accumulators_binary_limbs_0 - relation_parameters.accumulated_result[0]) * lagrange_second;
        tmp_9 *= scaling_factor;
        std::get<8>(accumulators) += tmp_9;

        // Contribution (10)
        auto tmp_10 = (accumulators_binary_limbs_1 - relation_parameters.accumulated_result[1]) * lagrange_second;
        tmp_10 *= scaling_factor;
        std::get<9>(accumulators) += tmp_10;

        // Contribution (11)
        auto tmp_11 = (accumulators_binary_limbs_2 - relation_parameters.accumulated_result[2]) * lagrange_second;
        tmp_11 *= scaling_factor;
        std::get<10>(accumulators) += tmp_11;

        // Contribution (12)
        auto tmp_12 = (accumulators_binary_limbs_3 - relation_parameters.accumulated_result[3]) * lagrange_second;
        tmp_12 *= scaling_factor;
        std::get<11>(accumulators) += tmp_12;
    };
};
template <typename FF>
using GoblinTranslatorOpRangeConstraintRelation = RelationWrapper<FF, GoblinTranslatorOpRangeConstraintRelationBase>;
template <typename FF>
using GoblinTranslatorAccumulatorTransferRelation =
    RelationWrapper<FF, GoblinTranslatorAccumulatorTransferRelationBase>;

} // namespace proof_system::honk::sumcheck

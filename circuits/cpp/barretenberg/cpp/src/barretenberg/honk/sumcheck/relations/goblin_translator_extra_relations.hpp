#pragma once
#include <array>
#include <tuple>

#include "../polynomials/univariate.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system::honk::sumcheck {

template <typename FF> class GoblinTranslatorOpRangeConstraintRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 5; // degree((LAGRANGE_LAST-1)D(D - 1)(D - 2)(D - 3)) = 5
    static constexpr size_t LEN_1 = 5;           // range constrain sub-relation 1
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase = AccumulatorTypesContainer<LEN_1>;

    /**
     * @brief Expression for the generalized permutation sort gate.
     * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
     * 1) 2 sequential values are non-descending and have a difference of at most 3, except for the value at last index
     * 2) The value at last index is (1<<14)-1
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
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
        auto op = View(extended_edges.op);
        static const FF minus_one = FF(-1);
        static const FF minus_two = FF(-2);
        static const FF minus_three = FF(-3);

        // Contribution (1)
        auto tmp_1 = op * (op + minus_one);
        tmp_1 *= (op + minus_two);
        tmp_1 *= (op + minus_three);
        tmp_1 *= scaling_factor;
        std::get<0>(accumulators) += tmp_1;
    };
};

template <typename FF> class GoblinTranslatorAccumulatorTransferRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3; // degree((LAGRANGE_LAST-1)D(D - 1)(D - 2)(D - 3)) = 5
    static constexpr size_t LEN_1 = 3;           // range constrain sub-relation 1
    static constexpr size_t LEN_2 = 3;           // range constrain sub-relation 1
    static constexpr size_t LEN_3 = 3;           // range constrain sub-relation 1
    static constexpr size_t LEN_4 = 3;           // range constrain sub-relation 1
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase = AccumulatorTypesContainer<LEN_1, LEN_2, LEN_3, LEN_4>;

    /**
     * @brief Expression for the generalized permutation sort gate.
     * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
     * 1) 2 sequential values are non-descending and have a difference of at most 3, except for the value at last index
     * 2) The value at last index is (1<<14)-1
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
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
        auto lagrange_even = View(extended_edges.lagrange_even);
        auto accumulators_binary_limbs_0 = View(extended_edges.accumulators_binary_limbs_0);
        auto accumulators_binary_limbs_1 = View(extended_edges.accumulators_binary_limbs_1);
        auto accumulators_binary_limbs_2 = View(extended_edges.accumulators_binary_limbs_2);
        auto accumulators_binary_limbs_3 = View(extended_edges.accumulators_binary_limbs_3);
        auto accumulators_binary_limbs_0_shift = View(extended_edges.accumulators_binary_limbs_0_shift);
        auto accumulators_binary_limbs_1_shift = View(extended_edges.accumulators_binary_limbs_1_shift);
        auto accumulators_binary_limbs_2_shift = View(extended_edges.accumulators_binary_limbs_2_shift);
        auto accumulators_binary_limbs_3_shift = View(extended_edges.accumulators_binary_limbs_3_shift);

        // Contribution (1)
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
    };
};
template <typename FF>
using GoblinTranslatorOpRangeConstraintRelation = RelationWrapper<FF, GoblinTranslatorOpRangeConstraintRelationBase>;
template <typename FF>
using GoblinTranslatorAccumulatorTransferRelation =
    RelationWrapper<FF, GoblinTranslatorAccumulatorTransferRelationBase>;

} // namespace proof_system::honk::sumcheck

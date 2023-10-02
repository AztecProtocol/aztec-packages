#pragma once
#include <array>
#include <tuple>

#include "../polynomials/univariate.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system::honk::sumcheck {

template <typename FF> class GoblinTranslatorGenPermSortRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 6; // degree((LAGRANGE_LAST-1)D(D - 1)(D - 2)(D - 3)) = 5
    static constexpr auto MAXIMUM_SORT_VALUE = -FF((1 << 14) - 1);
    static constexpr size_t LEN_1 = 6;  // range constrain sub-relation 1
    static constexpr size_t LEN_2 = 6;  // range constrain sub-relation 2
    static constexpr size_t LEN_3 = 6;  // range constrain sub-relation 3
    static constexpr size_t LEN_4 = 6;  // range constrain sub-relation 4
    static constexpr size_t LEN_5 = 6;  // range constrain sub-relation 4
    static constexpr size_t LEN_6 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_7 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_8 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_9 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_10 = 3; // range constrain sub-relation 4
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase =
        AccumulatorTypesContainer<LEN_1, LEN_2, LEN_3, LEN_4, LEN_5, LEN_6, LEN_7, LEN_8, LEN_9, LEN_10>;

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
                                           const FF& scaling_factor){
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        { using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
    auto ordered_range_constraints_0 = View(extended_edges.ordered_range_constraints_0);
    auto ordered_range_constraints_1 = View(extended_edges.ordered_range_constraints_1);
    auto ordered_range_constraints_2 = View(extended_edges.ordered_range_constraints_2);
    auto ordered_range_constraints_3 = View(extended_edges.ordered_range_constraints_3);
    auto ordered_range_constraints_4 = View(extended_edges.ordered_range_constraints_4);
    auto ordered_range_constraints_0_shift = View(extended_edges.ordered_range_constraints_0_shift);
    auto ordered_range_constraints_1_shift = View(extended_edges.ordered_range_constraints_1_shift);
    auto ordered_range_constraints_2_shift = View(extended_edges.ordered_range_constraints_2_shift);
    auto ordered_range_constraints_3_shift = View(extended_edges.ordered_range_constraints_3_shift);
    auto ordered_range_constraints_4_shift = View(extended_edges.ordered_range_constraints_4_shift);
    auto lagrange_last = View(extended_edges.lagrange_last);

    static const FF minus_one = FF(-1);
    static const FF minus_two = FF(-2);
    static const FF minus_three = FF(-3);

    // Compute wire differences
    auto delta_1 = ordered_range_constraints_0_shift - ordered_range_constraints_0;
    auto delta_2 = ordered_range_constraints_1_shift - ordered_range_constraints_1;
    auto delta_3 = ordered_range_constraints_2_shift - ordered_range_constraints_2;
    auto delta_4 = ordered_range_constraints_3_shift - ordered_range_constraints_3;
    auto delta_5 = ordered_range_constraints_4_shift - ordered_range_constraints_4;

    // Contribution (1)
    auto tmp_1 = delta_1;
    tmp_1 *= (delta_1 + minus_one);
    tmp_1 *= (delta_1 + minus_two);
    tmp_1 *= (delta_1 + minus_three);
    tmp_1 *= (lagrange_last + minus_one);
    tmp_1 *= scaling_factor;
    std::get<0>(accumulators) += tmp_1;

    // // Contribution (2)
    auto tmp_2 = delta_2;
    tmp_2 *= (delta_2 + minus_one);
    tmp_2 *= (delta_2 + minus_two);
    tmp_2 *= (delta_2 + minus_three);
    tmp_2 *= (lagrange_last + minus_one);
    tmp_2 *= scaling_factor;

    std::get<1>(accumulators) += tmp_2;

    // // Contribution (3)
    auto tmp_3 = delta_3;
    tmp_3 *= (delta_3 + minus_one);
    tmp_3 *= (delta_3 + minus_two);
    tmp_3 *= (delta_3 + minus_three);
    tmp_3 *= (lagrange_last + minus_one);
    tmp_3 *= scaling_factor;
    std::get<2>(accumulators) += tmp_3;

    // // Contribution (4)
    auto tmp_4 = delta_4;
    tmp_4 *= (delta_4 + minus_one);
    tmp_4 *= (delta_4 + minus_two);
    tmp_4 *= (delta_4 + minus_three);
    tmp_4 *= (lagrange_last + minus_one);
    tmp_4 *= scaling_factor;
    std::get<3>(accumulators) += tmp_4;

    // // Contribution (5)
    auto tmp_5 = delta_5;
    tmp_5 *= (delta_5 + minus_one);
    tmp_5 *= (delta_5 + minus_two);
    tmp_5 *= (delta_5 + minus_three);
    tmp_5 *= (lagrange_last + minus_one);
    tmp_5 *= scaling_factor;
    std::get<4>(accumulators) += tmp_5;
}
{
    using View = typename std::tuple_element<5, typename AccumulatorTypes::AccumulatorViews>::type;
    auto ordered_range_constraints_0 = View(extended_edges.ordered_range_constraints_0);
    auto ordered_range_constraints_1 = View(extended_edges.ordered_range_constraints_1);
    auto ordered_range_constraints_2 = View(extended_edges.ordered_range_constraints_2);
    auto ordered_range_constraints_3 = View(extended_edges.ordered_range_constraints_3);
    auto ordered_range_constraints_4 = View(extended_edges.ordered_range_constraints_4);
    auto lagrange_last = View(extended_edges.lagrange_last);
    // Contirbution (6)
    std::get<5>(accumulators) += lagrange_last * (ordered_range_constraints_0 + MAXIMUM_SORT_VALUE) * scaling_factor;
    // Contirbution (7)
    std::get<6>(accumulators) += lagrange_last * (ordered_range_constraints_1 + MAXIMUM_SORT_VALUE) * scaling_factor;
    // Contirbution (8)
    std::get<7>(accumulators) += lagrange_last * (ordered_range_constraints_2 + MAXIMUM_SORT_VALUE) * scaling_factor;
    // Contirbution (9)
    std::get<8>(accumulators) += lagrange_last * (ordered_range_constraints_3 + MAXIMUM_SORT_VALUE) * scaling_factor;
    // Contirbution (10)
    std::get<9>(accumulators) += lagrange_last * (ordered_range_constraints_4 + MAXIMUM_SORT_VALUE) * scaling_factor;
}
}; // namespace proof_system::honk::sumcheck
}
;

template <typename FF>
using GoblinTranslatorGenPermSortRelation = RelationWrapper<FF, GoblinTranslatorGenPermSortRelationBase>;

} // namespace proof_system::honk::sumcheck

#pragma once
#include <array>
#include <tuple>

#include "../polynomials/univariate.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system::honk::sumcheck {

template <typename FF> class GoblinTranslatorDecompositionRelationBase {
  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3; // degree((LAGRANGE_LAST-1)D(D - 1)(D - 2)(D - 3)) = 5
    static constexpr auto SHIFT = FF(uint256_t(1) << 14);
    static constexpr auto SHIFTx2 = FF(uint256_t(1) << (14 * 2));
    static constexpr auto SHIFTx3 = FF(uint256_t(1) << (14 * 3));
    static constexpr auto SHIFTx4 = FF(uint256_t(1) << (14 * 4));
    static constexpr auto SHIFTx5 = FF(uint256_t(1) << (14 * 5));
    static constexpr size_t LEN_1 = 3;  // range constrain sub-relation 1
    static constexpr size_t LEN_2 = 3;  // range constrain sub-relation 2
    static constexpr size_t LEN_3 = 3;  // range constrain sub-relation 3
    static constexpr size_t LEN_4 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_5 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_6 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_7 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_8 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_9 = 3;  // range constrain sub-relation 4
    static constexpr size_t LEN_10 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_11 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_12 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_13 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_14 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_15 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_16 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_17 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_18 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_19 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_20 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_21 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_22 = 3; // range constrain sub-relation 4
    // static constexpr size_t LEN_3 = 6;  // range constrain sub-relation 3
    // static constexpr size_t LEN_4 = 6;  // range constrain sub-relation 4
    // static constexpr size_t LEN_5 = 6;  // range constrain sub-relation 4
    // static constexpr size_t LEN_6 = 3;  // range constrain sub-relation 4
    // static constexpr size_t LEN_7 = 3;  // range constrain sub-relation 4
    // static constexpr size_t LEN_8 = 3;  // range constrain sub-relation 4
    // static constexpr size_t LEN_9 = 3;  // range constrain sub-relation 4
    // static constexpr size_t LEN_10 = 3; // range constrain sub-relation 4
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
                                                           LEN_12,
                                                           LEN_13,
                                                           LEN_14,
                                                           LEN_15,
                                                           LEN_16,
                                                           LEN_17,
                                                           LEN_18,
                                                           LEN_19,
                                                           LEN_20,
                                                           LEN_21,
                                                           LEN_22>;
    /**
     * @brief Expression for the generalized permutation sort gate.
     * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
     * 1) 2 sequential values are non-descending and have a difference of at most 3, except for the value at last
     index
     * 2) The value at last index is (1<<14)-1     * index

         * @param evals transformed to `evals + C(extended_edges(X)...)*scaling_factor`
     * @param extended_edges an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     *   @param scaling_factor optional term to scale the evaluation before adding to evals.
         */
    template <typename AccumulatorTypes>
    void static add_edge_contribution_impl(typename AccumulatorTypes::Accumulators& accumulators,
                                           const auto& extended_edges,
                                           const RelationParameters<FF>&,
                                           const FF& scaling_factor)
    {
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        {
            using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
            auto p_x_low_limbs = View(extended_edges.p_x_low_limbs);
            auto p_x_low_limbs_range_constraint_0 = View(extended_edges.p_x_low_limbs_range_constraint_0);
            auto p_x_low_limbs_range_constraint_1 = View(extended_edges.p_x_low_limbs_range_constraint_1);
            auto p_x_low_limbs_range_constraint_2 = View(extended_edges.p_x_low_limbs_range_constraint_2);
            auto p_x_low_limbs_range_constraint_3 = View(extended_edges.p_x_low_limbs_range_constraint_3);
            auto p_x_low_limbs_range_constraint_4 = View(extended_edges.p_x_low_limbs_range_constraint_4);
            auto p_x_low_limbs_shift = View(extended_edges.p_x_low_limbs_shift);
            auto p_x_low_limbs_range_constraint_0_shift = View(extended_edges.p_x_low_limbs_range_constraint_0_shift);
            auto p_x_low_limbs_range_constraint_1_shift = View(extended_edges.p_x_low_limbs_range_constraint_1_shift);
            auto p_x_low_limbs_range_constraint_2_shift = View(extended_edges.p_x_low_limbs_range_constraint_2_shift);
            auto p_x_low_limbs_range_constraint_3_shift = View(extended_edges.p_x_low_limbs_range_constraint_3_shift);
            auto p_x_low_limbs_range_constraint_4_shift = View(extended_edges.p_x_low_limbs_range_constraint_4_shift);
            auto p_x_high_limbs = View(extended_edges.p_x_high_limbs);
            auto p_x_high_limbs_range_constraint_0 = View(extended_edges.p_x_high_limbs_range_constraint_0);
            auto p_x_high_limbs_range_constraint_1 = View(extended_edges.p_x_high_limbs_range_constraint_1);
            auto p_x_high_limbs_range_constraint_2 = View(extended_edges.p_x_high_limbs_range_constraint_2);
            auto p_x_high_limbs_range_constraint_3 = View(extended_edges.p_x_high_limbs_range_constraint_3);
            auto p_x_high_limbs_range_constraint_4 = View(extended_edges.p_x_high_limbs_range_constraint_4);
            auto p_x_high_limbs_shift = View(extended_edges.p_x_high_limbs_shift);
            auto p_x_high_limbs_range_constraint_0_shift = View(extended_edges.p_x_high_limbs_range_constraint_0_shift);
            auto p_x_high_limbs_range_constraint_1_shift = View(extended_edges.p_x_high_limbs_range_constraint_1_shift);
            auto p_x_high_limbs_range_constraint_2_shift = View(extended_edges.p_x_high_limbs_range_constraint_2_shift);
            auto p_x_high_limbs_range_constraint_3_shift = View(extended_edges.p_x_high_limbs_range_constraint_3_shift);
            // View(extended_edges.p_x_low_limbs_range_constraint_tail);

            auto p_y_low_limbs = View(extended_edges.p_y_low_limbs);
            auto p_y_low_limbs_range_constraint_0 = View(extended_edges.p_y_low_limbs_range_constraint_0);
            auto p_y_low_limbs_range_constraint_1 = View(extended_edges.p_y_low_limbs_range_constraint_1);
            auto p_y_low_limbs_range_constraint_2 = View(extended_edges.p_y_low_limbs_range_constraint_2);
            auto p_y_low_limbs_range_constraint_3 = View(extended_edges.p_y_low_limbs_range_constraint_3);
            auto p_y_low_limbs_range_constraint_4 = View(extended_edges.p_y_low_limbs_range_constraint_4);
            auto p_y_low_limbs_shift = View(extended_edges.p_y_low_limbs_shift);
            auto p_y_low_limbs_range_constraint_0_shift = View(extended_edges.p_y_low_limbs_range_constraint_0_shift);
            auto p_y_low_limbs_range_constraint_1_shift = View(extended_edges.p_y_low_limbs_range_constraint_1_shift);
            auto p_y_low_limbs_range_constraint_2_shift = View(extended_edges.p_y_low_limbs_range_constraint_2_shift);
            auto p_y_low_limbs_range_constraint_3_shift = View(extended_edges.p_y_low_limbs_range_constraint_3_shift);
            auto p_y_low_limbs_range_constraint_4_shift = View(extended_edges.p_y_low_limbs_range_constraint_4_shift);
            auto p_y_high_limbs = View(extended_edges.p_y_high_limbs);
            auto p_y_high_limbs_range_constraint_0 = View(extended_edges.p_y_high_limbs_range_constraint_0);
            auto p_y_high_limbs_range_constraint_1 = View(extended_edges.p_y_high_limbs_range_constraint_1);
            auto p_y_high_limbs_range_constraint_2 = View(extended_edges.p_y_high_limbs_range_constraint_2);
            auto p_y_high_limbs_range_constraint_3 = View(extended_edges.p_y_high_limbs_range_constraint_3);
            auto p_y_high_limbs_range_constraint_4 = View(extended_edges.p_y_high_limbs_range_constraint_4);
            auto p_y_high_limbs_shift = View(extended_edges.p_y_high_limbs_shift);
            auto p_y_high_limbs_range_constraint_0_shift = View(extended_edges.p_y_high_limbs_range_constraint_0_shift);
            auto p_y_high_limbs_range_constraint_1_shift = View(extended_edges.p_y_high_limbs_range_constraint_1_shift);
            auto p_y_high_limbs_range_constraint_2_shift = View(extended_edges.p_y_high_limbs_range_constraint_2_shift);
            auto p_y_high_limbs_range_constraint_3_shift = View(extended_edges.p_y_high_limbs_range_constraint_3_shift);
            // auto p_y_high_limbs_range_constraint_4_shift =
            // View(extended_edges.p_y_high_limbs_range_constraint_4_shift); auto p_y_low_limbs_range_constraint_tail =

            auto z_lo_limbs = View(extended_edges.z_lo_limbs);
            auto z_lo_limbs_range_constraint_0 = View(extended_edges.z_lo_limbs_range_constraint_0);
            auto z_lo_limbs_range_constraint_1 = View(extended_edges.z_lo_limbs_range_constraint_1);
            auto z_lo_limbs_range_constraint_2 = View(extended_edges.z_lo_limbs_range_constraint_2);
            auto z_lo_limbs_range_constraint_3 = View(extended_edges.z_lo_limbs_range_constraint_3);
            auto z_lo_limbs_range_constraint_4 = View(extended_edges.z_lo_limbs_range_constraint_4);
            auto z_lo_limbs_shift = View(extended_edges.z_lo_limbs_shift);
            auto z_lo_limbs_range_constraint_0_shift = View(extended_edges.z_lo_limbs_range_constraint_0_shift);
            auto z_lo_limbs_range_constraint_1_shift = View(extended_edges.z_lo_limbs_range_constraint_1_shift);
            auto z_lo_limbs_range_constraint_2_shift = View(extended_edges.z_lo_limbs_range_constraint_2_shift);
            auto z_lo_limbs_range_constraint_3_shift = View(extended_edges.z_lo_limbs_range_constraint_3_shift);
            auto z_lo_limbs_range_constraint_4_shift = View(extended_edges.z_lo_limbs_range_constraint_4_shift);

            auto z_hi_limbs = View(extended_edges.z_hi_limbs);
            auto z_hi_limbs_range_constraint_0 = View(extended_edges.z_hi_limbs_range_constraint_0);
            auto z_hi_limbs_range_constraint_1 = View(extended_edges.z_hi_limbs_range_constraint_1);
            auto z_hi_limbs_range_constraint_2 = View(extended_edges.z_hi_limbs_range_constraint_2);
            auto z_hi_limbs_range_constraint_3 = View(extended_edges.z_hi_limbs_range_constraint_3);
            auto z_hi_limbs_range_constraint_4 = View(extended_edges.z_hi_limbs_range_constraint_4);
            auto z_hi_limbs_shift = View(extended_edges.z_hi_limbs_shift);
            auto z_hi_limbs_range_constraint_0_shift = View(extended_edges.z_hi_limbs_range_constraint_0_shift);
            auto z_hi_limbs_range_constraint_1_shift = View(extended_edges.z_hi_limbs_range_constraint_1_shift);
            auto z_hi_limbs_range_constraint_2_shift = View(extended_edges.z_hi_limbs_range_constraint_2_shift);
            auto z_hi_limbs_range_constraint_3_shift = View(extended_edges.z_hi_limbs_range_constraint_3_shift);
            auto z_hi_limbs_range_constraint_4_shift = View(extended_edges.z_hi_limbs_range_constraint_4_shift);

            auto accumulators_binary_limbs_0 = View(extended_edges.accumulators_binary_limbs_0);
            auto accumulators_binary_limbs_1 = View(extended_edges.accumulators_binary_limbs_1);
            auto accumulators_binary_limbs_2 = View(extended_edges.accumulators_binary_limbs_2);
            auto accumulators_binary_limbs_3 = View(extended_edges.accumulators_binary_limbs_3);
            auto accumulator_lo_limbs_range_constraint_0 = View(extended_edges.accumulator_lo_limbs_range_constraint_0);
            auto accumulator_lo_limbs_range_constraint_1 = View(extended_edges.accumulator_lo_limbs_range_constraint_1);
            auto accumulator_lo_limbs_range_constraint_2 = View(extended_edges.accumulator_lo_limbs_range_constraint_2);
            auto accumulator_lo_limbs_range_constraint_3 = View(extended_edges.accumulator_lo_limbs_range_constraint_3);
            auto accumulator_lo_limbs_range_constraint_4 = View(extended_edges.accumulator_lo_limbs_range_constraint_4);
            auto accumulator_lo_limbs_range_constraint_0_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_0_shift);
            auto accumulator_lo_limbs_range_constraint_1_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_1_shift);
            auto accumulator_lo_limbs_range_constraint_2_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_2_shift);
            auto accumulator_lo_limbs_range_constraint_3_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_3_shift);
            auto accumulator_lo_limbs_range_constraint_4_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_4_shift);

            auto accumulator_hi_limbs_range_constraint_0 = View(extended_edges.accumulator_hi_limbs_range_constraint_0);
            auto accumulator_hi_limbs_range_constraint_1 = View(extended_edges.accumulator_hi_limbs_range_constraint_1);
            auto accumulator_hi_limbs_range_constraint_2 = View(extended_edges.accumulator_hi_limbs_range_constraint_2);
            auto accumulator_hi_limbs_range_constraint_3 = View(extended_edges.accumulator_hi_limbs_range_constraint_3);
            auto accumulator_hi_limbs_range_constraint_4 = View(extended_edges.accumulator_hi_limbs_range_constraint_4);
            auto accumulator_hi_limbs_range_constraint_0_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_0_shift);
            auto accumulator_hi_limbs_range_constraint_1_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_1_shift);
            auto accumulator_hi_limbs_range_constraint_2_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_2_shift);
            auto accumulator_hi_limbs_range_constraint_3_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_3_shift);
            auto accumulator_hi_limbs_range_constraint_4_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_4_shift);

            auto quotient_lo_binary_limbs = View(extended_edges.quotient_lo_binary_limbs);
            auto quotient_lo_limbs_range_constraint_0 = View(extended_edges.quotient_lo_limbs_range_constraint_0);
            auto quotient_lo_limbs_range_constraint_1 = View(extended_edges.quotient_lo_limbs_range_constraint_1);
            auto quotient_lo_limbs_range_constraint_2 = View(extended_edges.quotient_lo_limbs_range_constraint_2);
            auto quotient_lo_limbs_range_constraint_3 = View(extended_edges.quotient_lo_limbs_range_constraint_3);
            auto quotient_lo_limbs_range_constraint_4 = View(extended_edges.quotient_lo_limbs_range_constraint_4);

            auto quotient_lo_binary_limbs_shift = View(extended_edges.quotient_lo_binary_limbs_shift);
            auto quotient_lo_limbs_range_constraint_0_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_0_shift);
            auto quotient_lo_limbs_range_constraint_1_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_1_shift);
            auto quotient_lo_limbs_range_constraint_2_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_2_shift);
            auto quotient_lo_limbs_range_constraint_3_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_3_shift);
            auto quotient_lo_limbs_range_constraint_4_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_4_shift);

            auto quotient_hi_binary_limbs = View(extended_edges.quotient_hi_binary_limbs);
            auto quotient_hi_limbs_range_constraint_0 = View(extended_edges.quotient_hi_limbs_range_constraint_0);
            auto quotient_hi_limbs_range_constraint_1 = View(extended_edges.quotient_hi_limbs_range_constraint_1);
            auto quotient_hi_limbs_range_constraint_2 = View(extended_edges.quotient_hi_limbs_range_constraint_2);
            auto quotient_hi_limbs_range_constraint_3 = View(extended_edges.quotient_hi_limbs_range_constraint_3);
            auto quotient_hi_limbs_range_constraint_4 = View(extended_edges.quotient_hi_limbs_range_constraint_4);

            auto quotient_hi_binary_limbs_shift = View(extended_edges.quotient_hi_binary_limbs_shift);
            auto quotient_hi_limbs_range_constraint_0_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_0_shift);
            auto quotient_hi_limbs_range_constraint_1_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_1_shift);
            auto quotient_hi_limbs_range_constraint_2_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_2_shift);
            auto quotient_hi_limbs_range_constraint_3_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_3_shift);
            auto quotient_hi_limbs_range_constraint_4_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_4_shift);

            auto relation_wide_limbs = View(extended_edges.relation_wide_limbs);
            auto relation_wide_limbs_range_constraint_0 = View(extended_edges.relation_wide_limbs_range_constraint_0);
            auto relation_wide_limbs_range_constraint_1 = View(extended_edges.relation_wide_limbs_range_constraint_1);
            auto relation_wide_limbs_range_constraint_2 = View(extended_edges.relation_wide_limbs_range_constraint_2);
            auto relation_wide_limbs_range_constraint_3 = View(extended_edges.relation_wide_limbs_range_constraint_3);

            auto p_x_high_limbs_range_constraint_tail_shift =
                View(extended_edges.p_x_high_limbs_range_constraint_tail_shift);

            auto accumulator_hi_limbs_range_constraint_tail_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_tail_shift);

            auto relation_wide_limbs_shift = View(extended_edges.relation_wide_limbs_shift);
            auto relation_wide_limbs_range_constraint_0_shift =
                View(extended_edges.relation_wide_limbs_range_constraint_0_shift);
            auto relation_wide_limbs_range_constraint_1_shift =
                View(extended_edges.relation_wide_limbs_range_constraint_1_shift);
            auto relation_wide_limbs_range_constraint_2_shift =
                View(extended_edges.relation_wide_limbs_range_constraint_2_shift);
            auto relation_wide_limbs_range_constraint_3_shift =
                View(extended_edges.relation_wide_limbs_range_constraint_3_shift);

            auto p_y_high_limbs_range_constraint_tail_shift =
                View(extended_edges.p_y_high_limbs_range_constraint_tail_shift);

            auto quotient_hi_limbs_range_constraint_tail_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_tail_shift);

            auto lagrange_odd = View(extended_edges.lagrange_odd);

            // Contributions that decompose 68 or 72 bit limbs used for computation into range-constrained chunks
            // Contribution 1 , P_x lowest limb decomposition
            auto tmp_1 = ((p_x_low_limbs_range_constraint_0 + p_x_low_limbs_range_constraint_1 * SHIFT +
                           p_x_low_limbs_range_constraint_2 * SHIFTx2 + p_x_low_limbs_range_constraint_3 * SHIFTx3 +
                           p_x_low_limbs_range_constraint_4 * SHIFTx4) -
                          p_x_low_limbs);
            tmp_1 *= lagrange_odd;
            tmp_1 *= scaling_factor;
            std::get<0>(accumulators) += tmp_1;

            // Contribution 2 , P_x second lowest limb decomposition
            auto tmp_2 =
                ((p_x_low_limbs_range_constraint_0_shift + p_x_low_limbs_range_constraint_1_shift * SHIFT +
                  p_x_low_limbs_range_constraint_2_shift * SHIFTx2 + p_x_low_limbs_range_constraint_3_shift * SHIFTx3 +
                  p_x_low_limbs_range_constraint_4_shift * SHIFTx4) -
                 p_x_low_limbs_shift);
            tmp_2 *= lagrange_odd;
            tmp_2 *= scaling_factor;
            std::get<1>(accumulators) += tmp_2;

            // Contribution 3 , P_x third limb decomposition
            auto tmp_3 = ((p_x_high_limbs_range_constraint_0 + p_x_high_limbs_range_constraint_1 * SHIFT +
                           p_x_high_limbs_range_constraint_2 * SHIFTx2 + p_x_high_limbs_range_constraint_3 * SHIFTx3 +
                           p_x_high_limbs_range_constraint_4 * SHIFTx4) -
                          p_x_high_limbs);
            tmp_3 *= lagrange_odd;
            tmp_3 *= scaling_factor;
            std::get<2>(accumulators) += tmp_3;

            // Contribution 4 , P_x highest limb decomposition
            auto tmp_4 = ((p_x_high_limbs_range_constraint_0_shift + p_x_high_limbs_range_constraint_1_shift * SHIFT +
                           p_x_high_limbs_range_constraint_2_shift * SHIFTx2 +
                           p_x_high_limbs_range_constraint_3_shift * SHIFTx3) -
                          p_x_high_limbs_shift);
            tmp_4 *= lagrange_odd;
            tmp_4 *= scaling_factor;
            std::get<3>(accumulators) += tmp_4;

            // Contribution 5 , P_y lowest limb decomposition
            auto tmp_5 = ((p_y_low_limbs_range_constraint_0 + p_y_low_limbs_range_constraint_1 * SHIFT +
                           p_y_low_limbs_range_constraint_2 * SHIFTx2 + p_y_low_limbs_range_constraint_3 * SHIFTx3 +
                           p_y_low_limbs_range_constraint_4 * SHIFTx4) -
                          p_y_low_limbs);
            tmp_5 *= lagrange_odd;
            tmp_5 *= scaling_factor;
            std::get<4>(accumulators) += tmp_5;

            // Contribution 6 , P_y second lowest limb decomposition
            auto tmp_6 =
                ((p_y_low_limbs_range_constraint_0_shift + p_y_low_limbs_range_constraint_1_shift * SHIFT +
                  p_y_low_limbs_range_constraint_2_shift * SHIFTx2 + p_y_low_limbs_range_constraint_3_shift * SHIFTx3 +
                  p_y_low_limbs_range_constraint_4_shift * SHIFTx4) -
                 p_y_low_limbs_shift);
            tmp_6 *= lagrange_odd;
            tmp_6 *= scaling_factor;
            std::get<5>(accumulators) += tmp_6;

            // Contribution 7 , P_y third limb decomposition
            auto tmp_7 = ((p_y_high_limbs_range_constraint_0 + p_y_high_limbs_range_constraint_1 * SHIFT +
                           p_y_high_limbs_range_constraint_2 * SHIFTx2 + p_y_high_limbs_range_constraint_3 * SHIFTx3 +
                           p_y_high_limbs_range_constraint_4 * SHIFTx4) -
                          p_y_high_limbs);
            tmp_7 *= lagrange_odd;
            tmp_7 *= scaling_factor;
            std::get<6>(accumulators) += tmp_7;

            // Contribution 8 , P_y highest limb decomposition
            auto tmp_8 = ((p_y_high_limbs_range_constraint_0_shift + p_y_high_limbs_range_constraint_1_shift * SHIFT +
                           p_y_high_limbs_range_constraint_2_shift * SHIFTx2 +
                           p_y_high_limbs_range_constraint_3_shift * SHIFTx3) -
                          p_y_high_limbs_shift);
            tmp_8 *= lagrange_odd;
            tmp_8 *= scaling_factor;
            std::get<7>(accumulators) += tmp_8;

            // Contribution 9 , z_1 low limb decomposition
            auto tmp_9 = ((z_lo_limbs_range_constraint_0 + z_lo_limbs_range_constraint_1 * SHIFT +
                           z_lo_limbs_range_constraint_2 * SHIFTx2 + z_lo_limbs_range_constraint_3 * SHIFTx3 +
                           z_lo_limbs_range_constraint_4 * SHIFTx4) -
                          z_lo_limbs);
            tmp_9 *= lagrange_odd;
            tmp_9 *= scaling_factor;
            std::get<8>(accumulators) += tmp_9;

            // Contribution 10 , z_2 low limb decomposition
            auto tmp_10 =
                ((z_lo_limbs_range_constraint_0_shift + z_lo_limbs_range_constraint_1_shift * SHIFT +
                  z_lo_limbs_range_constraint_2_shift * SHIFTx2 + z_lo_limbs_range_constraint_3_shift * SHIFTx3 +
                  z_lo_limbs_range_constraint_4_shift * SHIFTx4) -
                 z_lo_limbs_shift);
            tmp_10 *= lagrange_odd;
            tmp_10 *= scaling_factor;
            std::get<9>(accumulators) += tmp_10;

            // Contribution 11 , z_1 high limb decomposition
            auto tmp_11 = ((z_hi_limbs_range_constraint_0 + z_hi_limbs_range_constraint_1 * SHIFT +
                            z_hi_limbs_range_constraint_2 * SHIFTx2 + z_hi_limbs_range_constraint_3 * SHIFTx3 +
                            z_hi_limbs_range_constraint_4 * SHIFTx4) -
                           z_hi_limbs);
            tmp_11 *= lagrange_odd;
            tmp_11 *= scaling_factor;
            std::get<10>(accumulators) += tmp_11;

            // Contribution 12 , z_2 high limb decomposition
            auto tmp_12 =
                ((z_hi_limbs_range_constraint_0_shift + z_hi_limbs_range_constraint_1_shift * SHIFT +
                  z_hi_limbs_range_constraint_2_shift * SHIFTx2 + z_hi_limbs_range_constraint_3_shift * SHIFTx3 +
                  z_hi_limbs_range_constraint_4_shift * SHIFTx4) -
                 z_hi_limbs_shift);
            tmp_12 *= lagrange_odd;
            tmp_12 *= scaling_factor;
            std::get<11>(accumulators) += tmp_12;

            // Contribution 13 , accumulator lowest limb decomposition
            auto tmp_13 = ((accumulator_lo_limbs_range_constraint_0 + accumulator_lo_limbs_range_constraint_1 * SHIFT +
                            accumulator_lo_limbs_range_constraint_2 * SHIFTx2 +
                            accumulator_lo_limbs_range_constraint_3 * SHIFTx3 +
                            accumulator_lo_limbs_range_constraint_4 * SHIFTx4) -
                           accumulators_binary_limbs_0);
            tmp_13 *= lagrange_odd;
            tmp_13 *= scaling_factor;
            std::get<12>(accumulators) += tmp_13;
            // Contribution 14 , accumulator second limb decomposition
            auto tmp_14 = ((accumulator_lo_limbs_range_constraint_0_shift +
                            accumulator_lo_limbs_range_constraint_1_shift * SHIFT +
                            accumulator_lo_limbs_range_constraint_2_shift * SHIFTx2 +
                            accumulator_lo_limbs_range_constraint_3_shift * SHIFTx3 +
                            accumulator_lo_limbs_range_constraint_4_shift * SHIFTx4) -
                           accumulators_binary_limbs_1);
            tmp_14 *= lagrange_odd;
            tmp_14 *= scaling_factor;
            std::get<13>(accumulators) += tmp_14;

            // Contribution 15 , accumulator second highest limb decomposition
            auto tmp_15 = ((accumulator_hi_limbs_range_constraint_0 + accumulator_hi_limbs_range_constraint_1 * SHIFT +
                            accumulator_hi_limbs_range_constraint_2 * SHIFTx2 +
                            accumulator_hi_limbs_range_constraint_3 * SHIFTx3 +
                            accumulator_hi_limbs_range_constraint_4 * SHIFTx4) -
                           accumulators_binary_limbs_2);
            tmp_15 *= lagrange_odd;
            tmp_15 *= scaling_factor;
            std::get<14>(accumulators) += tmp_15;
            // Contribution 16 , accumulator highest limb decomposition
            auto tmp_16 = ((accumulator_hi_limbs_range_constraint_0_shift +
                            accumulator_hi_limbs_range_constraint_1_shift * SHIFT +
                            accumulator_hi_limbs_range_constraint_2_shift * SHIFTx2 +
                            accumulator_hi_limbs_range_constraint_3_shift * SHIFTx3 +
                            accumulator_hi_limbs_range_constraint_4_shift * SHIFTx4) -
                           accumulators_binary_limbs_3);
            tmp_16 *= lagrange_odd;
            tmp_16 *= scaling_factor;
            std::get<15>(accumulators) += tmp_16;

            // Contribution 15 , quotient lowest limb decomposition
            auto tmp_17 =
                ((quotient_lo_limbs_range_constraint_0 + quotient_lo_limbs_range_constraint_1 * SHIFT +
                  quotient_lo_limbs_range_constraint_2 * SHIFTx2 + quotient_lo_limbs_range_constraint_3 * SHIFTx3 +
                  quotient_lo_limbs_range_constraint_4 * SHIFTx4) -
                 quotient_lo_binary_limbs);
            tmp_17 *= lagrange_odd;
            tmp_17 *= scaling_factor;
            std::get<16>(accumulators) += tmp_17;
            // Contribution 16 , quotient second lowest limb decomposition
            auto tmp_18 =
                ((quotient_lo_limbs_range_constraint_0_shift + quotient_lo_limbs_range_constraint_1_shift * SHIFT +
                  quotient_lo_limbs_range_constraint_2_shift * SHIFTx2 +
                  quotient_lo_limbs_range_constraint_3_shift * SHIFTx3 +
                  quotient_lo_limbs_range_constraint_4_shift * SHIFTx4) -
                 quotient_lo_binary_limbs_shift);
            tmp_18 *= lagrange_odd;
            tmp_18 *= scaling_factor;
            std::get<17>(accumulators) += tmp_18;

            // Contribution 19 , quotient second highest limb decomposition
            auto tmp_19 =
                ((quotient_hi_limbs_range_constraint_0 + quotient_hi_limbs_range_constraint_1 * SHIFT +
                  quotient_hi_limbs_range_constraint_2 * SHIFTx2 + quotient_hi_limbs_range_constraint_3 * SHIFTx3 +
                  quotient_hi_limbs_range_constraint_4 * SHIFTx4) -
                 quotient_hi_binary_limbs);
            tmp_19 *= lagrange_odd;
            tmp_19 *= scaling_factor;
            std::get<18>(accumulators) += tmp_19;
            // Contribution 20 , quotient highest limb decomposition
            auto tmp_20 =
                ((quotient_hi_limbs_range_constraint_0_shift + quotient_hi_limbs_range_constraint_1_shift * SHIFT +
                  quotient_hi_limbs_range_constraint_2_shift * SHIFTx2 +
                  quotient_hi_limbs_range_constraint_3_shift * SHIFTx3 +
                  quotient_hi_limbs_range_constraint_4_shift * SHIFTx4) -
                 quotient_hi_binary_limbs_shift);
            tmp_20 *= lagrange_odd;
            tmp_20 *= scaling_factor;
            std::get<19>(accumulators) += tmp_20;

            // Contribution 21 , quotient highest limb decomposition
            auto tmp_21 =
                ((relation_wide_limbs_range_constraint_0 + relation_wide_limbs_range_constraint_1 * SHIFT +
                  relation_wide_limbs_range_constraint_2 * SHIFTx2 + relation_wide_limbs_range_constraint_3 * SHIFTx3 +
                  p_x_high_limbs_range_constraint_tail_shift * SHIFTx4 +
                  accumulator_hi_limbs_range_constraint_tail_shift * SHIFTx5) -
                 relation_wide_limbs);
            tmp_21 *= lagrange_odd;
            tmp_21 *= scaling_factor;
            std::get<20>(accumulators) += tmp_21;

            // Contribution 22 , quotient highest limb decomposition
            auto tmp_22 =
                ((relation_wide_limbs_range_constraint_0_shift + relation_wide_limbs_range_constraint_1_shift * SHIFT +
                  relation_wide_limbs_range_constraint_2_shift * SHIFTx2 +
                  relation_wide_limbs_range_constraint_3_shift * SHIFTx3 +
                  p_y_high_limbs_range_constraint_tail_shift * SHIFTx4 +
                  quotient_hi_limbs_range_constraint_tail_shift * SHIFTx5) -
                 relation_wide_limbs_shift);
            tmp_22 *= lagrange_odd;
            tmp_22 *= scaling_factor;
            std::get<21>(accumulators) += tmp_22;

        }; // namespace proof_system::honk::sumcheck
    };
};
template <typename FF>
using GoblinTranslatorDecompositionRelation = RelationWrapper<FF, GoblinTranslatorDecompositionRelationBase>;

} // namespace proof_system::honk::sumcheck

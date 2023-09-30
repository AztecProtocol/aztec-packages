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
    static constexpr auto LIMB_SHIFT = FF(uint256_t(1) << 68);
    static constexpr auto LIMB_SHIFTx2 = LIMB_SHIFT * LIMB_SHIFT;
    static constexpr auto LIMB_SHIFTx3 = LIMB_SHIFTx2 * LIMB_SHIFT;
    static constexpr auto MICRO_LIMB_SHIFT = FF(uint256_t(1) << 14);
    static constexpr auto MICRO_LIMB_SHIFTx2 = MICRO_LIMB_SHIFT * MICRO_LIMB_SHIFT;
    static constexpr auto MICRO_LIMB_SHIFTx3 = MICRO_LIMB_SHIFTx2 * MICRO_LIMB_SHIFT;
    static constexpr auto MICRO_LIMB_SHIFTx4 = MICRO_LIMB_SHIFTx3 * MICRO_LIMB_SHIFT;
    static constexpr auto MICRO_LIMB_SHIFTx5 = MICRO_LIMB_SHIFTx4 * MICRO_LIMB_SHIFT;
    static constexpr auto SHIFT_12_TO_14 = FF(4);
    static constexpr auto SHIFT_10_TO_14 = FF(16);
    static constexpr auto SHIFT_8_TO_14 = FF(64);
    static constexpr auto SHIFT_4_TO_14 = FF(1024);
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
    static constexpr size_t LEN_23 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_24 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_25 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_26 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_27 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_28 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_29 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_30 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_31 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_32 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_33 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_34 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_35 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_36 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_37 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_38 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_39 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_40 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_41 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_42 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_43 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_44 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_45 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_46 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_47 = 3; // range constrain sub-relation 4
    static constexpr size_t LEN_48 = 3; // range constrain sub-relation 4

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
                                                           LEN_22,
                                                           LEN_23,
                                                           LEN_24,
                                                           LEN_25,
                                                           LEN_26,
                                                           LEN_27,
                                                           LEN_28,
                                                           LEN_29,
                                                           LEN_30,
                                                           LEN_31,
                                                           LEN_32,
                                                           LEN_33,
                                                           LEN_34,
                                                           LEN_35,
                                                           LEN_36,
                                                           LEN_37,
                                                           LEN_38,
                                                           LEN_39,
                                                           LEN_40,
                                                           LEN_41,
                                                           LEN_42,
                                                           LEN_43,
                                                           LEN_44,
                                                           LEN_45,
                                                           LEN_46,
                                                           LEN_47,
                                                           LEN_48>;
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
            // auto accumulator_hi_limbs_range_constraint_4_shift =
            //     View(extended_edges.accumulator_hi_limbs_range_constraint_4_shift);

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
            // auto quotient_hi_limbs_range_constraint_4_shift =
            //     View(extended_edges.quotient_hi_limbs_range_constraint_4_shift);

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

            auto p_x_low_limbs_range_constraint_tail = View(extended_edges.p_x_low_limbs_range_constraint_tail);
            auto p_x_low_limbs_range_constraint_tail_shift =
                View(extended_edges.p_x_low_limbs_range_constraint_tail_shift);
            auto p_x_high_limbs_range_constraint_tail = View(extended_edges.p_x_high_limbs_range_constraint_tail);
            auto p_x_high_limbs_range_constraint_4_shift = View(extended_edges.p_x_high_limbs_range_constraint_4_shift);

            auto p_y_low_limbs_range_constraint_tail = View(extended_edges.p_y_low_limbs_range_constraint_tail);
            auto p_y_low_limbs_range_constraint_tail_shift =
                View(extended_edges.p_y_low_limbs_range_constraint_tail_shift);
            auto p_y_high_limbs_range_constraint_tail = View(extended_edges.p_y_high_limbs_range_constraint_tail);
            auto p_y_high_limbs_range_constraint_4_shift = View(extended_edges.p_y_high_limbs_range_constraint_4_shift);

            auto z_lo_limbs_range_constraint_tail = View(extended_edges.z_lo_limbs_range_constraint_tail);
            auto z_lo_limbs_range_constraint_tail_shift = View(extended_edges.z_lo_limbs_range_constraint_tail_shift);
            auto z_hi_limbs_range_constraint_tail = View(extended_edges.z_hi_limbs_range_constraint_tail);
            auto z_hi_limbs_range_constraint_tail_shift = View(extended_edges.z_hi_limbs_range_constraint_tail_shift);

            auto accumulator_lo_limbs_range_constraint_tail =
                View(extended_edges.accumulator_lo_limbs_range_constraint_tail);
            auto accumulator_lo_limbs_range_constraint_tail_shift =
                View(extended_edges.accumulator_lo_limbs_range_constraint_tail_shift);
            auto accumulator_hi_limbs_range_constraint_tail =
                View(extended_edges.accumulator_hi_limbs_range_constraint_tail);
            auto accumulator_hi_limbs_range_constraint_4_shift =
                View(extended_edges.accumulator_hi_limbs_range_constraint_4_shift);

            auto quotient_lo_limbs_range_constraint_tail = View(extended_edges.quotient_lo_limbs_range_constraint_tail);
            auto quotient_lo_limbs_range_constraint_tail_shift =
                View(extended_edges.quotient_lo_limbs_range_constraint_tail_shift);
            auto quotient_hi_limbs_range_constraint_tail = View(extended_edges.quotient_hi_limbs_range_constraint_tail);
            auto quotient_hi_limbs_range_constraint_4_shift =
                View(extended_edges.quotient_hi_limbs_range_constraint_4_shift);

            auto x_lo_y_hi = View(extended_edges.x_lo_y_hi);
            auto x_hi_z_1 = View(extended_edges.x_hi_z_1);
            auto y_lo_z_2 = View(extended_edges.y_lo_z_2);

            auto x_lo_y_hi_shift = View(extended_edges.x_lo_y_hi_shift);
            auto x_hi_z_1_shift = View(extended_edges.x_hi_z_1_shift);
            auto y_lo_z_2_shift = View(extended_edges.y_lo_z_2_shift);
            auto lagrange_odd = View(extended_edges.lagrange_odd);

            // Contributions that decompose 68 or 72 bit limbs used for computation into range-constrained chunks
            // Contribution 1 , P_x lowest limb decomposition
            auto tmp_1 = ((p_x_low_limbs_range_constraint_0 + p_x_low_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                           p_x_low_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                           p_x_low_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                           p_x_low_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                          p_x_low_limbs);
            tmp_1 *= lagrange_odd;
            tmp_1 *= scaling_factor;
            std::get<0>(accumulators) += tmp_1;

            // Contribution 2 , P_x second lowest limb decomposition
            auto tmp_2 =
                ((p_x_low_limbs_range_constraint_0_shift + p_x_low_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  p_x_low_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  p_x_low_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                  p_x_low_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                 p_x_low_limbs_shift);
            tmp_2 *= lagrange_odd;
            tmp_2 *= scaling_factor;
            std::get<1>(accumulators) += tmp_2;

            // Contribution 3 , P_x third limb decomposition
            auto tmp_3 = ((p_x_high_limbs_range_constraint_0 + p_x_high_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                           p_x_high_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                           p_x_high_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                           p_x_high_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                          p_x_high_limbs);
            tmp_3 *= lagrange_odd;
            tmp_3 *= scaling_factor;
            std::get<2>(accumulators) += tmp_3;

            // Contribution 4 , P_x highest limb decomposition
            auto tmp_4 =
                ((p_x_high_limbs_range_constraint_0_shift + p_x_high_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  p_x_high_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  p_x_high_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3) -
                 p_x_high_limbs_shift);
            tmp_4 *= lagrange_odd;
            tmp_4 *= scaling_factor;
            std::get<3>(accumulators) += tmp_4;

            // Contribution 5 , P_y lowest limb decomposition
            auto tmp_5 = ((p_y_low_limbs_range_constraint_0 + p_y_low_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                           p_y_low_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                           p_y_low_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                           p_y_low_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                          p_y_low_limbs);
            tmp_5 *= lagrange_odd;
            tmp_5 *= scaling_factor;
            std::get<4>(accumulators) += tmp_5;

            // Contribution 6 , P_y second lowest limb decomposition
            auto tmp_6 =
                ((p_y_low_limbs_range_constraint_0_shift + p_y_low_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  p_y_low_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  p_y_low_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                  p_y_low_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                 p_y_low_limbs_shift);
            tmp_6 *= lagrange_odd;
            tmp_6 *= scaling_factor;
            std::get<5>(accumulators) += tmp_6;

            // Contribution 7 , P_y third limb decomposition
            auto tmp_7 = ((p_y_high_limbs_range_constraint_0 + p_y_high_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                           p_y_high_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                           p_y_high_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                           p_y_high_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                          p_y_high_limbs);
            tmp_7 *= lagrange_odd;
            tmp_7 *= scaling_factor;
            std::get<6>(accumulators) += tmp_7;

            // Contribution 8 , P_y highest limb decomposition
            auto tmp_8 =
                ((p_y_high_limbs_range_constraint_0_shift + p_y_high_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  p_y_high_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  p_y_high_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3) -
                 p_y_high_limbs_shift);
            tmp_8 *= lagrange_odd;
            tmp_8 *= scaling_factor;
            std::get<7>(accumulators) += tmp_8;

            // Contribution 9 , z_1 low limb decomposition
            auto tmp_9 = ((z_lo_limbs_range_constraint_0 + z_lo_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                           z_lo_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                           z_lo_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                           z_lo_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                          z_lo_limbs);
            tmp_9 *= lagrange_odd;
            tmp_9 *= scaling_factor;
            std::get<8>(accumulators) += tmp_9;

            // Contribution 10 , z_2 low limb decomposition
            auto tmp_10 =
                ((z_lo_limbs_range_constraint_0_shift + z_lo_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  z_lo_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  z_lo_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                  z_lo_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                 z_lo_limbs_shift);
            tmp_10 *= lagrange_odd;
            tmp_10 *= scaling_factor;
            std::get<9>(accumulators) += tmp_10;

            // Contribution 11 , z_1 high limb decomposition
            auto tmp_11 = ((z_hi_limbs_range_constraint_0 + z_hi_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                            z_hi_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                            z_hi_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                            z_hi_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                           z_hi_limbs);
            tmp_11 *= lagrange_odd;
            tmp_11 *= scaling_factor;
            std::get<10>(accumulators) += tmp_11;

            // Contribution 12 , z_2 high limb decomposition
            auto tmp_12 =
                ((z_hi_limbs_range_constraint_0_shift + z_hi_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                  z_hi_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                  z_hi_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                  z_hi_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                 z_hi_limbs_shift);
            tmp_12 *= lagrange_odd;
            tmp_12 *= scaling_factor;
            std::get<11>(accumulators) += tmp_12;

            // Contribution 13 , accumulator lowest limb decomposition
            auto tmp_13 =
                ((accumulator_lo_limbs_range_constraint_0 + accumulator_lo_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                  accumulator_lo_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                  accumulator_lo_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                  accumulator_lo_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                 accumulators_binary_limbs_0);
            tmp_13 *= lagrange_odd;
            tmp_13 *= scaling_factor;
            std::get<12>(accumulators) += tmp_13;
            // Contribution 14 , accumulator second limb decomposition
            auto tmp_14 = ((accumulator_lo_limbs_range_constraint_0_shift +
                            accumulator_lo_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                            accumulator_lo_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                            accumulator_lo_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                            accumulator_lo_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                           accumulators_binary_limbs_1);
            tmp_14 *= lagrange_odd;
            tmp_14 *= scaling_factor;
            std::get<13>(accumulators) += tmp_14;

            // Contribution 15 , accumulator second highest limb decomposition
            auto tmp_15 =
                ((accumulator_hi_limbs_range_constraint_0 + accumulator_hi_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                  accumulator_hi_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                  accumulator_hi_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                  accumulator_hi_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                 accumulators_binary_limbs_2);
            tmp_15 *= lagrange_odd;
            tmp_15 *= scaling_factor;
            std::get<14>(accumulators) += tmp_15;
            // Contribution 16 , accumulator highest limb decomposition
            auto tmp_16 = ((accumulator_hi_limbs_range_constraint_0_shift +
                            accumulator_hi_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                            accumulator_hi_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                            accumulator_hi_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3) -
                           accumulators_binary_limbs_3);
            tmp_16 *= lagrange_odd;
            tmp_16 *= scaling_factor;
            std::get<15>(accumulators) += tmp_16;

            // Contribution 15 , quotient lowest limb decomposition
            auto tmp_17 =
                ((quotient_lo_limbs_range_constraint_0 + quotient_lo_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                  quotient_lo_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                  quotient_lo_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                  quotient_lo_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                 quotient_lo_binary_limbs);
            tmp_17 *= lagrange_odd;
            tmp_17 *= scaling_factor;
            std::get<16>(accumulators) += tmp_17;
            // Contribution 16 , quotient second lowest limb decomposition
            auto tmp_18 = ((quotient_lo_limbs_range_constraint_0_shift +
                            quotient_lo_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                            quotient_lo_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                            quotient_lo_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                            quotient_lo_limbs_range_constraint_4_shift * MICRO_LIMB_SHIFTx4) -
                           quotient_lo_binary_limbs_shift);
            tmp_18 *= lagrange_odd;
            tmp_18 *= scaling_factor;
            std::get<17>(accumulators) += tmp_18;

            // Contribution 19 , quotient second highest limb decomposition
            auto tmp_19 =
                ((quotient_hi_limbs_range_constraint_0 + quotient_hi_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                  quotient_hi_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                  quotient_hi_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                  quotient_hi_limbs_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
                 quotient_hi_binary_limbs);
            tmp_19 *= lagrange_odd;
            tmp_19 *= scaling_factor;
            std::get<18>(accumulators) += tmp_19;
            // Contribution 20 , quotient highest limb decomposition
            auto tmp_20 = ((quotient_hi_limbs_range_constraint_0_shift +
                            quotient_hi_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                            quotient_hi_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                            quotient_hi_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3) -
                           quotient_hi_binary_limbs_shift);
            tmp_20 *= lagrange_odd;
            tmp_20 *= scaling_factor;
            std::get<19>(accumulators) += tmp_20;

            // Contribution 21 , quotient highest limb decomposition
            auto tmp_21 =
                ((relation_wide_limbs_range_constraint_0 + relation_wide_limbs_range_constraint_1 * MICRO_LIMB_SHIFT +
                  relation_wide_limbs_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
                  relation_wide_limbs_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
                  p_x_high_limbs_range_constraint_tail_shift * MICRO_LIMB_SHIFTx4 +
                  accumulator_hi_limbs_range_constraint_tail_shift * MICRO_LIMB_SHIFTx5) -
                 relation_wide_limbs);
            tmp_21 *= lagrange_odd;
            tmp_21 *= scaling_factor;
            std::get<20>(accumulators) += tmp_21;

            // Contribution 22 , quotient highest limb decomposition
            auto tmp_22 = ((relation_wide_limbs_range_constraint_0_shift +
                            relation_wide_limbs_range_constraint_1_shift * MICRO_LIMB_SHIFT +
                            relation_wide_limbs_range_constraint_2_shift * MICRO_LIMB_SHIFTx2 +
                            relation_wide_limbs_range_constraint_3_shift * MICRO_LIMB_SHIFTx3 +
                            p_y_high_limbs_range_constraint_tail_shift * MICRO_LIMB_SHIFTx4 +
                            quotient_hi_limbs_range_constraint_tail_shift * MICRO_LIMB_SHIFTx5) -
                           relation_wide_limbs_shift);
            tmp_22 *= lagrange_odd;
            tmp_22 *= scaling_factor;
            std::get<21>(accumulators) += tmp_22;

            // Contributions enfocing a reduced range constraint on high limbs
            // Contribution 23
            auto tmp_23 = p_x_low_limbs_range_constraint_4 * SHIFT_12_TO_14 - p_x_low_limbs_range_constraint_tail;
            tmp_23 *= lagrange_odd;
            tmp_23 *= scaling_factor;
            std::get<22>(accumulators) += tmp_23;

            // Contribution 24
            auto tmp_24 =
                p_x_low_limbs_range_constraint_4_shift * SHIFT_12_TO_14 - p_x_low_limbs_range_constraint_tail_shift;
            tmp_24 *= lagrange_odd;
            tmp_24 *= scaling_factor;
            std::get<23>(accumulators) += tmp_24;

            // Contribution 25
            auto tmp_25 = p_x_high_limbs_range_constraint_4 * SHIFT_12_TO_14 - p_x_high_limbs_range_constraint_tail;
            tmp_25 *= lagrange_odd;
            tmp_25 *= scaling_factor;
            std::get<24>(accumulators) += tmp_25;

            // Contribution 26
            auto tmp_26 =
                (p_x_high_limbs_range_constraint_3_shift * SHIFT_8_TO_14 - p_x_high_limbs_range_constraint_4_shift);

            tmp_26 *= lagrange_odd;
            tmp_26 *= scaling_factor;
            std::get<25>(accumulators) += tmp_26;

            // Contribution 27
            auto tmp_27 = p_y_low_limbs_range_constraint_4 * SHIFT_12_TO_14 - p_y_low_limbs_range_constraint_tail;
            tmp_27 *= lagrange_odd;
            tmp_27 *= scaling_factor;
            std::get<26>(accumulators) += tmp_27;

            // Contribution 28
            auto tmp_28 =
                p_y_low_limbs_range_constraint_4_shift * SHIFT_12_TO_14 - p_y_low_limbs_range_constraint_tail_shift;
            tmp_28 *= lagrange_odd;
            tmp_28 *= scaling_factor;
            std::get<27>(accumulators) += tmp_28;

            // Contribution 29
            auto tmp_29 = p_y_high_limbs_range_constraint_4 * SHIFT_12_TO_14 - p_y_high_limbs_range_constraint_tail;
            tmp_29 *= lagrange_odd;
            tmp_29 *= scaling_factor;
            std::get<28>(accumulators) += tmp_29;

            // Contribution 30
            auto tmp_30 =
                (p_y_high_limbs_range_constraint_3_shift * SHIFT_8_TO_14 - p_y_high_limbs_range_constraint_4_shift);

            tmp_30 *= lagrange_odd;
            tmp_30 *= scaling_factor;
            std::get<29>(accumulators) += tmp_30;

            // Contribution 31
            auto tmp_31 = (z_lo_limbs_range_constraint_4 * SHIFT_12_TO_14 - z_lo_limbs_range_constraint_tail);
            tmp_31 *= lagrange_odd;
            tmp_31 *= scaling_factor;
            std::get<30>(accumulators) += tmp_31;

            // Contribution 32
            auto tmp_32 =
                (z_lo_limbs_range_constraint_4_shift * SHIFT_12_TO_14 - z_lo_limbs_range_constraint_tail_shift);
            tmp_32 *= lagrange_odd;
            tmp_32 *= scaling_factor;
            std::get<31>(accumulators) += tmp_32;

            // Contribution 33
            auto tmp_33 = (z_hi_limbs_range_constraint_4 * SHIFT_4_TO_14 - z_hi_limbs_range_constraint_tail);
            tmp_33 *= lagrange_odd;
            tmp_33 *= scaling_factor;
            std::get<32>(accumulators) += tmp_33;

            // Contribution 34
            auto tmp_34 =
                (z_hi_limbs_range_constraint_4_shift * SHIFT_4_TO_14 - z_hi_limbs_range_constraint_tail_shift);
            tmp_34 *= lagrange_odd;
            tmp_34 *= scaling_factor;
            std::get<33>(accumulators) += tmp_34;

            // Contribution 35
            auto tmp_35 =
                (accumulator_lo_limbs_range_constraint_4 * SHIFT_12_TO_14 - accumulator_lo_limbs_range_constraint_tail);
            tmp_35 *= lagrange_odd;
            tmp_35 *= scaling_factor;
            std::get<34>(accumulators) += tmp_35;

            // Contribution 36
            auto tmp_36 = (accumulator_lo_limbs_range_constraint_4_shift * SHIFT_12_TO_14 -
                           accumulator_lo_limbs_range_constraint_tail_shift);
            tmp_36 *= lagrange_odd;
            tmp_36 *= scaling_factor;
            std::get<35>(accumulators) += tmp_36;

            // Contribution 37
            auto tmp_37 =
                (accumulator_hi_limbs_range_constraint_4 * SHIFT_12_TO_14 - accumulator_hi_limbs_range_constraint_tail);
            tmp_37 *= lagrange_odd;
            tmp_37 *= scaling_factor;
            std::get<36>(accumulators) += tmp_37;

            // Contribution 38
            auto tmp_38 = (accumulator_hi_limbs_range_constraint_3_shift * SHIFT_8_TO_14 -
                           accumulator_hi_limbs_range_constraint_4_shift);
            tmp_38 *= lagrange_odd;
            tmp_38 *= scaling_factor;
            std::get<37>(accumulators) += tmp_38;

            // Contribution 39
            auto tmp_39 =
                (quotient_lo_limbs_range_constraint_4 * SHIFT_12_TO_14 - quotient_lo_limbs_range_constraint_tail);
            tmp_39 *= lagrange_odd;
            tmp_39 *= scaling_factor;
            std::get<38>(accumulators) += tmp_39;

            // Contribution 40
            auto tmp_40 = (quotient_lo_limbs_range_constraint_4_shift * SHIFT_12_TO_14 -
                           quotient_lo_limbs_range_constraint_tail_shift);
            tmp_40 *= lagrange_odd;
            tmp_40 *= scaling_factor;
            std::get<39>(accumulators) += tmp_40;

            // Contribution 41
            auto tmp_41 =
                (quotient_hi_limbs_range_constraint_4 * SHIFT_12_TO_14 - quotient_hi_limbs_range_constraint_tail);
            tmp_41 *= lagrange_odd;
            tmp_41 *= scaling_factor;
            std::get<40>(accumulators) += tmp_41;

            // Contribution 42
            auto tmp_42 = (quotient_hi_limbs_range_constraint_3_shift * SHIFT_10_TO_14 -
                           quotient_hi_limbs_range_constraint_4_shift);
            tmp_42 *= lagrange_odd;
            tmp_42 *= scaling_factor;
            std::get<41>(accumulators) += tmp_42;

            // Contributions where we decompose initial EccOpQueue values into 68-bit limbs

            // Contribution 43
            auto tmp_43 = (p_x_low_limbs + p_x_low_limbs_shift * LIMB_SHIFT) - x_lo_y_hi;
            tmp_43 *= lagrange_odd;
            tmp_43 *= scaling_factor;
            std::get<42>(accumulators) += tmp_43;

            // Contribution 44
            auto tmp_44 = (p_x_high_limbs + p_x_high_limbs_shift * LIMB_SHIFT) - x_hi_z_1;
            tmp_44 *= lagrange_odd;
            tmp_44 *= scaling_factor;
            std::get<43>(accumulators) += tmp_44;
            // Contribution 45
            auto tmp_45 = (p_y_low_limbs + p_y_low_limbs_shift * LIMB_SHIFT) - y_lo_z_2;
            tmp_45 *= lagrange_odd;
            tmp_45 *= scaling_factor;
            std::get<44>(accumulators) += tmp_45;

            // Contribution 46
            auto tmp_46 = (p_y_high_limbs + p_y_high_limbs_shift * LIMB_SHIFT) - x_lo_y_hi_shift;
            tmp_46 *= lagrange_odd;
            tmp_46 *= scaling_factor;
            std::get<45>(accumulators) += tmp_46;

            // Contribution 47
            auto tmp_47 = (z_lo_limbs + z_hi_limbs * LIMB_SHIFT) - x_hi_z_1_shift;
            tmp_47 *= lagrange_odd;
            tmp_47 *= scaling_factor;
            std::get<46>(accumulators) += tmp_47;
            // Contribution 48
            auto tmp_48 = (z_lo_limbs_shift + z_hi_limbs_shift * LIMB_SHIFT) - y_lo_z_2_shift;
            tmp_48 *= lagrange_odd;
            tmp_48 *= scaling_factor;
            std::get<47>(accumulators) += tmp_48;

        }; // namespace proof_system::honk::sumcheck
    };
};
template <typename FF>
using GoblinTranslatorDecompositionRelation = RelationWrapper<FF, GoblinTranslatorDecompositionRelationBase>;

} // namespace proof_system::honk::sumcheck

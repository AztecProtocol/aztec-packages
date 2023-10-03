#pragma once
#include <array>
#include <tuple>

#include "../polynomials/univariate.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system::honk::sumcheck {

template <typename FF> class GoblinTranslatorMainRelationBase {
    static constexpr size_t NUM_LIMB_BITS = 68;
    static constexpr FF shift = FF(uint256_t(1) << NUM_LIMB_BITS);
    static constexpr FF shiftx2 = FF(uint256_t(1) << (NUM_LIMB_BITS * 2));
    static constexpr FF shiftx3 = FF(uint256_t(1) << (NUM_LIMB_BITS * 3));
    static constexpr uint512_t MODULUS_U512 = uint512_t(curve::BN254::BaseField::modulus);
    static constexpr uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (NUM_LIMB_BITS << 2);
    static constexpr uint512_t NEGATIVE_PRIME_MODULUS = BINARY_BASIS_MODULUS - MODULUS_U512;
    static constexpr std::array<FF, 5> NEGATIVE_MODULUS_LIMBS = {
        FF(NEGATIVE_PRIME_MODULUS.slice(0, NUM_LIMB_BITS).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo),
        -FF(curve::BN254::BaseField::modulus)
    };

  public:
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 3; // degree((LAGRANGE_LAST-1)D(D - 1)(D - 2)(D - 3)) = 5
    static constexpr size_t LEN_1 = 3;           // range constrain sub-relation 1
    static constexpr size_t LEN_2 = 3;           // range constrain sub-relation 1
    static constexpr size_t LEN_3 = 3;           // range constrain sub-relation 1
    template <template <size_t...> typename AccumulatorTypesContainer>
    using AccumulatorTypesBase = AccumulatorTypesContainer<LEN_1, LEN_2, LEN_3>;

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
                                           const RelationParameters<FF>& relation_parameters,
                                           const FF& scaling_factor)
    {
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
        auto op = View(extended_edges.op);
        auto p_x_low_limbs = View(extended_edges.p_x_low_limbs);
        auto p_y_low_limbs = View(extended_edges.p_y_low_limbs);
        auto p_x_high_limbs = View(extended_edges.p_x_high_limbs);
        auto p_y_high_limbs = View(extended_edges.p_y_high_limbs);
        auto accumulators_binary_limbs_0 = View(extended_edges.accumulators_binary_limbs_0);
        auto accumulators_binary_limbs_1 = View(extended_edges.accumulators_binary_limbs_1);
        auto accumulators_binary_limbs_2 = View(extended_edges.accumulators_binary_limbs_2);
        auto accumulators_binary_limbs_3 = View(extended_edges.accumulators_binary_limbs_3);
        auto z_lo_limbs = View(extended_edges.z_lo_limbs);
        auto z_hi_limbs = View(extended_edges.z_hi_limbs);
        auto quotient_lo_binary_limbs = View(extended_edges.quotient_lo_binary_limbs);
        auto quotient_hi_binary_limbs = View(extended_edges.quotient_hi_binary_limbs);
        auto p_x_low_limbs_shift = View(extended_edges.p_x_low_limbs_shift);
        auto p_y_low_limbs_shift = View(extended_edges.p_y_low_limbs_shift);
        auto p_x_high_limbs_shift = View(extended_edges.p_x_high_limbs_shift);
        auto p_y_high_limbs_shift = View(extended_edges.p_y_high_limbs_shift);
        auto accumulators_binary_limbs_0_shift = View(extended_edges.accumulators_binary_limbs_0_shift);
        auto accumulators_binary_limbs_1_shift = View(extended_edges.accumulators_binary_limbs_1_shift);
        auto accumulators_binary_limbs_2_shift = View(extended_edges.accumulators_binary_limbs_2_shift);
        auto accumulators_binary_limbs_3_shift = View(extended_edges.accumulators_binary_limbs_3_shift);
        auto z_lo_limbs_shift = View(extended_edges.z_lo_limbs_shift);
        auto z_hi_limbs_shift = View(extended_edges.z_hi_limbs_shift);
        auto quotient_lo_binary_limbs_shift = View(extended_edges.quotient_lo_binary_limbs_shift);
        auto quotient_hi_binary_limbs_shift = View(extended_edges.quotient_hi_binary_limbs_shift);
        auto relation_wide_limbs = View(extended_edges.relation_wide_limbs);
        auto relation_wide_limbs_shift = View(extended_edges.relation_wide_limbs_shift);
        auto lagrange_odd = View(extended_edges.lagrange_odd);

        // Contribution (1)
        auto tmp_1 = accumulators_binary_limbs_0_shift * relation_parameters.evaluation_input_x[0] + op +
                     p_x_low_limbs * relation_parameters.batching_challenge_v[0][0] +
                     p_y_low_limbs * relation_parameters.batching_challenge_v[1][0] +
                     z_lo_limbs * relation_parameters.batching_challenge_v[2][0] +
                     z_lo_limbs_shift * relation_parameters.batching_challenge_v[3][0] +
                     quotient_lo_binary_limbs * NEGATIVE_MODULUS_LIMBS[0] - accumulators_binary_limbs_0;
        tmp_1 += (accumulators_binary_limbs_1_shift * relation_parameters.evaluation_input_x[0] +
                  accumulators_binary_limbs_0_shift * relation_parameters.evaluation_input_x[1] +
                  p_x_low_limbs * relation_parameters.batching_challenge_v[0][1] +
                  p_x_low_limbs_shift * relation_parameters.batching_challenge_v[0][0] +
                  p_y_low_limbs * relation_parameters.batching_challenge_v[1][1] +
                  p_y_low_limbs_shift * relation_parameters.batching_challenge_v[1][0] +
                  z_lo_limbs * relation_parameters.batching_challenge_v[2][1] +
                  z_hi_limbs * relation_parameters.batching_challenge_v[2][0] +
                  z_lo_limbs_shift * relation_parameters.batching_challenge_v[3][1] +
                  z_hi_limbs_shift * relation_parameters.batching_challenge_v[3][0] +
                  quotient_lo_binary_limbs * NEGATIVE_MODULUS_LIMBS[1] +
                  quotient_lo_binary_limbs_shift * NEGATIVE_MODULUS_LIMBS[0] - accumulators_binary_limbs_1) *
                 shift;
        tmp_1 -= relation_wide_limbs * shiftx2;
        tmp_1 *= lagrange_odd;
        tmp_1 *= scaling_factor;
        std::get<0>(accumulators) += tmp_1;

        auto tmp_2 = relation_wide_limbs +
                     accumulators_binary_limbs_2_shift * relation_parameters.evaluation_input_x[0] +
                     accumulators_binary_limbs_1_shift * relation_parameters.evaluation_input_x[1] +
                     accumulators_binary_limbs_0_shift * relation_parameters.evaluation_input_x[2] +
                     p_x_high_limbs * relation_parameters.batching_challenge_v[0][0] +
                     p_x_low_limbs_shift * relation_parameters.batching_challenge_v[0][1] +
                     p_x_low_limbs * relation_parameters.batching_challenge_v[0][2] +
                     p_y_high_limbs * relation_parameters.batching_challenge_v[1][0] +
                     p_y_low_limbs_shift * relation_parameters.batching_challenge_v[1][1] +
                     p_y_low_limbs * relation_parameters.batching_challenge_v[1][2] +
                     z_hi_limbs * relation_parameters.batching_challenge_v[2][1] +
                     z_lo_limbs * relation_parameters.batching_challenge_v[2][2] +
                     z_hi_limbs_shift * relation_parameters.batching_challenge_v[3][1] +
                     z_lo_limbs_shift * relation_parameters.batching_challenge_v[3][2] +
                     quotient_hi_binary_limbs * NEGATIVE_MODULUS_LIMBS[0] +
                     quotient_lo_binary_limbs_shift * NEGATIVE_MODULUS_LIMBS[1] +
                     quotient_lo_binary_limbs * NEGATIVE_MODULUS_LIMBS[2] - accumulators_binary_limbs_2;
        tmp_2 += (accumulators_binary_limbs_3_shift * relation_parameters.evaluation_input_x[0] +
                  accumulators_binary_limbs_2_shift * relation_parameters.evaluation_input_x[1] +
                  accumulators_binary_limbs_1_shift * relation_parameters.evaluation_input_x[2] +
                  accumulators_binary_limbs_0_shift * relation_parameters.evaluation_input_x[3] +
                  p_x_high_limbs_shift * relation_parameters.batching_challenge_v[0][0] +
                  p_x_high_limbs * relation_parameters.batching_challenge_v[0][1] +
                  p_x_low_limbs_shift * relation_parameters.batching_challenge_v[0][2] +
                  p_x_low_limbs * relation_parameters.batching_challenge_v[0][3] +
                  p_y_high_limbs_shift * relation_parameters.batching_challenge_v[1][0] +
                  p_y_high_limbs * relation_parameters.batching_challenge_v[1][1] +
                  p_y_low_limbs_shift * relation_parameters.batching_challenge_v[1][2] +
                  p_y_low_limbs * relation_parameters.batching_challenge_v[1][3] +
                  z_hi_limbs * relation_parameters.batching_challenge_v[2][2] +
                  z_lo_limbs * relation_parameters.batching_challenge_v[2][3] +
                  z_hi_limbs_shift * relation_parameters.batching_challenge_v[3][2] +
                  z_lo_limbs_shift * relation_parameters.batching_challenge_v[3][3] +
                  quotient_hi_binary_limbs_shift * NEGATIVE_MODULUS_LIMBS[0] +
                  quotient_hi_binary_limbs * NEGATIVE_MODULUS_LIMBS[1] +
                  quotient_lo_binary_limbs_shift * NEGATIVE_MODULUS_LIMBS[2] +
                  quotient_lo_binary_limbs * NEGATIVE_MODULUS_LIMBS[3] - accumulators_binary_limbs_3) *
                 shift;
        tmp_2 -= relation_wide_limbs_shift * shiftx2;
        tmp_2 *= lagrange_odd;
        tmp_2 *= scaling_factor;
        std::get<1>(accumulators) += tmp_2;
        auto reconstructed_p_x =
            (p_x_low_limbs + p_x_low_limbs_shift * shift + p_x_high_limbs * shiftx2 + p_x_high_limbs_shift * shiftx3);
        auto reconstructed_p_y =
            (p_y_low_limbs + p_y_low_limbs_shift * shift + p_y_high_limbs * shiftx2 + p_y_high_limbs_shift * shiftx3);
        auto reconstructed_previous_accumulator =
            (accumulators_binary_limbs_0_shift + accumulators_binary_limbs_1_shift * shift +
             accumulators_binary_limbs_2_shift * shiftx2 + accumulators_binary_limbs_3_shift * shiftx3);
        auto reconstructed_current_accumulator =
            (accumulators_binary_limbs_0 + accumulators_binary_limbs_1 * shift + accumulators_binary_limbs_2 * shiftx2 +
             accumulators_binary_limbs_3 * shiftx3);
        auto reconstructed_z1 = (z_lo_limbs + z_hi_limbs * shift);
        auto reconstructed_z2 = (z_lo_limbs_shift + z_hi_limbs_shift * shift);
        auto reconstructed_quotient = (quotient_lo_binary_limbs + quotient_lo_binary_limbs_shift * shift +
                                       quotient_hi_binary_limbs * shiftx2 + quotient_hi_binary_limbs_shift * shiftx3);
        // TODO: just supply reconstructed challenges, we don't need to reconstruct them here
        auto reconstructed_batching_evaluation_v =
            (relation_parameters.batching_challenge_v[0][0] + relation_parameters.batching_challenge_v[0][1] * shift +
             relation_parameters.batching_challenge_v[0][2] * shiftx2 +
             relation_parameters.batching_challenge_v[0][3] * shiftx3);
        auto reconstructed_batching_evaluation_v2 =
            (relation_parameters.batching_challenge_v[1][0] + relation_parameters.batching_challenge_v[1][1] * shift +
             relation_parameters.batching_challenge_v[1][2] * shiftx2 +
             relation_parameters.batching_challenge_v[1][3] * shiftx3);
        auto reconstructed_batching_evaluation_v3 =
            (relation_parameters.batching_challenge_v[2][0] + relation_parameters.batching_challenge_v[2][1] * shift +
             relation_parameters.batching_challenge_v[2][2] * shiftx2 +
             relation_parameters.batching_challenge_v[2][3] * shiftx3);
        auto reconstructed_batching_evaluation_v4 =
            (relation_parameters.batching_challenge_v[3][0] + relation_parameters.batching_challenge_v[3][1] * shift +
             relation_parameters.batching_challenge_v[3][2] * shiftx2 +
             relation_parameters.batching_challenge_v[3][3] * shiftx3);
        auto reconstructed_evaluation_input_x =
            (relation_parameters.evaluation_input_x[0] + relation_parameters.evaluation_input_x[1] * shift +
             relation_parameters.evaluation_input_x[2] * shiftx2 + relation_parameters.evaluation_input_x[3] * shiftx3);

        auto tmp_3 = reconstructed_previous_accumulator * reconstructed_evaluation_input_x + op +
                     reconstructed_p_x * reconstructed_batching_evaluation_v +
                     reconstructed_p_y * reconstructed_batching_evaluation_v2 +
                     reconstructed_z1 * reconstructed_batching_evaluation_v3 +
                     reconstructed_z2 * reconstructed_batching_evaluation_v4 +
                     reconstructed_quotient * NEGATIVE_MODULUS_LIMBS[4] - reconstructed_current_accumulator;
        tmp_3 *= lagrange_odd;
        tmp_3 *= scaling_factor;
        std::get<2>(accumulators) += tmp_3;
    };
};
template <typename FF> using GoblinTranslatorMainRelation = RelationWrapper<FF, GoblinTranslatorMainRelationBase>;

} // namespace proof_system::honk::sumcheck

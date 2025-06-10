// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"

namespace bb {

/**
 * @brief Expression for enforcing the value of the Opcode to be {0,3,4,8} (nop, eq and reset, mul or add)
 * @details This relation enforces the opcode to be one of described values. Since we don't care about even
 * values in the opcode wire and usually just set them to zero, we don't use a lagrange polynomial to specify
 * the relation to be enforced just at odd indices, which brings the degree down by 1.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorOpcodeConstraintRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                            const AllEntities& in,
                                                            const Parameters&,
                                                            const FF& scaling_factor)
{

    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    auto op = View(in.op);
    auto lagrange_mini_masking = View(in.lagrange_mini_masking);
    static const FF minus_three = FF(-3);
    static const FF minus_four = FF(-4);
    static const FF minus_eight = FF(-8);
    static const FF minus_one = FF(-1);

    // Contribution (1) op(op-3)(op-4)(op-8))
    auto tmp_1 = op * (op + minus_three);
    tmp_1 *= (op + minus_four);
    tmp_1 *= (op + minus_eight);
    tmp_1 *= (lagrange_mini_masking + minus_one);
    tmp_1 *= scaling_factor;
    std::get<0>(accumulators) += tmp_1;
};

/**
 * @brief Relation enforcing non-arithmetic transitions of accumulator (value that is tracking the batched
 * evaluation of polynomials in non-native field)
 * @details This relation enforces three pieces of logic:
 * 1) Accumulator starts as zero before we start accumulating stuff
 * 2) Accumulator limbs stay the same if accumulation is not occurring (at even indices)
 * 3) Accumulator limbs result in the values specified by relation parameters after accumulation
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorAccumulatorTransferRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                               const AllEntities& in,
                                                               const Parameters& params,
                                                               const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;
    // We use combination of lagrange polynomials at odd indices in the minicircuit for copying the accumulator
    auto lagrange_odd_in_minicircuit = View(in.lagrange_odd_in_minicircuit);

    // Lagrange ensuring the accumulator result is validated at the correct row
    auto lagrange_result_row = View(in.lagrange_result_row);

    // Lagrange at index (size of minicircuit - 1) is used to enforce that the accumulator is initialized to zero in the
    // circuit
    auto lagrange_last_in_minicircuit = View(in.lagrange_last_in_minicircuit);

    // Locations of randomness in the minicircuit
    auto lagrange_mini_masking = View(in.lagrange_mini_masking);

    auto accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0);
    auto accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1);
    auto accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2);
    auto accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3);
    auto accumulators_binary_limbs_0_shift = View(in.accumulators_binary_limbs_0_shift);
    auto accumulators_binary_limbs_1_shift = View(in.accumulators_binary_limbs_1_shift);
    auto accumulators_binary_limbs_2_shift = View(in.accumulators_binary_limbs_2_shift);
    auto accumulators_binary_limbs_3_shift = View(in.accumulators_binary_limbs_3_shift);

    FF minus_one = FF(-1);

    // Contribution (0) (0-12 ensure that the accumulator is transferred correctly
    // Contribution (1) (1-4 ensure transfer of accumulator limbs at odd indices of the minicircuit)
    auto tmp_1 = accumulators_binary_limbs_0 - accumulators_binary_limbs_0_shift;
    tmp_1 *= lagrange_odd_in_minicircuit * (lagrange_last_in_minicircuit + minus_one);
    tmp_1 *= scaling_factor;
    std::get<0>(accumulators) += tmp_1;

    // Contribution (2)
    auto tmp_2 = accumulators_binary_limbs_1 - accumulators_binary_limbs_1_shift;
    tmp_2 *= lagrange_odd_in_minicircuit * (lagrange_last_in_minicircuit + minus_one);
    tmp_2 *= scaling_factor;
    std::get<1>(accumulators) += tmp_2;
    // Contribution (3)
    auto tmp_3 = accumulators_binary_limbs_2 - accumulators_binary_limbs_2_shift;
    tmp_3 *= lagrange_odd_in_minicircuit * (lagrange_last_in_minicircuit + minus_one);
    tmp_3 *= scaling_factor;
    std::get<2>(accumulators) += tmp_3;
    // Contribution (4)
    auto tmp_4 = accumulators_binary_limbs_3 - accumulators_binary_limbs_3_shift;
    tmp_4 *= lagrange_odd_in_minicircuit * (lagrange_last_in_minicircuit + minus_one);
    tmp_4 *= scaling_factor;
    std::get<3>(accumulators) += tmp_4;

    // Contribution (5) (5-9 ensure that accumulator starts with zeroed-out limbs)
    auto tmp_5 = accumulators_binary_limbs_0 * lagrange_last_in_minicircuit;
    tmp_5 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<4>(accumulators) += tmp_5;

    //    Contribution (6)
    auto tmp_6 = accumulators_binary_limbs_1 * lagrange_last_in_minicircuit;
    tmp_6 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<5>(accumulators) += tmp_6;

    // Contribution (7)
    auto tmp_7 = accumulators_binary_limbs_2 * lagrange_last_in_minicircuit;
    tmp_7 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<6>(accumulators) += tmp_7;

    // Contribution (8)
    auto tmp_8 = accumulators_binary_limbs_3 * lagrange_last_in_minicircuit;
    tmp_8 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<7>(accumulators) += tmp_8;

    // Contribution (9) (9-12 ensure the output is as stated, we basically use this to get the result out of the
    // // proof)
    auto tmp_9 = (accumulators_binary_limbs_0 - params.accumulated_result[0]) * lagrange_result_row;
    tmp_9 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<8>(accumulators) += tmp_9;

    // Contribution (10)
    auto tmp_10 = (accumulators_binary_limbs_1 - params.accumulated_result[1]) * lagrange_result_row;
    tmp_10 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<9>(accumulators) += tmp_10;

    // Contribution (11)
    auto tmp_11 = (accumulators_binary_limbs_2 - params.accumulated_result[2]) * lagrange_result_row;
    tmp_11 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<10>(accumulators) += tmp_11;

    // Contribution (12)
    auto tmp_12 = (accumulators_binary_limbs_3 - params.accumulated_result[3]) * lagrange_result_row;
    tmp_12 *= (lagrange_mini_masking + minus_one) * scaling_factor;
    std::get<11>(accumulators) += tmp_12;
};

/**
 * @brief Relation enforcing all the range-constraint polynomials to be zero after the minicircuit
 * @details This relation ensures that while we are out of the minicircuit the range constraint polynomials are zero
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorZeroConstraintsRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                           const AllEntities& in,
                                                           const Parameters&,
                                                           const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    // Minus one
    static auto minus_one = -FF(1);

    auto lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);
    auto lagrange_odd_in_minicircuit = View(in.lagrange_odd_in_minicircuit);

    auto p_x_low_limbs_range_constraint_0 = View(in.p_x_low_limbs_range_constraint_0);
    auto p_x_low_limbs_range_constraint_1 = View(in.p_x_low_limbs_range_constraint_1);
    auto p_x_low_limbs_range_constraint_2 = View(in.p_x_low_limbs_range_constraint_2);
    auto p_x_low_limbs_range_constraint_3 = View(in.p_x_low_limbs_range_constraint_3);
    auto p_x_low_limbs_range_constraint_4 = View(in.p_x_low_limbs_range_constraint_4);
    auto p_x_high_limbs_range_constraint_0 = View(in.p_x_high_limbs_range_constraint_0);
    auto p_x_high_limbs_range_constraint_1 = View(in.p_x_high_limbs_range_constraint_1);
    auto p_x_high_limbs_range_constraint_2 = View(in.p_x_high_limbs_range_constraint_2);
    auto p_x_high_limbs_range_constraint_3 = View(in.p_x_high_limbs_range_constraint_3);
    auto p_x_high_limbs_range_constraint_4 = View(in.p_x_high_limbs_range_constraint_4);
    auto p_y_low_limbs_range_constraint_0 = View(in.p_y_low_limbs_range_constraint_0);
    auto p_y_low_limbs_range_constraint_1 = View(in.p_y_low_limbs_range_constraint_1);
    auto p_y_low_limbs_range_constraint_2 = View(in.p_y_low_limbs_range_constraint_2);
    auto p_y_low_limbs_range_constraint_3 = View(in.p_y_low_limbs_range_constraint_3);
    auto p_y_low_limbs_range_constraint_4 = View(in.p_y_low_limbs_range_constraint_4);
    auto p_y_high_limbs_range_constraint_0 = View(in.p_y_high_limbs_range_constraint_0);
    auto p_y_high_limbs_range_constraint_1 = View(in.p_y_high_limbs_range_constraint_1);
    auto p_y_high_limbs_range_constraint_2 = View(in.p_y_high_limbs_range_constraint_2);
    auto p_y_high_limbs_range_constraint_3 = View(in.p_y_high_limbs_range_constraint_3);
    auto p_y_high_limbs_range_constraint_4 = View(in.p_y_high_limbs_range_constraint_4);
    auto z_low_limbs_range_constraint_0 = View(in.z_low_limbs_range_constraint_0);
    auto z_low_limbs_range_constraint_1 = View(in.z_low_limbs_range_constraint_1);
    auto z_low_limbs_range_constraint_2 = View(in.z_low_limbs_range_constraint_2);
    auto z_low_limbs_range_constraint_3 = View(in.z_low_limbs_range_constraint_3);
    auto z_low_limbs_range_constraint_4 = View(in.z_low_limbs_range_constraint_4);
    auto z_high_limbs_range_constraint_0 = View(in.z_high_limbs_range_constraint_0);
    auto z_high_limbs_range_constraint_1 = View(in.z_high_limbs_range_constraint_1);
    auto z_high_limbs_range_constraint_2 = View(in.z_high_limbs_range_constraint_2);
    auto z_high_limbs_range_constraint_3 = View(in.z_high_limbs_range_constraint_3);
    auto z_high_limbs_range_constraint_4 = View(in.z_high_limbs_range_constraint_4);
    auto accumulator_low_limbs_range_constraint_0 = View(in.accumulator_low_limbs_range_constraint_0);
    auto accumulator_low_limbs_range_constraint_1 = View(in.accumulator_low_limbs_range_constraint_1);
    auto accumulator_low_limbs_range_constraint_2 = View(in.accumulator_low_limbs_range_constraint_2);
    auto accumulator_low_limbs_range_constraint_3 = View(in.accumulator_low_limbs_range_constraint_3);
    auto accumulator_low_limbs_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4);
    auto accumulator_high_limbs_range_constraint_0 = View(in.accumulator_high_limbs_range_constraint_0);
    auto accumulator_high_limbs_range_constraint_1 = View(in.accumulator_high_limbs_range_constraint_1);
    auto accumulator_high_limbs_range_constraint_2 = View(in.accumulator_high_limbs_range_constraint_2);
    auto accumulator_high_limbs_range_constraint_3 = View(in.accumulator_high_limbs_range_constraint_3);
    auto accumulator_high_limbs_range_constraint_4 = View(in.accumulator_high_limbs_range_constraint_4);
    auto quotient_low_limbs_range_constraint_0 = View(in.quotient_low_limbs_range_constraint_0);
    auto quotient_low_limbs_range_constraint_1 = View(in.quotient_low_limbs_range_constraint_1);
    auto quotient_low_limbs_range_constraint_2 = View(in.quotient_low_limbs_range_constraint_2);
    auto quotient_low_limbs_range_constraint_3 = View(in.quotient_low_limbs_range_constraint_3);
    auto quotient_low_limbs_range_constraint_4 = View(in.quotient_low_limbs_range_constraint_4);
    auto quotient_high_limbs_range_constraint_0 = View(in.quotient_high_limbs_range_constraint_0);
    auto quotient_high_limbs_range_constraint_1 = View(in.quotient_high_limbs_range_constraint_1);
    auto quotient_high_limbs_range_constraint_2 = View(in.quotient_high_limbs_range_constraint_2);
    auto quotient_high_limbs_range_constraint_3 = View(in.quotient_high_limbs_range_constraint_3);
    auto quotient_high_limbs_range_constraint_4 = View(in.quotient_high_limbs_range_constraint_4);
    auto relation_wide_limbs_range_constraint_0 = View(in.relation_wide_limbs_range_constraint_0);
    auto relation_wide_limbs_range_constraint_1 = View(in.relation_wide_limbs_range_constraint_1);
    auto relation_wide_limbs_range_constraint_2 = View(in.relation_wide_limbs_range_constraint_2);
    auto relation_wide_limbs_range_constraint_3 = View(in.relation_wide_limbs_range_constraint_3);
    auto p_x_low_limbs_range_constraint_tail = View(in.p_x_low_limbs_range_constraint_tail);
    auto p_x_high_limbs_range_constraint_tail = View(in.p_x_high_limbs_range_constraint_tail);
    auto p_y_low_limbs_range_constraint_tail = View(in.p_y_low_limbs_range_constraint_tail);
    auto p_y_high_limbs_range_constraint_tail = View(in.p_y_high_limbs_range_constraint_tail);
    auto z_low_limbs_range_constraint_tail = View(in.z_low_limbs_range_constraint_tail);
    auto z_high_limbs_range_constraint_tail = View(in.z_high_limbs_range_constraint_tail);
    auto accumulator_low_limbs_range_constraint_tail = View(in.accumulator_low_limbs_range_constraint_tail);
    auto accumulator_high_limbs_range_constraint_tail = View(in.accumulator_high_limbs_range_constraint_tail);
    auto quotient_low_limbs_range_constraint_tail = View(in.quotient_low_limbs_range_constraint_tail);
    auto quotient_high_limbs_range_constraint_tail = View(in.quotient_high_limbs_range_constraint_tail);
    auto lagrange_mini_masking = View(in.lagrange_mini_masking);

    // 0 in the minicircuit, -1 outside
    auto not_in_mininicircuit_or_masked = (lagrange_odd_in_minicircuit + lagrange_even_in_minicircuit + minus_one) *
                                          (lagrange_mini_masking + minus_one) * scaling_factor;

    // Contribution 0, ensure p_x_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<0>(accumulators) += p_x_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 1, ensure p_x_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<1>(accumulators) += p_x_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 2, ensure p_x_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<2>(accumulators) += p_x_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 3, ensure p_x_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<3>(accumulators) += p_x_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 4, ensure p_x_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<4>(accumulators) += p_x_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 5, ensure p_x_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<5>(accumulators) += p_x_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 6, ensure p_x_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<6>(accumulators) += p_x_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 7, ensure p_x_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<7>(accumulators) += p_x_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 8, ensure p_x_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<8>(accumulators) += p_x_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 9, ensure p_x_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<9>(accumulators) += p_x_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 10, ensure p_y_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<10>(accumulators) += p_y_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 11, ensure p_y_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<11>(accumulators) += p_y_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 12, ensure p_y_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<12>(accumulators) += p_y_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 13, ensure p_y_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<13>(accumulators) += p_y_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 14, ensure p_y_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<14>(accumulators) += p_y_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 15, ensure p_y_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<15>(accumulators) += p_y_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 16, ensure p_y_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<16>(accumulators) += p_y_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 17, ensure p_y_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<17>(accumulators) += p_y_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 18, ensure p_y_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<18>(accumulators) += p_y_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 19, ensure p_y_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<19>(accumulators) += p_y_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 20, ensure z_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<20>(accumulators) += z_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 21, ensure z_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<21>(accumulators) += z_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 22, ensure z_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<22>(accumulators) += z_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 23, ensure z_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<23>(accumulators) += z_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 24, ensure z_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<24>(accumulators) += z_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 25, ensure z_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<25>(accumulators) += z_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 26, ensure z_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<26>(accumulators) += z_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 27, ensure z_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<27>(accumulators) += z_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 28, ensure z_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<28>(accumulators) += z_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 29, ensure z_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<29>(accumulators) += z_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 30, ensure accumulator_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<30>(accumulators) += accumulator_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 31, ensure accumulator_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<31>(accumulators) += accumulator_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 32, ensure accumulator_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<32>(accumulators) += accumulator_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 33, ensure accumulator_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<33>(accumulators) += accumulator_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 34, ensure accumulator_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<34>(accumulators) += accumulator_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 35, ensure accumulator_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<35>(accumulators) += accumulator_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 36, ensure accumulator_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<36>(accumulators) += accumulator_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 37, ensure accumulator_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<37>(accumulators) += accumulator_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 38, ensure accumulator_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<38>(accumulators) += accumulator_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 39, ensure accumulator_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<39>(accumulators) += accumulator_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 40, ensure quotient_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<40>(accumulators) += quotient_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 41, ensure quotient_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<41>(accumulators) += quotient_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 42, ensure quotient_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<42>(accumulators) += quotient_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 43, ensure quotient_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<43>(accumulators) += quotient_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 44, ensure quotient_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<44>(accumulators) += quotient_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 45, ensure quotient_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<45>(accumulators) += quotient_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 46, ensure quotient_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<46>(accumulators) += quotient_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 47, ensure quotient_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<47>(accumulators) += quotient_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 48, ensure quotient_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<48>(accumulators) += quotient_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 49, ensure quotient_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<49>(accumulators) += quotient_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked;

    // Contribution 50, ensure relation_wide_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<50>(accumulators) += relation_wide_limbs_range_constraint_0 * not_in_mininicircuit_or_masked;

    // Contribution 51, ensure relation_wide_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<51>(accumulators) += relation_wide_limbs_range_constraint_1 * not_in_mininicircuit_or_masked;

    // Contribution 52, ensure relation_wide_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<52>(accumulators) += relation_wide_limbs_range_constraint_2 * not_in_mininicircuit_or_masked;

    // Contribution 53, ensure relation_wide_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<53>(accumulators) += relation_wide_limbs_range_constraint_3 * not_in_mininicircuit_or_masked;

    // Contribution 54, ensure p_x_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<54>(accumulators) += p_x_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 55, ensure p_x_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<55>(accumulators) += p_x_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 56, ensure p_y_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<56>(accumulators) += p_y_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 57, ensure p_y_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<57>(accumulators) += p_y_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 58, ensure z_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<58>(accumulators) += z_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 59, ensure z_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<59>(accumulators) += z_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 60, ensure accumulator_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<60>(accumulators) += accumulator_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 61, ensure accumulator_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<61>(accumulators) += accumulator_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 62, ensure quotient_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<62>(accumulators) += quotient_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;

    // Contribution 63, ensure quotient_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<63>(accumulators) += quotient_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked;
};
} // namespace bb

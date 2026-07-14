// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_extra_short_relations.hpp"

namespace bb {

/**
 * @brief Enforces two constraints on the opcode value:
 *          1. opcode ∈ {0,3,4,8} (nop, eq and reset, mul or add) (including op = 0 on odd rows)
 *          2. at even indices when op = 0 (no-op), accumulator limbs stay the same
 *
 * @details We check the first relation at all rows. On odd rows, op = 0 is always valid, so the check is trivial.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorOpcodeConstraintShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                 const AllEntities& in,
                                                                 const Parameters& /*unused*/,
                                                                 const FF& scaling_factor)
{

    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = TranslatorShortMonomialView<Accumulator>;

    auto op = View(in.op);
    const auto lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);
    const auto lagrange_odd_in_minicircuit = View(in.lagrange_odd_in_minicircuit);
    static const FF minus_three = FF(-3);
    static const FF minus_four = FF(-4);
    static const FF minus_eight = FF(-8);
    const auto op_minus_three = op + minus_three;
    const auto op_minus_four = op + minus_four;
    const auto op_minus_eight = op + minus_eight;

    // Contribution (1) opcode validity:
    //   - even rows: op·(op-3)·(op-4)·(op-8) = 0, i.e. op ∈ {0,3,4,8}
    //   - odd rows:  op = 0
    // Mirrors TranslatorOpcodeConstraintRelation (the full-monomial variant); see it for the soundness rationale.
    auto tmp_1 = Accumulator((op * scaling_factor) * op_minus_three) * Accumulator(op_minus_four * op_minus_eight);
    tmp_1 *= Accumulator(lagrange_even_in_minicircuit);
    tmp_1 += Accumulator((op * scaling_factor) * lagrange_odd_in_minicircuit);
    std::get<0>(accumulators) += tmp_1;

    auto accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0);
    auto accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1);
    auto accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2);
    auto accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3);
    auto accumulators_binary_limbs_0_shift = View(in.accumulators_binary_limbs_0_shift);
    auto accumulators_binary_limbs_1_shift = View(in.accumulators_binary_limbs_1_shift);
    auto accumulators_binary_limbs_2_shift = View(in.accumulators_binary_limbs_2_shift);
    auto accumulators_binary_limbs_3_shift = View(in.accumulators_binary_limbs_3_shift);

    // Contribution (2) (2-5 ensure that the accumulator stays the same at even indices within the no-op range if
    // one exists)
    auto no_op_even_selector_scaled = Accumulator(op_minus_three * (op_minus_four * scaling_factor)) *
                                      Accumulator(op_minus_eight * lagrange_even_in_minicircuit);

    auto accumulate_no_op_transfer = [&](auto& accumulator, const auto& limb_delta) {
        accumulator += Accumulator(limb_delta) * no_op_even_selector_scaled;
    };

    // Contributions (2-5) ensure accumulator limbs stay the same at even no-op rows.
    accumulate_no_op_transfer(std::get<1>(accumulators),
                              accumulators_binary_limbs_0 - accumulators_binary_limbs_0_shift);
    accumulate_no_op_transfer(std::get<2>(accumulators),
                              accumulators_binary_limbs_1 - accumulators_binary_limbs_1_shift);
    accumulate_no_op_transfer(std::get<3>(accumulators),
                              accumulators_binary_limbs_2 - accumulators_binary_limbs_2_shift);
    accumulate_no_op_transfer(std::get<4>(accumulators),
                              accumulators_binary_limbs_3 - accumulators_binary_limbs_3_shift);
};

/**
 * @brief Relation enforcing non-arithmetic transitions of accumulator (value that is tracking the batched
 * evaluation of polynomials in non-native field)
 *
 * @details This relation enforces three pieces of logic:
 *            1) Accumulator starts as zero before we start accumulating stuff
 *            2) Accumulator limbs are propagated correctly from an odd row to the next even row
 *            3) Accumulator limbs result in the expected values specified by relation parameters after accumulation
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorAccumulatorTransferShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                    const AllEntities& in,
                                                                    const Parameters& params,
                                                                    const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = TranslatorShortMonomialView<Accumulator>;
    // Starting with 4th relation, we use shorter accumulators
    using ShorterAccumulator = std::tuple_element_t<4, ContainerOverSubrelations>;
    using ShorterView = TranslatorShortMonomialView<ShorterAccumulator>;
    // We use combination of lagrange polynomials at odd indices in the minicircuit for copying the accumulator
    const auto lagrange_odd_in_minicircuit = View(in.lagrange_odd_in_minicircuit);

    // Lagrange ensuring the accumulator result is validated at the correct row
    const auto lagrange_result_row_shorter = ShorterView(in.lagrange_result_row);

    // Lagrange at index (size of minicircuit without masking - 1) is used to enforce that the accumulator starts from
    // zero (recall that we accumulate in the reverse order of the ops)
    const auto lagrange_last_in_minicircuit = View(in.lagrange_last_in_minicircuit);
    const auto lagrange_last_in_minicircuit_shorter = ShorterView(in.lagrange_last_in_minicircuit);

    auto accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0);
    auto accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1);
    auto accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2);
    auto accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3);
    auto accumulators_binary_limbs_0_shift = View(in.accumulators_binary_limbs_0_shift);
    auto accumulators_binary_limbs_1_shift = View(in.accumulators_binary_limbs_1_shift);
    auto accumulators_binary_limbs_2_shift = View(in.accumulators_binary_limbs_2_shift);
    auto accumulators_binary_limbs_3_shift = View(in.accumulators_binary_limbs_3_shift);

    auto accumulators_binary_limbs_0_shorter = ShorterView(in.accumulators_binary_limbs_0);
    auto accumulators_binary_limbs_1_shorter = ShorterView(in.accumulators_binary_limbs_1);
    auto accumulators_binary_limbs_2_shorter = ShorterView(in.accumulators_binary_limbs_2);
    auto accumulators_binary_limbs_3_shorter = ShorterView(in.accumulators_binary_limbs_3);

    const FF minus_one = FF(-1);

    // Contribution (1) (1-4 ensure transfer of accumulator limbs at odd indices of the minicircuit)
    const auto is_row_odd_except_last_scaled =
        Accumulator(lagrange_odd_in_minicircuit * ((lagrange_last_in_minicircuit + minus_one) * scaling_factor));
    auto accumulate_odd_transfer = [&](auto& accumulator, const auto& limb_delta) {
        accumulator += Accumulator(limb_delta) * is_row_odd_except_last_scaled;
    };

    // Contributions (1-4) ensure transfer of accumulator limbs at odd minicircuit rows.
    accumulate_odd_transfer(std::get<0>(accumulators), accumulators_binary_limbs_0 - accumulators_binary_limbs_0_shift);
    accumulate_odd_transfer(std::get<1>(accumulators), accumulators_binary_limbs_1 - accumulators_binary_limbs_1_shift);
    accumulate_odd_transfer(std::get<2>(accumulators), accumulators_binary_limbs_2 - accumulators_binary_limbs_2_shift);
    accumulate_odd_transfer(std::get<3>(accumulators), accumulators_binary_limbs_3 - accumulators_binary_limbs_3_shift);

    // Contribution (5) (5-9 ensure that accumulator starts with zeroed-out limbs)
    const auto lagrange_last_in_minicircuit_by_scaling_factor = lagrange_last_in_minicircuit_shorter * scaling_factor;
    auto tmp_5 = accumulators_binary_limbs_0_shorter * lagrange_last_in_minicircuit_by_scaling_factor;
    std::get<4>(accumulators) += ShorterAccumulator(tmp_5);

    //    Contribution (6)
    auto tmp_6 = accumulators_binary_limbs_1_shorter * lagrange_last_in_minicircuit_by_scaling_factor;
    std::get<5>(accumulators) += ShorterAccumulator(tmp_6);

    // Contribution (7)
    auto tmp_7 = accumulators_binary_limbs_2_shorter * lagrange_last_in_minicircuit_by_scaling_factor;
    std::get<6>(accumulators) += ShorterAccumulator(tmp_7);

    // Contribution (8)
    auto tmp_8 = accumulators_binary_limbs_3_shorter * lagrange_last_in_minicircuit_by_scaling_factor;
    std::get<7>(accumulators) += ShorterAccumulator(tmp_8);

    // Contribution (9) (9-12 ensure the output is as stated, we basically use this to get the result out of the
    // proof)
    const auto lagrange_result_row_by_scaling_factor = lagrange_result_row_shorter * scaling_factor;
    auto tmp_9 =
        (accumulators_binary_limbs_0_shorter - params.accumulated_result[0]) * lagrange_result_row_by_scaling_factor;
    std::get<8>(accumulators) += ShorterAccumulator(tmp_9);

    // Contribution (10)
    auto tmp_10 =
        (accumulators_binary_limbs_1_shorter - params.accumulated_result[1]) * lagrange_result_row_by_scaling_factor;
    std::get<9>(accumulators) += ShorterAccumulator(tmp_10);

    // Contribution (11)
    auto tmp_11 =
        (accumulators_binary_limbs_2_shorter - params.accumulated_result[2]) * lagrange_result_row_by_scaling_factor;
    std::get<10>(accumulators) += ShorterAccumulator(tmp_11);

    // Contribution (12)
    auto tmp_12 =
        (accumulators_binary_limbs_3_shorter - params.accumulated_result[3]) * lagrange_result_row_by_scaling_factor;
    std::get<11>(accumulators) += ShorterAccumulator(tmp_12);
};

/**
 * @brief Relation enforcing all the range-constraint and op queue polynomials to be zero outside the minicircuit

 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorZeroConstraintsShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                const AllEntities& in,
                                                                const Parameters& /*unused*/,
                                                                const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = TranslatorShortMonomialView<Accumulator>;

    // Minus one
    static const auto minus_one = -FF(1);
    const auto lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);
    const auto lagrange_odd_in_minicircuit = View(in.lagrange_odd_in_minicircuit);

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
    auto op = View(in.op);
    auto x_lo_y_hi = View(in.x_lo_y_hi);
    auto x_hi_z_1 = View(in.x_hi_z_1);
    auto y_lo_z_2 = View(in.y_lo_z_2);
    const auto lagrange_mini_masking = View(in.lagrange_mini_masking);

    // 0 in the minicircuit, -1 outside
    const auto not_in_mininicircuit_or_masked =
        (lagrange_odd_in_minicircuit + lagrange_even_in_minicircuit + lagrange_mini_masking + minus_one) *
        scaling_factor;

    // Contribution 0, ensure p_x_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<0>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 1, ensure p_x_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<1>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 2, ensure p_x_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<2>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 3, ensure p_x_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<3>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 4, ensure p_x_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<4>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 5, ensure p_x_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<5>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 6, ensure p_x_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<6>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 7, ensure p_x_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<7>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 8, ensure p_x_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<8>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 9, ensure p_x_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<9>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 10, ensure p_y_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<10>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 11, ensure p_y_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<11>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 12, ensure p_y_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<12>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 13, ensure p_y_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<13>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 14, ensure p_y_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<14>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 15, ensure p_y_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<15>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 16, ensure p_y_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<16>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 17, ensure p_y_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<17>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 18, ensure p_y_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<18>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 19, ensure p_y_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<19>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 20, ensure z_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<20>(accumulators) += Accumulator(z_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 21, ensure z_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<21>(accumulators) += Accumulator(z_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 22, ensure z_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<22>(accumulators) += Accumulator(z_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 23, ensure z_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<23>(accumulators) += Accumulator(z_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 24, ensure z_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<24>(accumulators) += Accumulator(z_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 25, ensure z_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<25>(accumulators) += Accumulator(z_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 26, ensure z_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<26>(accumulators) += Accumulator(z_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 27, ensure z_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<27>(accumulators) += Accumulator(z_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 28, ensure z_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<28>(accumulators) += Accumulator(z_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 29, ensure z_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<29>(accumulators) += Accumulator(z_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 30, ensure accumulator_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<30>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 31, ensure accumulator_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<31>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 32, ensure accumulator_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<32>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 33, ensure accumulator_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<33>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 34, ensure accumulator_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<34>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 35, ensure accumulator_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<35>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 36, ensure accumulator_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<36>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 37, ensure accumulator_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<37>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 38, ensure accumulator_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<38>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 39, ensure accumulator_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<39>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 40, ensure quotient_low_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<40>(accumulators) += Accumulator(quotient_low_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 41, ensure quotient_low_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<41>(accumulators) += Accumulator(quotient_low_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 42, ensure quotient_low_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<42>(accumulators) += Accumulator(quotient_low_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 43, ensure quotient_low_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<43>(accumulators) += Accumulator(quotient_low_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 44, ensure quotient_low_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<44>(accumulators) += Accumulator(quotient_low_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 45, ensure quotient_high_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<45>(accumulators) += Accumulator(quotient_high_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 46, ensure quotient_high_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<46>(accumulators) += Accumulator(quotient_high_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 47, ensure quotient_high_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<47>(accumulators) += Accumulator(quotient_high_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 48, ensure quotient_high_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<48>(accumulators) += Accumulator(quotient_high_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 49, ensure quotient_high_limbs_range_constraint_4 is 0 outside of minicircuit
    std::get<49>(accumulators) += Accumulator(quotient_high_limbs_range_constraint_4 * not_in_mininicircuit_or_masked);

    // Contribution 50, ensure relation_wide_limbs_range_constraint_0 is 0 outside of minicircuit
    std::get<50>(accumulators) += Accumulator(relation_wide_limbs_range_constraint_0 * not_in_mininicircuit_or_masked);

    // Contribution 51, ensure relation_wide_limbs_range_constraint_1 is 0 outside of minicircuit
    std::get<51>(accumulators) += Accumulator(relation_wide_limbs_range_constraint_1 * not_in_mininicircuit_or_masked);

    // Contribution 52, ensure relation_wide_limbs_range_constraint_2 is 0 outside of minicircuit
    std::get<52>(accumulators) += Accumulator(relation_wide_limbs_range_constraint_2 * not_in_mininicircuit_or_masked);

    // Contribution 53, ensure relation_wide_limbs_range_constraint_3 is 0 outside of minicircuit
    std::get<53>(accumulators) += Accumulator(relation_wide_limbs_range_constraint_3 * not_in_mininicircuit_or_masked);

    // Contribution 54, ensure p_x_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<54>(accumulators) += Accumulator(p_x_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 55, ensure p_x_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<55>(accumulators) += Accumulator(p_x_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 56, ensure p_y_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<56>(accumulators) += Accumulator(p_y_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 57, ensure p_y_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<57>(accumulators) += Accumulator(p_y_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 58, ensure z_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<58>(accumulators) += Accumulator(z_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 59, ensure z_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<59>(accumulators) += Accumulator(z_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 60, ensure accumulator_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<60>(accumulators) +=
        Accumulator(accumulator_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 61, ensure accumulator_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<61>(accumulators) +=
        Accumulator(accumulator_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 62, ensure quotient_low_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<62>(accumulators) +=
        Accumulator(quotient_low_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 63, ensure quotient_high_limbs_range_constraint_tail is 0 outside of minicircuit
    std::get<63>(accumulators) +=
        Accumulator(quotient_high_limbs_range_constraint_tail * not_in_mininicircuit_or_masked);

    // Contribution 64, ensure op is 0 outside of minicircuit
    std::get<64>(accumulators) += Accumulator(op * not_in_mininicircuit_or_masked);

    // Contribution 65, ensure x_lo_y_hi is 0 outside of minicircuit
    std::get<65>(accumulators) += Accumulator(x_lo_y_hi * not_in_mininicircuit_or_masked);

    // Contribution 66, ensure x_hi_z_1 is 0 outside of minicircuit
    std::get<66>(accumulators) += Accumulator(x_hi_z_1 * not_in_mininicircuit_or_masked);

    // Contribution 67, ensure y_lo_z_2 is 0 outside of minicircuit
    std::get<67>(accumulators) += Accumulator(y_lo_z_2 * not_in_mininicircuit_or_masked);
};
} // namespace bb

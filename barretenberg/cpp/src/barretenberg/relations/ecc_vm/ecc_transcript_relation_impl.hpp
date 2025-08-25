// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "./ecc_transcript_relation.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"

namespace bb {
/**
 * @brief ECCVMTranscriptRelationImpl evaluates the correctness of the ECCVM transcript columns
 *
 * @details The transcript relations directly evaluate the correctness of `add, eq, reset` operations.
 * `mul` operations are lazily evaluated. The output of multiscalar multiplications is present in
 * `transcript_msm_x, transcript_msm_y` columns. A set equality check is used to validate these
 * have been correctly read from a table produced by the relations in `ecc_msm_relation.hpp`.
 *
 * Sequential `mul` opcodes are interpreted as a multiscalar multiplication.
 * The column `transcript_msm_count` tracks the number of muls in a given multiscalar multiplication.
 *
 * The column `transcript_pc` tracks a "point counter" value, that describes the number of multiplications
 * that must be evaluated.
 *
 * One mul opcode can generate up to TWO multiplications. Each 128-bit scalar `z1, z2` is treated as an independent mul.
 * The purpose of this is to reduce the length of the MSM algorithm evalauted in `ecc_msm_relation.hpp` to 128 bits
 * (from 256 bits). Many scalar muls required to recursively verify a proof are only 128-bits in length; this prevents
 * us doing redundant computation.
 * @tparam FF
 * @tparam AccumulatorTypes
 * @tparam PolynomialTypes
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMTranscriptRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                 const AllEntities& in,
                                                 const Parameters& /*unused*/,
                                                 const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    static const auto offset_generator = [&]() {
        static constexpr auto offset_generator_base = get_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
        static bb::g1::affine_element result =
            bb::g1::affine_element(bb::g1::element(offset_generator_base) * grumpkin::fq(uint256_t(1) << 124));
        static const FF qx = result.x;
        static const FF qy = result.y;
        static const Accumulator ox(qx);
        static const Accumulator oy(qy);
        return std::array<Accumulator, 2>{ ox, oy };
    };
    const auto z1 = View(in.transcript_z1);
    const auto z2 = View(in.transcript_z2);
    const auto z1_zero = View(in.transcript_z1zero);
    const auto z2_zero = View(in.transcript_z2zero);
    const auto op = View(in.transcript_op);
    const auto q_add = View(in.transcript_add);
    const auto q_mul = View(in.transcript_mul);
    const auto q_mul_shift = View(in.transcript_mul_shift);
    const auto q_eq = View(in.transcript_eq);
    const auto msm_transition = View(in.transcript_msm_transition);
    const auto msm_count = View(in.transcript_msm_count);
    const auto msm_count_shift = View(in.transcript_msm_count_shift);
    const auto pc = View(in.transcript_pc);
    const auto pc_shift = View(in.transcript_pc_shift);
    const auto transcript_accumulator_x_shift = View(in.transcript_accumulator_x_shift);
    const auto transcript_accumulator_y_shift = View(in.transcript_accumulator_y_shift);
    const auto transcript_accumulator_x = View(in.transcript_accumulator_x);
    const auto transcript_accumulator_y = View(in.transcript_accumulator_y);
    const auto msm_count_zero_at_transition = View(in.transcript_msm_count_zero_at_transition);
    const auto msm_count_at_transition_inverse = View(in.transcript_msm_count_at_transition_inverse);
    const auto transcript_msm_x = View(in.transcript_msm_intermediate_x);
    const auto transcript_msm_y = View(in.transcript_msm_intermediate_y);
    const auto transcript_Px = View(in.transcript_Px);
    const auto transcript_Py = View(in.transcript_Py);
    const auto is_accumulator_empty = -View(in.transcript_accumulator_not_empty) + 1;
    const auto lagrange_first = View(in.lagrange_first);
    const auto lagrange_last = View(in.lagrange_last);
    const auto is_accumulator_empty_shift = -View(in.transcript_accumulator_not_empty_shift) + 1;
    const auto q_reset_accumulator = View(in.transcript_reset_accumulator);
    const auto lagrange_second = View(in.lagrange_second);
    const auto transcript_Pinfinity = View(in.transcript_base_infinity);
    const auto transcript_Px_inverse = View(in.transcript_base_x_inverse);
    const auto transcript_Py_inverse = View(in.transcript_base_y_inverse);
    const auto transcript_add_x_equal = View(in.transcript_add_x_equal);
    const auto transcript_add_y_equal = View(in.transcript_add_y_equal);
    const auto transcript_add_lambda = View(in.transcript_add_lambda);
    const auto transcript_msm_infinity = View(in.transcript_msm_infinity);

    const auto is_not_first_row = (-lagrange_first + 1);
    const auto is_not_last_row = (-lagrange_last + 1);
    const auto is_not_first_or_last_row = (-lagrange_first + -lagrange_last + 1);
    const auto is_not_infinity = (-transcript_Pinfinity + 1);
    /**
     * @brief Validate correctness of z1_zero, z2_zero.
     * If z1_zero = 0 and operation is a MUL, we will write a scalar mul instruction into our multiplication table.
     * If z1_zero = 1 and operation is a MUL, we will NOT write a scalar mul instruction.
     * (same with z2_zero).
     * z1_zero / z2_zero is user-defined.
     * We constraint z1_zero such that if z1_zero == 1, we require z1 == 0. (same for z2_zero).
     * We do *NOT* constrain z1 != 0 if z1_zero = 0. If the user sets z1_zero = 0 and z1 = 0,
     * this will add a scalar mul instruction into the multiplication table, where the scalar multiplier is 0.
     * This is inefficient but will still produce the correct output.
     */
    std::get<0>(accumulator) += (z1 * z1_zero) * scaling_factor; // if z1_zero = 1, z1 must be 0. degree 2
    std::get<1>(accumulator) += (z2 * z2_zero) * scaling_factor; // degree 2

    /**
     * @brief Validate `op` opcode is well formed.
     * `op` is defined to be q_reset_accumulator + 2 * q_eq + 4 * q_mul + 8 * q_add,
     * where q_reset_accumulator, q_eq, q_mul, q_add are all boolean
     */
    auto tmp = q_add + q_add;
    tmp += q_mul;
    tmp += tmp;
    tmp += q_eq;
    tmp += tmp;
    tmp += q_reset_accumulator;
    std::get<2>(accumulator) += (tmp - op) * scaling_factor; // degree 1

    /**
     * @brief Validate `pc` is updated correctly.
     * pc stands for Point Counter. It decrements by 1 for every 128-bit multiplication operation.
     * If q_mul = 1, pc decrements by !z1_zero + !z2_zero, else pc decrements by 0
     * @note pc starts out at its max value and decrements down to 0. This keeps the degree of the pc polynomial small.
     * we check that the last value is 0 later.
     */
    Accumulator pc_delta = pc - pc_shift;
    auto num_muls_in_row = ((-z1_zero + 1) + (-z2_zero + 1)) * (-transcript_Pinfinity + 1);
    // note that the value of `pc` in the first row is 0 because `pc` is shiftable. It is the second row where it starts
    // out at its maximum value.
    std::get<3>(accumulator) += is_not_first_row * (pc_delta - q_mul * num_muls_in_row) * scaling_factor; // degree 4

    /**
     * @brief Validate `msm_transition_zero_at_transition` is well-formed enough to bear witness to a correct
     * computation.
     *
     * If the current row is the last `mul` instruction in a multiscalar multiplication (i.e., if the next row is not a
     * `mul` instruction), then check that `msm_transition_zero_at_transition` is constrained as follows: if it is 0,
     * then `msm_count + num_muls_in_row != 0` and is in fact the inverse of the (forced-to-be nonzero
     * value of) `msm_count_at_transition_inverse`.
     *
     * @note this does _not_ constrain `msm_transition_zero_at_transition` to vanish outside of syntactic
     * transitions (meaning when current row is a `mul` and next row is not a `mul`). similarly,
     * `msm_count_at_transition_inverse` is not forced to vanish away from syntactic transitions. However, neither of
     * these is necessary to witness a valid computation: the values away from syntactic transitions may be arbitrary,
     * as the values of these two wires are only used to validate computations _at syntactic transitions_.
     */

    // `msm_transition_check` is a _syntactic_ check that we could be in a transition.
    // `msm_count_total` is the total number of (short) multiplications, _including_ the multiplications to be processed
    // in this row.
    auto msm_transition_check = q_mul * (-q_mul_shift + 1); // degree 2
    auto msm_count_total = msm_count + num_muls_in_row;     // degree 2

    // `msm_count_at_transition_check` witnesses the claim that if `msm_count_zero_at_transition == 1`, then
    // `msm_count_total == 0` and if `msm_count_zero_at_transition == 0` and we are at a syntactic transition, then
    // `msm_count_total is invertible`. The way it does this is `msm_count_at_transition_inverse` is supposed to vanish
    // *except* possibly at a syntactic transition.
    auto msm_count_zero_at_transition_check = msm_count_zero_at_transition * msm_count_total;
    msm_count_zero_at_transition_check +=
        (msm_count_total * msm_count_at_transition_inverse - 1) * (-msm_count_zero_at_transition + 1); // degree 4
    // forces `msm_count_zero_at_transition` to have the following property at a syntactic transition: if
    // `msm_count_zero_at_transition == 1`, then `msm_count_total == 0`. else if `msm_count_zero_at_transition == 0`,
    // then `msm_count_total != 0` and is in fact the inverse of `msm_count_at_transition_inverse` (which is a witness
    // column).
    std::get<4>(accumulator) += msm_transition_check * msm_count_zero_at_transition_check * scaling_factor; // degree 6

    /**
     * @brief Validate `msm_transition` is well-formed.
     *
     * If the current row is the last `mul` instruction in a multiscalar multiplication, and if the putative MSM will
     * have a positive number of terms, then msm_transition = 1. i.e., if q_mul == 1 and q_mul_shift == 0, and
     * `msm_count_total:= msm_count + num_muls_in_row > 0`, then `msm_transition` = 1, else 0.
     */
    std::get<5>(accumulator) +=
        (msm_transition - msm_transition_check * (-msm_count_zero_at_transition + 1)) * scaling_factor; // degree 3

    /**
     * @brief Validate `msm_count` is 0 when we are not at a `mul` op.
     * msm_count tracks the number of scalar muls in the current active multiscalar multiplication.
     * (if no msm active, `msm_count == 0`)
     *
     * @note this in particular "resets" the msm_count when we are done with an msm.
     */

    std::get<6>(accumulator) += ((-q_mul + 1) * msm_count) * scaling_factor; // degree 2

    /**
     * @brief Validate `msm_count` updates correctly for mul operations.
     * msm_count updates by (!z1_zero + !z2_zero) if current op is a mul instruction with the point _not_ the
     * point-at-infinity and msm is not terminating at next row.
     */
    auto msm_count_delta = msm_count_shift - msm_count;
    std::get<7>(accumulator) += is_not_first_row * (-msm_transition + 1) * (msm_count_delta - q_mul * num_muls_in_row) *
                                scaling_factor; // degree 5

    /**
     * @brief Opcode exclusion tests. We have the following assertions:
     * 1. If q_mul = 1, (q_add, eq, reset) are zero
     * 2. If q_add = 1, (q_mul, eq, reset) are zero
     * 3. If q_eq =  1, (q_add, q_mul) are zero (is established by previous 2 checks)
     */
    auto opcode_exclusion_relation = q_mul * (q_add + q_eq + q_reset_accumulator);
    opcode_exclusion_relation += q_add * (q_mul + q_eq + q_reset_accumulator);
    std::get<8>(accumulator) += opcode_exclusion_relation * scaling_factor; // degree 2

    /**
     * @brief `eq` opcode.
     * Let lhs = transcript_P and rhs = transcript_accumulator
     * If eq = 1, we must validate the following cases:
     * IF lhs and rhs are not at infinity THEN lhs == rhs
     * ELSE lhs and rhs are BOTH points at infinity
     **/
    auto both_infinity = transcript_Pinfinity * is_accumulator_empty;                   // degree 2
    auto both_not_infinity = (-transcript_Pinfinity + 1) * (-is_accumulator_empty + 1); // degree 2
    auto infinity_exclusion_check =
        transcript_Pinfinity + is_accumulator_empty - both_infinity - both_infinity;             // degree 2
    auto eq_x_diff = transcript_Px - transcript_accumulator_x;                                   // degree 1
    auto eq_y_diff = transcript_Py - transcript_accumulator_y;                                   // degree 1
    auto eq_x_diff_relation = q_eq * (eq_x_diff * both_not_infinity + infinity_exclusion_check); // degree 4
    auto eq_y_diff_relation = q_eq * (eq_y_diff * both_not_infinity + infinity_exclusion_check); // degree 4
    std::get<9>(accumulator) += eq_x_diff_relation * scaling_factor;                             // degree 4
    std::get<10>(accumulator) += eq_y_diff_relation * scaling_factor;                            // degree 4

    /**
     * @brief Boundary conditions.
     * The first "content" row is the _second_ row of the table.
     *
     * We demand that the following values are present in this first content row:
     * `is_accumulator_empty == 1`; and
     * `msm_count == 0`.
     * We also demand that `pc == 0` at the last row.
     */
    std::get<11>(accumulator) += lagrange_second * (-is_accumulator_empty + 1) * scaling_factor;      // degree 2
    std::get<12>(accumulator) += (lagrange_second * msm_count + lagrange_last * pc) * scaling_factor; // degree 2

    /**
     * @brief On-curve validation checks.
     * If q_mul = 1 OR q_add = 1 OR q_eq = 1, require (transcript_Px, transcript_Py) is valid ecc point as long as the
     * point-at-infinity flag is off. As q_mul, q_add, and q_eq are pairwise mutually exclusive, the value `q_add +
     * q_mul + q_eq` is boolean.
     */
    const auto validate_on_curve = q_add + q_mul + q_eq;
    const auto on_curve_check =
        transcript_Py * transcript_Py - transcript_Px * transcript_Px * transcript_Px - get_curve_b();
    std::get<13>(accumulator) += validate_on_curve * on_curve_check * is_not_infinity * scaling_factor; // degree 5

    /**
     * @brief Validate relations from ECC Group Operations are well formed
     *
     */
    {
        // in the following, LHS is the new elliptic curve point and RHS is the accumulator. LHS can either be the
        // explicit point in an `add` op or the result of an MSM at the end of an MSM. RHS is often referred to as A.
        Accumulator transcript_lambda_relation(0);
        auto is_double = transcript_add_x_equal * transcript_add_y_equal; // degree 2
        // `is_add == 1` iff the op_code is `add` and the x-value of the point-to-add and the accumulator are _not_
        // equal. this ensures that it is not a double and that the result is not the point-at-infinity.
        auto is_add = -transcript_add_x_equal + 1; // degree 1
        // `add_result_is_infinity == 1` iff the op_code is `add`, the x-value of the point-to-add and the accumulator
        // are equal, and the y-values are unequal. then the result of the accumulation is of course the
        // point-at-infinity.
        auto add_result_is_infinity = transcript_add_x_equal * (-transcript_add_y_equal + 1); // degree 2
        auto rhs_x = transcript_accumulator_x;                                                // degree 1
        auto rhs_y = transcript_accumulator_y;                                                // degree 1
        auto out_x = transcript_accumulator_x_shift;                                          // degree 1
        auto out_y = transcript_accumulator_y_shift;                                          // degree 1
        auto lambda = transcript_add_lambda;                                                  // degree 1
        // note that `msm_transition` and `q_add` are mutually exclusive booleans. (they can also both be off.)
        // therefore `(lhs_x, lhs_y)` is either the point in the `add` VM instruction _or_ the output of the
        // just-completed MSM.
        auto lhs_x = transcript_Px * q_add + transcript_msm_x * msm_transition; // degree 2
        auto lhs_y = transcript_Py * q_add + transcript_msm_y * msm_transition; // degree 2
        // `lhs_infinity == 1` iff the point being added to the accumulator is the point-at-infinity.
        auto lhs_infinity = transcript_Pinfinity * q_add + transcript_msm_infinity * msm_transition; // degree 2
        auto rhs_infinity = is_accumulator_empty;                                                    // degree 1
        // `result_is_lhs == 1` iff the output of the operation is the LHS and is _not_ the point-at-infinity.
        // `result_is_rhs == 1` iff the output of the operation is the RHS and is _not_ the point-at-infinity.
        auto result_is_lhs = rhs_infinity * (-lhs_infinity + 1); // degree 2
        auto result_is_rhs = (-rhs_infinity + 1) * lhs_infinity; // degree 2
        // `result_infinity_from_inputs` checks if both the LHS && RHS are the point-at-infinity. this means that the
        // result is the point-at-infinity from "pure-thought" reasons from the inputs.
        auto result_infinity_from_inputs = lhs_infinity * rhs_infinity; // degree 2
        // `result_infinity_from_operation` tests if the operation is non-trivial and the output is the
        // point-at-infinity. note we are using that our EC has no non-trivial rational 2-torsion.
        auto result_infinity_from_operation = transcript_add_x_equal * (-transcript_add_y_equal + 1); // degree 2
        // `result_infinity_from_inputs` and `result_infinity_from_operation` are mutually exclusive (i.e., cannot both
        // be 1), so we can perform an OR by adding. (they are mutually exclusive because if
        // `result_infinity_from_inputs` then `transcript_add_y_equal == 1`.)
        auto result_is_infinity = result_infinity_from_inputs + result_infinity_from_operation; // degree 2
        auto any_add_is_active = q_add + msm_transition;                                        // degree 1

        // Valdiate `transcript_add_lambda` is well formed if we are adding MSM output into accumulator
        {
            Accumulator transcript_msm_lambda_relation(0);
            auto msm_x = transcript_msm_x;
            auto msm_y = transcript_msm_y;
            // Group operation is point addition
            {
                auto lambda_denominator = (rhs_x - msm_x);
                auto lambda_numerator = (rhs_y - msm_y);
                auto lambda_relation = lambda * lambda_denominator - lambda_numerator; // degree 2
                transcript_msm_lambda_relation += lambda_relation * is_add;            // degree 3
            }
            // Group operation is point doubling
            {
                auto lambda_denominator = msm_y + msm_y;
                auto lambda_numerator = msm_x * msm_x * 3;
                auto lambda_relation = lambda * lambda_denominator - lambda_numerator; // degree 2
                transcript_msm_lambda_relation += lambda_relation * is_double;         // degree 4
            }
            auto transcript_add_or_dbl_from_msm_output_is_valid =
                (-transcript_msm_infinity + 1) * (-is_accumulator_empty + 1); // degree 2
            // zero-out the value of `transcript_msm_lambda_relation` if output of MSM is point-at-infinity or the
            // accumulator is point-at-infinity. (this case cannot be handled uniformly and will be handled by the
            // following logic.)
            transcript_msm_lambda_relation *= transcript_add_or_dbl_from_msm_output_is_valid; // degree 6
            // No group operation because of points at infinity
            {
                // `lambda_relation_invalid != 0` means that lambda does not enter into our calculation for
                // point-at-infinity reasons. in this case, `lambda` is constrained to be 0.
                auto lambda_relation_invalid =
                    (transcript_msm_infinity + is_accumulator_empty + add_result_is_infinity); // degree 2
                auto lambda_relation = lambda * lambda_relation_invalid;                       // degree 4
                transcript_msm_lambda_relation += lambda_relation;                             // degree 6
            }
            // relation is only touched if we are at an msm_transition
            transcript_lambda_relation = transcript_msm_lambda_relation * msm_transition; // degree 7
        }
        // Valdiate `transcript_add_lambda` is well formed if we are adding base point into accumulator
        // very similar to the above code for adding an MSM output.
        {
            Accumulator transcript_add_lambda_relation(0);
            auto add_x = transcript_Px;
            auto add_y = transcript_Py;
            // Group operation is point addition
            {
                auto lambda_denominator = (rhs_x - add_x);
                auto lambda_numerator = (rhs_y - add_y);
                auto lambda_relation = lambda * lambda_denominator - lambda_numerator; // degree 2
                transcript_add_lambda_relation += lambda_relation * is_add;            // degree 3
            }
            // Group operation is point doubling
            {
                auto lambda_denominator = add_y + add_y;
                auto lambda_numerator = add_x * add_x * 3;
                auto lambda_relation = lambda * lambda_denominator - lambda_numerator; // degree 2
                transcript_add_lambda_relation += lambda_relation * is_double;         // degree 4
            }
            auto transcript_add_or_dbl_from_add_output_is_valid =
                (-transcript_Pinfinity + 1) * (-is_accumulator_empty + 1);                    // degree 2
            transcript_add_lambda_relation *= transcript_add_or_dbl_from_add_output_is_valid; // degree 6
            // No group operation because of points at infinity
            {
                // `lambda_relation_invalid != 0` means that lambda does not enter into our calculation for
                // point-at-infinity reasons. in this case, `lambda` is constrained to be 0.
                auto lambda_relation_invalid =
                    (transcript_Pinfinity + is_accumulator_empty + add_result_is_infinity); // degree 2
                auto lambda_relation = lambda * lambda_relation_invalid;                    // degree 4
                transcript_add_lambda_relation += lambda_relation;                          // degree 6
            }
            // relation is only touched if we are at an `add` instruction.
            transcript_lambda_relation += transcript_add_lambda_relation * q_add;
            std::get<14>(accumulator) += transcript_lambda_relation * scaling_factor; // degree 7
        }
        /**
         * @brief Validate transcript_accumulator_x_shift / transcript_accumulator_y_shift are well formed.
         *        Conditions (one of the following):
         *        1. The result of a group operation involving transcript_accumulator and msm_output (q_add = 1)
         *        2. The result of a group operation involving transcript_accumulator and transcript_P (msm_transition =
         * 1)
         *        3. Is equal to transcript_accumulator (no group operation, no reset)
         *        4. Is 0 (reset)
         *        5. all opcode values are 0
         */

        // accumulator is propagated if we are at a `mul` and _not_ at an `msm_transition` OR we are at an `eq` and we
        // don't reset the accumulator. note that if `msm_transition_check == 1` (i.e., we are at a syntactic
        // transition) but the total number of muls is 0, then the accumulator should indeed be propagated.
        auto propagate_transcript_accumulator =
            (q_mul) * (-msm_transition + 1) + (q_eq * (-q_reset_accumulator + 1)); // degree 2
        {
            auto lambda_sqr = lambda * lambda;

            // N.B. these relations rely on the fact that `lambda = 0` if we are not evaluating add/double formula
            // (i.e. one or both outputs are points at infinity, or produce a point at infinity)
            // This should be validated by the lambda_relation
            auto x3 = lambda_sqr - lhs_x - rhs_x;          // degree 2
            auto y3 = lambda * (lhs_x - out_x) - lhs_y;    // degree 3
            x3 += result_is_lhs * (rhs_x + lhs_x + lhs_x); // degree 4
            x3 += result_is_rhs * (lhs_x + rhs_x + rhs_x); // degree 4
            x3 += result_is_infinity * (lhs_x + rhs_x);    // degree 4
            y3 += result_is_lhs * (lhs_y + lhs_y);         // degree 4
            y3 += result_is_rhs * (lhs_y + rhs_y);         // degree 4
            y3 += result_is_infinity * lhs_y;              // degree 4
            // internal to the Transcript columns, the point-at-infinity is encoded as `(0, 0)`.
            // this is implicit in the subsequent computations: e.g. if `result_is_infinity`, then `(x3, y3) == (0, 0)`,
            // or if `q_reset_accumulator == 1`, then `(out_x, out_y) == (0, 0)`.
            auto add_point_x_relation = (x3 - out_x) * any_add_is_active; // degree 5
            add_point_x_relation +=
                propagate_transcript_accumulator * is_not_last_row * (out_x - transcript_accumulator_x); // degree 4
            // validate out_x = 0 if q_reset_accumulator = 1
            add_point_x_relation += (out_x * q_reset_accumulator);
            auto add_point_y_relation = (y3 - out_y) * any_add_is_active; // degree 5
            add_point_y_relation +=
                propagate_transcript_accumulator * is_not_last_row * (out_y - transcript_accumulator_y);
            // validate out_y = 0 if q_reset_accumulator = 1
            add_point_y_relation += (out_y * q_reset_accumulator);
            auto opcode_is_zero =
                (is_not_first_row) * (-q_add + 1) * (-q_mul + 1) * (-q_reset_accumulator + 1) * (-q_eq + 1); // degree 5
            add_point_x_relation += (out_x * opcode_is_zero);                                                // degree 6
            add_point_y_relation += (out_y * opcode_is_zero);                                                // degree 6

            std::get<15>(accumulator) += add_point_x_relation * scaling_factor; // degree 6
            std::get<16>(accumulator) += add_point_y_relation * scaling_factor; // degree 6
        }

        // subtract offset generator from msm_accumulator. this might produce a point at infinity
        {
            // the fundamental relation is: `(transcript_msm_x, transcript_msm_y) - offset ==
            // `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`. in other words, `(transcript_msm_x,
            // transcript_msm_y)` is the _shifted_ value of the MSM.
            const auto offset = offset_generator();
            const auto x1 = offset[0];
            const auto y1 = -offset[1];
            const auto x2 = View(in.transcript_msm_x);
            const auto y2 = View(in.transcript_msm_y);
            const auto x3 = View(in.transcript_msm_intermediate_x);
            const auto y3 = View(in.transcript_msm_intermediate_y);
            const auto transcript_msm_infinity = View(in.transcript_msm_infinity);
            // cases:
            // x2 == x1, y2 == y1
            // x2 != x1
            const auto x_term = (x3 + x2 + x1) * (x2 - x1) * (x2 - x1) - (y2 - y1) * (y2 - y1); // degree 3
            const auto y_term = (x1 - x3) * (y2 - y1) - (x2 - x1) * (y1 + y3);                  // degree 2
            // If `transcript_msm_infinity == 0`, then `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`
            // is the result of subtracting offset generator from `(transcript_msm_x, transcript_msm_y)`. If
            // `transcript_msm_infinity == 1`, then both `transcript_msm_intermediate_x ==0` and
            // `transcript_msm_intermediate_y == 0`.
            //
            // again, point-at-infinity is represented internally in the Transcript columns by `(0, 0)`.
            const auto transcript_offset_generator_subtract_x =
                x_term * (-transcript_msm_infinity + 1) + transcript_msm_infinity * x3; // degree 4
            const auto transcript_offset_generator_subtract_y =
                y_term * (-transcript_msm_infinity + 1) + transcript_msm_infinity * y3; // degree 3
            std::get<17>(accumulator) +=
                msm_transition * transcript_offset_generator_subtract_x * scaling_factor; // degree 5
            std::get<18>(accumulator) +=
                msm_transition * transcript_offset_generator_subtract_y * scaling_factor; // degree 5

            // validate `transcript_msm_infinity` is correct
            // if `transcript_msm_infinity == 1`, then both `x2 == x1` and `y2 + y1 == 0`. (this is because `(x1, y1)`
            // is the negative of the offset.)
            const auto x_diff = x2 - x1;
            const auto y_sum = y2 + y1;
            std::get<19>(accumulator) += msm_transition * transcript_msm_infinity * x_diff * scaling_factor; // degree 3
            std::get<20>(accumulator) += msm_transition * transcript_msm_infinity * y_sum * scaling_factor;  // degree 3
            // if `transcript_msm_infinity == 0`, then `x_diff` must have an inverse
            const auto transcript_msm_x_inverse = View(in.transcript_msm_x_inverse);
            const auto inverse_term = (-transcript_msm_infinity + 1) * (x_diff * transcript_msm_x_inverse - 1);
            std::get<21>(accumulator) += msm_transition * inverse_term * scaling_factor; // degree 3
        }

        /**
         * @brief Validate `is_accumulator_empty` is updated correctly
         * An add operation can produce a point at infinity
         * Resetting the accumulator produces a point at infinity
         * If we are not adding, performing an msm or resetting the accumulator (or doing a no-op),
         * is_accumulator_empty should not update
         */
        auto accumulator_infinity_preserve_flag = propagate_transcript_accumulator; // degree 1
        auto accumulator_infinity_preserve = accumulator_infinity_preserve_flag *
                                             (is_accumulator_empty - is_accumulator_empty_shift) *
                                             is_not_first_or_last_row;                               // degree 3
        auto accumulator_infinity_q_reset = q_reset_accumulator * (-is_accumulator_empty_shift + 1); // degree 2
        auto accumulator_infinity_from_add =
            any_add_is_active * (result_is_infinity - is_accumulator_empty_shift); // degree 3
        auto accumulator_infinity_relation =
            accumulator_infinity_preserve +
            (accumulator_infinity_q_reset + accumulator_infinity_from_add) * is_not_first_row; // degree 4
        std::get<22>(accumulator) += accumulator_infinity_relation * scaling_factor;           // degree 4

        /**
         * @brief Validate `transcript_add_x_equal` is well-formed
         *        If lhs_x == rhs_x, transcript_add_x_equal = 1
         *        If transcript_add_x_equal = 0, a valid inverse must exist for (lhs_x - rhs_x)
         */
        auto x_diff = lhs_x - rhs_x; // degree 2
        // recall that transcript_Px_inverse is the claimed inverse of `x_diff`.
        auto x_product = transcript_Px_inverse * (-transcript_add_x_equal + 1) + transcript_add_x_equal;    // degree 2
        auto x_constant = transcript_add_x_equal - 1;                                                       // degree 1
        auto transcript_add_x_equal_check_relation = (x_diff * x_product + x_constant) * any_add_is_active; // degree 5
        std::get<23>(accumulator) += transcript_add_x_equal_check_relation * scaling_factor;                // degree 5

        /**
         * @brief Validate `transcript_add_y_equal` is well-formed
         *        If lhs_y == rhs_y, transcript_add_y_equal = 1
         *        If transcript_add_y_equal = 0, a valid inverse must exist for (lhs_y - rhs_y)
         */
        auto y_diff = lhs_y - rhs_y;
        auto y_product = transcript_Py_inverse * (-transcript_add_y_equal + 1) + transcript_add_y_equal;
        auto y_constant = transcript_add_y_equal - 1;
        auto transcript_add_y_equal_check_relation = (y_diff * y_product + y_constant) * any_add_is_active;
        std::get<24>(accumulator) += transcript_add_y_equal_check_relation * scaling_factor; // degree 5
    }
}
} // namespace bb

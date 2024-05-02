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

    auto z1 = View(in.transcript_z1);
    auto z2 = View(in.transcript_z2);
    auto z1_zero = View(in.transcript_z1zero);
    auto z2_zero = View(in.transcript_z2zero);
    auto op = View(in.transcript_op);
    auto q_add = View(in.transcript_add);
    auto q_mul = View(in.transcript_mul);
    auto q_mul_shift = View(in.transcript_mul_shift);
    auto q_eq = View(in.transcript_eq);
    auto msm_transition = View(in.transcript_msm_transition);
    auto msm_count = View(in.transcript_msm_count);
    auto msm_count_shift = View(in.transcript_msm_count_shift);
    auto pc = View(in.transcript_pc);
    auto pc_shift = View(in.transcript_pc_shift);
    auto transcript_accumulator_x_shift = View(in.transcript_accumulator_x_shift);
    auto transcript_accumulator_y_shift = View(in.transcript_accumulator_y_shift);
    auto transcript_accumulator_x = View(in.transcript_accumulator_x);
    auto transcript_accumulator_y = View(in.transcript_accumulator_y);
    auto transcript_msm_x = View(in.transcript_msm_x);
    auto transcript_msm_y = View(in.transcript_msm_y);
    auto transcript_Px = View(in.transcript_Px);
    auto transcript_Py = View(in.transcript_Py);
    auto is_accumulator_empty = View(in.transcript_accumulator_empty);
    auto lagrange_first = View(in.lagrange_first);
    auto lagrange_last = View(in.lagrange_last);
    auto is_accumulator_empty_shift = View(in.transcript_accumulator_empty_shift);
    auto q_reset_accumulator = View(in.transcript_reset_accumulator);
    auto lagrange_second = View(in.lagrange_second);
    auto transcript_Pinfinity = View(in.transcript_base_infinity);
    auto transcript_Px_inverse = View(in.transcript_base_x_inverse);
    auto transcript_Py_inverse = View(in.transcript_base_y_inverse);
    auto transcript_add_x_equal = View(in.transcript_add_x_equal);
    auto transcript_add_y_equal = View(in.transcript_add_y_equal);
    auto transcript_add_lambda = View(in.transcript_add_lambda);

    auto is_not_first_row = (-lagrange_first + 1);
    auto is_not_first_or_last_row = (-lagrange_first + -lagrange_last + 1);
    auto is_not_infinity = (-transcript_Pinfinity + 1);

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
    std::get<0>(accumulator) += (z1 * z1_zero) * scaling_factor; // if z1_zero = 1, z1 must be 0
    std::get<1>(accumulator) += (z2 * z2_zero) * scaling_factor;

    /**
     * @brief Validate `op` opcode is well formed.
     * `op` is defined to be q_reset_accumulator + 2 * q_eq + 4 * q_mul + 8 * q_add,
     * where q_reset_accumulator, q_eq, q_mul, q_add are all boolean
     * (TODO: bool constrain these efficiently #2223)
     */
    auto tmp = q_add + q_add;
    tmp += q_mul;
    tmp += tmp;
    tmp += q_eq;
    tmp += tmp;
    tmp += q_reset_accumulator;
    std::get<2>(accumulator) += (tmp - op) * scaling_factor;

    /**
     * @brief Validate `pc` is updated correctly.
     * pc stands for Point Counter. It decrements by 1 for every 128-bit multiplication operation.
     * If q_mul = 1, pc decrements by !z1_zero + !z2_zero, else pc decrements by 0
     * @note pc starts out at its max value and decrements down to 0. This keeps the degree of the pc polynomial smol
     */
    Accumulator pc_delta = pc - pc_shift;
    std::get<3>(accumulator) +=
        is_not_first_row * (pc_delta - q_mul * ((-z1_zero + 1) + (-z2_zero + 1))) * scaling_factor;

    /**
     * @brief Validate `msm_transition` is well-formed.
     *
     * If the current row is the last mul instruction in a multiscalar multiplication, msm_transition = 1.
     * i.e. if q_mul == 1 and q_mul_shift == 0, msm_transition = 1, else is 0
     */
    auto msm_transition_check = q_mul * (-q_mul_shift + 1);
    std::get<4>(accumulator) += (msm_transition - msm_transition_check) * scaling_factor;

    /**
     * @brief Validate `msm_count` resets when we end a multiscalar multiplication.
     * msm_count tracks the number of scalar muls in the current active multiscalar multiplication.
     * (if no msm active, msm_count == 0)
     * If current row ends an MSM, `msm_count_shift = 0` (msm_count value at next row)
     */
    std::get<5>(accumulator) += (msm_transition * msm_count_shift) * scaling_factor;

    /**
     * @brief Validate `msm_count` updates correctly for mul operations.
     * msm_count updates by (!z1_zero + !z2_zero) if current op is a mul instruction (and msm is not terminating at next
     * row).
     */
    auto msm_count_delta = msm_count_shift - msm_count; // degree 4
    std::get<6>(accumulator) += is_not_first_row * (-msm_transition + 1) *
                                (msm_count_delta - q_mul * ((-z1_zero + 1) + (-z2_zero + 1))) * scaling_factor;

    /**
     * @brief Opcode exclusion tests. We have the following assertions:
     * 1. If q_mul = 1, (q_add, eq, reset) are zero
     * 2. If q_reset = 1, is_accumulator_empty at next row = 1
     * 3. If q_add = 1 OR msm_transition = 1, is_accumulator_empty at next row = 0
     * 4. If q_add = 0 AND msm_transition = 0 AND q_reset_accumulator = 0, is_accumulator at next row = current row
     * value
     * @note point 3: both q_add = 1, msm_transition = 1 cannot occur because of point 1 (msm_transition only 1 when
     * q_mul 1) we can use a slightly more efficient relation than a pure binary OR
     */
    std::get<7>(accumulator) += q_mul * (q_add + q_eq + q_reset_accumulator) * scaling_factor;
    std::get<8>(accumulator) += q_add * (q_mul + q_eq + q_reset_accumulator) * scaling_factor;
    std::get<9>(accumulator) += q_reset_accumulator * (-is_accumulator_empty_shift + 1) * scaling_factor;
    // std::get<18>(accumulator) += (q_add + msm_transition) * is_accumulator_empty_shift * scaling_factor;
    auto accumulator_state_not_modified = -(q_add + msm_transition + q_reset_accumulator) + 1;
    std::get<10>(accumulator) += accumulator_state_not_modified * is_not_first_or_last_row *
                                 (is_accumulator_empty_shift - is_accumulator_empty) * scaling_factor;

    /**
     * @brief `eq` opcode.
     * Let lhs = transcript_P and rhs = transcript_accumulator
     * If eq = 1, we must validate the following cases:
     * IF lhs and rhs are not at infinity THEN lhs == rhs
     * ELSE lhs and rhs are BOTH points at infinity
     **/
    auto both_infinity = transcript_Pinfinity * is_accumulator_empty;
    auto both_not_infinity = (-transcript_Pinfinity + 1) * (-is_accumulator_empty + 1);
    auto infinity_exclusion_check = transcript_Pinfinity + is_accumulator_empty - both_infinity - both_infinity;
    auto eq_x_diff = transcript_Px - transcript_accumulator_x;
    auto eq_y_diff = transcript_Py - transcript_accumulator_y;
    auto eq_x_diff_relation = q_eq * (eq_x_diff * both_not_infinity + infinity_exclusion_check); // degree 4
    auto eq_y_diff_relation = q_eq * (eq_y_diff * both_not_infinity + infinity_exclusion_check); // degree 4
    std::get<11>(accumulator) += eq_x_diff_relation * scaling_factor;

    std::get<12>(accumulator) += eq_y_diff_relation * scaling_factor;

    /**
     * @brief Initial condition check on 1st row.
     * We require the following values are 0 on 1st row:
     * is_accumulator_empty = 1
     * msm_count = 0
     * note...actually second row? bleurgh
     * NOTE: we want pc = 0 at lagrange_last :o
     */
    std::get<13>(accumulator) += lagrange_second * (-is_accumulator_empty + 1) * scaling_factor;
    std::get<14>(accumulator) += lagrange_second * msm_count * scaling_factor;

    /**
     * @brief On-curve validation checks.
     * If q_mul = 1 OR q_add = 1 OR q_eq = 1, require (transcript_Px, transcript_Py) is valid ecc point
     * q_mul/q_add/q_eq mutually exclusive, can represent as sum of 3
     */
    const auto validate_on_curve = q_mul + q_add + q_mul + q_eq;
    const auto on_curve_check =
        transcript_Py * transcript_Py - transcript_Px * transcript_Px * transcript_Px - get_curve_b();
    std::get<15>(accumulator) += validate_on_curve * on_curve_check * is_not_infinity * scaling_factor; // degree 6

    /**
     * @brief Validate correctness of ECC Group Operation
     * An ECC group operation is performed if q_add = 1 or msm_transition = 1.
     * Because input points can be points at infinity, we must support COMPLETE addition and handle points at infinity
     */
    // define the lhs point: either transcript_Px/y or transcript_accumulator_x/y
    auto lhs_x = transcript_Px * q_add + transcript_msm_x * msm_transition;
    auto lhs_y = transcript_Py * q_add + transcript_msm_y * msm_transition;
    // the rhs point will always be the accumulator point at the next row in the trace
    auto rhs_x = transcript_accumulator_x;
    auto rhs_y = transcript_accumulator_y;
    // the group operation will be either an ADD or a DOUBLE depending on whether x/y coordinates of lhs/rhs match.
    // If lhs_x == rhs_x, we evaluate a DOUBLE, otherwise an ADD
    // (we will only activate this relation if lhs_y != rhs_y, but this is done later)
    auto ecc_op_is_dbl = transcript_add_x_equal;
    auto ecc_op_is_add = (-transcript_add_x_equal + 1);
    // Are the lhs/rhs points at infinity?
    // MSM output CANNOT be point at infinity without triggering unsatisfiable constraints in msm_relation
    // lhs can only be at infinity if q_add is active
    auto lhs_infinity = transcript_Pinfinity * q_add;
    auto rhs_infinity = is_accumulator_empty;
    // Determine where the group operation output is sourced from
    // | lhs_infinity | rhs_infinity | lhs_x == rhs_x && lhs_y != rhs_y | output    |
    // | ------------ | ------------ | -------------------------------- | --------- |
    // |            0 |            0 |                                0 | lhs + rhs |
    // |            0 |            0 |                                1 | infinity  |
    // |            0 |            1 |                              n/a | lhs       |
    // |            1 |            0 |                              n/a | rhs       |
    // |            1 |            1 |                              n/a | infinity  |
    auto add_result_is_lhs = rhs_infinity * (-lhs_infinity + 1);                                        // degree 3
    auto add_result_is_rhs = lhs_infinity * (-rhs_infinity + 1);                                        // degree 3
    auto add_result_is_out = (-lhs_infinity + 1) * (-rhs_infinity + 1);                                 // degree 3
    auto add_result_infinity_from_inputs = lhs_infinity * rhs_infinity;                                 // degree 2
    auto add_result_infinity_from_operation = transcript_add_x_equal * (-transcript_add_y_equal + 1);   // degree 2
    auto add_result_is_infinity = add_result_infinity_from_inputs + add_result_infinity_from_operation; // degree 2??

    // Determine the gradient `lambda` of the group operation
    // If lhs_x == rhs_x, lambda = (3 * lhs_x * lhs_x) / (2 * lhs_y)
    // Else, lambda = (rhs_y - lhs_y) / (rhs_x - lhs_x)
    auto lhs_xx = lhs_x * lhs_x;
    auto lambda_numerator = (rhs_y - lhs_y) * ecc_op_is_add + (lhs_xx + lhs_xx + lhs_xx) * ecc_op_is_dbl;
    auto lambda_denominator = (rhs_x - lhs_x) * ecc_op_is_add + (lhs_y + lhs_y) * ecc_op_is_dbl; // degree 3
    auto lambda_term = lambda_denominator * transcript_add_lambda - lambda_numerator;            // degree 4
    // We only activate lambda relation if we don't have points at infinity - this is to avoid divide-by-zero problems
    // N.B. check this is needed
    auto any_add_is_active = q_add + msm_transition;
    auto lambda_relation_active = any_add_is_active * add_result_is_out; // degree 4
    auto lambda_relation = lambda_term * lambda_relation_active;         // degree 8!
    std::get<16>(accumulator) += lambda_relation * scaling_factor;       // degree 8

    // Determine the x/y coordinates of the shifted accumulator
    // add_x3/add_y3 = result of group operation computation
    auto add_x3 = transcript_add_lambda * transcript_add_lambda - lhs_x - rhs_x; // degree 2
    auto add_y3 = transcript_add_lambda * (lhs_x - add_x3) - lhs_y;              // degree 3
    // x3/y3 = result of group operation computation that considers input points at infinity
    auto x3 = (add_x3 * add_result_is_out + lhs_x * add_result_is_lhs + rhs_x * add_result_is_rhs); // degree 5
    auto y3 = (add_y3 * add_result_is_out + lhs_y * add_result_is_lhs + rhs_y * add_result_is_rhs); // degree 6

    auto propagate_transcript_accumulator = (-q_add - msm_transition - q_reset_accumulator + 1);
    auto add_point_x_relation =
        (x3 - transcript_accumulator_x_shift * (add_result_is_out + add_result_is_lhs + add_result_is_rhs)) *
        any_add_is_active; // degree 7
    add_point_x_relation += propagate_transcript_accumulator * (-lagrange_last + 1) *
                            (transcript_accumulator_x_shift - transcript_accumulator_x);
    auto add_point_y_relation =
        (y3 - transcript_accumulator_y_shift * (add_result_is_out + add_result_is_lhs + add_result_is_rhs)) *
        any_add_is_active; // degree 7
    add_point_y_relation += propagate_transcript_accumulator * (-lagrange_last + 1) *
                            (transcript_accumulator_y_shift - transcript_accumulator_y);
    std::get<17>(accumulator) += add_point_x_relation * scaling_factor; // degree 7
    std::get<18>(accumulator) += add_point_y_relation * scaling_factor; // degree 8

    /**
     * @brief Validate `is_accumulator_empty` is updated correctly
     * An add operation can produce a point at infinity
     * Resetting the accumulator produces a point at infinity
     * If we are not adding, performing an msm or resetting the accumulator, is_accumulator_empty should not update
     */
    auto accumulator_infinity_preserve_flag = (-(q_add + msm_transition + q_reset_accumulator) + 1);
    auto accumulator_infinity_preserve =
        accumulator_infinity_preserve_flag * (is_accumulator_empty - is_accumulator_empty_shift) * (-lagrange_last + 1);
    auto accumulator_infinity_q_reset = q_reset_accumulator * (-is_accumulator_empty_shift + 1);
    auto accumulator_infinity_from_add = any_add_is_active * (add_result_is_infinity - is_accumulator_empty_shift);
    auto accumulator_infinity_relation =
        accumulator_infinity_preserve + accumulator_infinity_q_reset + accumulator_infinity_from_add;
    std::get<19>(accumulator) += (accumulator_infinity_relation * is_not_first_row) * scaling_factor; // degree 5?

    /**
     * @brief Validate `transcript_add_x_equal` is well-formed
     *        If lhs_x == rhs_x, transcript_add_x_equal = 1
     *        If transcript_add_x_equal = 0, a valid inverse must exist for (lhs_x - rhs_x)
     */
    auto x_diff = lhs_x - rhs_x;
    auto x_product = transcript_Px_inverse * (-transcript_add_x_equal + 1) + transcript_add_x_equal;
    auto x_constant = transcript_add_x_equal - 1;
    auto transcript_add_x_equal_check_relation = (x_diff * x_product + x_constant) * any_add_is_active;
    std::get<20>(accumulator) += transcript_add_x_equal_check_relation * scaling_factor; // degree 6

    /**
     * @brief Validate `transcript_add_y_equal` is well-formed
     *        If lhs_y == rhs_y, transcript_add_y_equal = 1
     *        If transcript_add_y_equal = 0, a valid inverse must exist for (lhs_y - rhs_y)
     */
    auto y_diff = lhs_y - rhs_y;
    auto y_product = transcript_Py_inverse * (-transcript_add_y_equal + 1) + transcript_add_y_equal;
    auto y_constant = transcript_add_y_equal - 1;
    auto transcript_add_y_equal_check_relation = (y_diff * y_product + y_constant) * any_add_is_active;
    std::get<21>(accumulator) += transcript_add_y_equal_check_relation * scaling_factor; // degree 6

    // validate selectors are boolean (put somewhere else? these are low degree)
    std::get<22>(accumulator) += q_eq * (q_eq - 1) * scaling_factor;
    std::get<23>(accumulator) += q_add * (q_add - 1) * scaling_factor;
    std::get<24>(accumulator) += q_mul * (q_mul - 1) * scaling_factor;
    std::get<25>(accumulator) += q_reset_accumulator * (q_reset_accumulator - 1) * scaling_factor;
    std::get<26>(accumulator) += msm_transition * (msm_transition - 1) * scaling_factor;
    std::get<27>(accumulator) += is_accumulator_empty * (is_accumulator_empty - 1) * scaling_factor;
    std::get<28>(accumulator) += z1_zero * (z1_zero - 1) * scaling_factor;
    std::get<29>(accumulator) += z2_zero * (z2_zero - 1) * scaling_factor;
    std::get<30>(accumulator) += transcript_add_x_equal * (transcript_add_x_equal - 1) * scaling_factor;
    std::get<31>(accumulator) += transcript_add_y_equal * (transcript_add_y_equal - 1) * scaling_factor;
    std::get<32>(accumulator) += transcript_Pinfinity * (transcript_Pinfinity - 1) * scaling_factor;
}

template class ECCVMTranscriptRelationImpl<grumpkin::fr>;
DEFINE_SUMCHECK_RELATION_CLASS(ECCVMTranscriptRelationImpl, ECCVMFlavor);

} // namespace bb

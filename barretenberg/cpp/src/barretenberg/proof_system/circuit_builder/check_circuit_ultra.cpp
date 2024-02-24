#include "check_circuit_ultra.hpp"
#include <barretenberg/plonk/proof_system/constants.hpp>
#include <unordered_map>
#include <unordered_set>

namespace bb {

// Various methods relating to circuit evaluation

/**
 * @brief Arithmetic gate-related methods
 *
 * @details The whole formula without alpha scaling is:
 *
 * q_arith * ( ( (-1/2) * (q_arith - 3) * q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c ) +
 * (q_arith - 1)*( α * (q_arith - 2) * (w_1 + w_4 - w_1_omega + q_m) + w_4_omega) ) = 0
 *
 * This formula results in several cases depending on q_arith:
 * 1. q_arith == 0: Arithmetic gate is completely disabled
 *
 * 2. q_arith == 1: Everything in the minigate on the right is disabled. The equation is just a standard plonk equation
 * with extra wires: q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c = 0
 *
 * 3. q_arith == 2: The (w_1 + w_4 - ...) term is disabled. THe equation is:
 * (1/2) * q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + w_4_omega = 0
 * It allows defining w_4 at next index (w_4_omega) in terms of current wire values
 *
 * 4. q_arith == 3: The product of w_1 and w_2 is disabled, but a mini addition gate is enabled. α² allows us to split
 * the equation into two:
 *
 * q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + 2 * w_4_omega = 0
 *
 * w_1 + w_4 - w_1_omega + q_m = 0  (we are reusing q_m here)
 *
 * 5. q_arith > 3: The product of w_1 and w_2 is scaled by (q_arith - 3), while the w_4_omega term is scaled by (q_arith
 * - 1). The equation can be split into two:
 *
 * (q_arith - 3)* q_m * w_1 * w_ 2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + (q_arith - 1) * w_4_omega = 0
 *
 * w_1 + w_4 - w_1_omega + q_m = 0
 *
 * The problem that q_m is used both in both equations can be dealt with by appropriately changing selector values at
 * the next gate. Then we can treat (q_arith - 1) as a simulated q_6 selector and scale q_m to handle (q_arith - 3) at
 * product.
 *
 * Uses only the alpha challenge
 *
 */

/**
 * @brief Compute the arithmetic relation/gate evaluation base on given selector and witness evaluations
 *
 * @details We need this function because in ultra we have committed and non-committed gates (for example RAM and ROM).
 * However, we'd still like to evaluate all of them, so we can't access selectors and witness values directly.
 *
 * You can scroll up to look at the description of the general logic of this gate
 *
 * @param q_arith_value
 * @param q_1_value
 * @param q_2_value
 * @param q_3_value
 * @param q_4_value
 * @param q_m_value
 * @param q_c_value
 * @param w_1_value
 * @param w_2_value
 * @param w_3_value
 * @param w_4_value
 * @param w_1_shifted_value
 * @param w_4_shifted_value
 * @param alpha_base
 * @param alpha
 * @return fr
 */

    UltraCircuitChecker::FF UltraCircuitChecker::compute_arithmetic_identity(
    UltraCircuitChecker::FF q_arith_value,
    UltraCircuitChecker::FF q_1_value,
    UltraCircuitChecker::FF q_2_value,
    UltraCircuitChecker::FF q_3_value,
    UltraCircuitChecker::FF q_4_value,
    UltraCircuitChecker::FF q_m_value,
    UltraCircuitChecker::FF q_c_value,
    UltraCircuitChecker::FF w_1_value,
    UltraCircuitChecker::FF w_2_value,
    UltraCircuitChecker::FF w_3_value,
    UltraCircuitChecker::FF w_4_value,
    UltraCircuitChecker::FF w_1_shifted_value,
    UltraCircuitChecker::FF w_4_shifted_value,
    UltraCircuitChecker::FF alpha_base,
    UltraCircuitChecker::FF alpha)
{
    constexpr FF neg_half = FF(-2).invert();
    // The main arithmetic identity that gets activated for q_arith_value == 1
    FF arithmetic_identity = w_2_value;
    arithmetic_identity *= q_m_value;
    arithmetic_identity *= (q_arith_value - 3);
    arithmetic_identity *= neg_half;
    arithmetic_identity += q_1_value;
    arithmetic_identity *= w_1_value;
    arithmetic_identity += (w_2_value * q_2_value);
    arithmetic_identity += (w_3_value * q_3_value);
    arithmetic_identity += (w_4_value * q_4_value);
    arithmetic_identity += q_c_value;

    // The additional small addition identity
    FF extra_small_addition_identity = w_1_value + w_4_value - w_1_shifted_value + q_m_value;
    extra_small_addition_identity *= alpha;
    extra_small_addition_identity *= (q_arith_value - 2);

    // The concatenation of small addition identity + shifted w_4 value that can be enabled separately + the main
    // arithemtic identity
    FF final_identity = extra_small_addition_identity + w_4_shifted_value;
    final_identity *= (q_arith_value - 1);
    final_identity += arithmetic_identity;
    final_identity *= q_arith_value;
    final_identity *= alpha_base;
    return final_identity;
}

/**
 * @brief General permutation sorting identity
 *
 * @details This identity binds together the values of witnesses on the same row (w_1, w_2, w_3, w_4) and the w_1
 * witness on the next row (w_1_shifted) so that the difference between 2 consecutive elements is in the set {0,1,2,3}
 *
 */

/**
 * @brief Compute a single general permutation sorting identity
 *
 * @param w_1_value
 * @param w_2_value
 * @param w_3_value
 * @param w_4_value
 * @param w_1_shifted_value
 * @param alpha_base
 * @param alpha
 * @return fr
 */
UltraCircuitChecker::FF UltraCircuitChecker::compute_genperm_sort_identity(
    UltraCircuitChecker::FF q_sort_value,
    UltraCircuitChecker::FF w_1_value,
    UltraCircuitChecker::FF w_2_value,
    UltraCircuitChecker::FF w_3_value,
    UltraCircuitChecker::FF w_4_value,
    UltraCircuitChecker::FF w_1_shifted_value,
    UltraCircuitChecker::FF alpha_base,
    UltraCircuitChecker::FF alpha)
{
    // Power of alpha to separate individual delta relations
    // TODO(kesha): This is a repeated computation which can be efficiently optimized
    const FF alpha_a = alpha_base;
    const FF alpha_b = alpha_a * alpha;
    const FF alpha_c = alpha_b * alpha;
    const FF alpha_d = alpha_c * alpha;

    // (second - first)*(second - first - 1)*(second - first - 2)*(second - first - 3)
    auto neighbour_difference = [](const FF first, const FF second) {
        constexpr FF minus_two(-2);
        constexpr FF minus_three(-3);
        const FF delta = second - first;
        return (delta.sqr() - delta) * (delta + minus_two) * (delta + minus_three);
    };

    return q_sort_value * (alpha_a * neighbour_difference(w_1_value, w_2_value) +
                           alpha_b * neighbour_difference(w_2_value, w_3_value) +
                           alpha_c * neighbour_difference(w_3_value, w_4_value) +
                           alpha_d * neighbour_difference(w_4_value, w_1_shifted_value));
}

/**
 * @brief Elliptic curve identity gate methods implement elliptic curve point addition.
 *
 *
 * @details The basic equation for the elliptic curve in short weierstrass form is y^2 == x^3 + a * x + b.
 *
 * The addition formulas are:
 *    λ = (y_2 - y_1) / (x_2 - x_1)
 *    x_3 = λ^2 - x_2 - x_1 = (y_2 - y_1)^2 / (x_2 - x_1)^2 - x_2 - x_1 = ((y_2 - y_1)^2 - (x_2 - x_1) * (x_2^2 -
 * x_1^2)) / (x_2 - x_1)^2
 *
 * If we assume that the points being added are distinct and not invereses of each other (so their x coordinates
 * differ), then we can rephrase this equality:
 *    x_3 * (x_2 - x_1)^2 = ((y_2 - y_1)^2 - (x_2 - x_1) * (x_2^2 - x_1^2))
 */

/**
 * @brief Compute the identity of the arithmetic gate given all coefficients
 *
 * @param q_1_value 1 or -1 (the sign). Controls whether we are subtracting or adding the second point
 * @param w_2_value x₁
 * @param w_3_value y₁
 * @param w_1_shifted_value x₂
 * @param w_2_shifted_value y₂
 * @param w_3_shifted_value x₃
 * @param w_4_shifted_value y₃
 * @return fr
 */
UltraCircuitChecker::FF UltraCircuitChecker::compute_elliptic_identity(
    UltraCircuitChecker::FF q_elliptic_value,
    UltraCircuitChecker::FF q_1_value,
    UltraCircuitChecker::FF q_m_value,
    UltraCircuitChecker::FF w_2_value,
    UltraCircuitChecker::FF w_3_value,
    UltraCircuitChecker::FF w_1_shifted_value,
    UltraCircuitChecker::FF w_2_shifted_value,
    UltraCircuitChecker::FF w_3_shifted_value,
    UltraCircuitChecker::FF w_4_shifted_value,
    UltraCircuitChecker::FF alpha_base,
    UltraCircuitChecker::FF alpha)
{
    const FF x_1 = w_2_value;
    const FF y_1 = w_3_value;
    const FF x_2 = w_1_shifted_value;
    const FF y_2 = w_4_shifted_value;
    const FF x_3 = w_2_shifted_value;
    const FF y_3 = w_3_shifted_value;
    const FF q_sign = q_1_value;
    const FF q_is_double = q_m_value;
    constexpr FF curve_b = CircuitBuilderBase<UltraArith<FF>>::EmbeddedCurve::Group::curve_b;
    static_assert(CircuitBuilderBase<UltraArith<FF>>::EmbeddedCurve::Group::curve_a == 0);

    FF x_diff = x_2 - x_1;
    FF y1_sqr = y_1.sqr();
    FF y2_sqr = y_2.sqr();
    FF y1y2 = y_1 * y_2 * q_sign;
    FF x_relation_add = (x_3 + x_2 + x_1) * x_diff.sqr() - y1_sqr - y2_sqr + y1y2 + y1y2;
    FF y_relation_add = (y_3 + y_1) * x_diff + (x_3 - x_1) * (y_2 * q_sign - y_1);

    x_relation_add *= (-q_is_double + 1) * alpha_base * alpha;
    y_relation_add *= (-q_is_double + 1) * alpha_base * alpha;

    // x-coordinate relation
    // (x3 + 2x1)(4y^2) - (9x^4) = 0
    // This is degree 4...but
    // we can use x^3 = y^2 - b
    // (x3 + 2x1)(4y ^ 2) - (9x(y ^ 2 - b)) is degree 3
    const FF x_pow_4 = (y_1 * y_1 - curve_b) * x_1;
    FF x_relation_double = (x_3 + x_1 + x_1) * (y_1 + y_1) * (y_1 + y_1) - x_pow_4 * FF(9);

    // Y relation: (x1 - x3)(3x^2) - (2y1)(y1 + y3) = 0
    const FF x_pow_2 = (x_1 * x_1);
    FF y_relation_double = x_pow_2 * (x_1 - x_3) * 3 - (y_1 + y_1) * (y_1 + y_3);

    x_relation_double *= q_is_double * alpha_base;
    y_relation_double *= q_is_double * alpha_base * alpha;

    return q_elliptic_value * (x_relation_add + y_relation_add + x_relation_double + y_relation_double);
}

/**
 * @brief Plookup Auxiliary Gate Identity
 *
 * @details Evaluates polynomial identities associated with the following Ultra custom gates:
 *  * RAM/ROM read-write consistency check
 *  * RAM timestamp difference consistency check
 *  * RAM/ROM index difference consistency check
 *  * Bigfield product evaluation (3 in total)
 *  * Bigfield limb accumulation (2 in total)
 *
 * Multiple selectors are used to 'switch' aux gates on/off according to the following pattern:
 *
 * | gate type                    | q_aux | q_1 | q_2 | q_3 | q_4 | q_m | q_c | q_arith |
 * | ---------------------------- | ----- | --- | --- | --- | --- | --- | --- | ------  |
 * | Bigfield Limb Accumulation 1 | 1     | 0   | 0   | 1   | 1   | 0   | --- | 0       |
 * | Bigfield Limb Accumulation 2 | 1     | 0   | 0   | 1   | 0   | 1   | --- | 0       |
 * | Bigfield Product 1           | 1     | 0   | 1   | 1   | 0   | 0   | --- | 0       |
 * | Bigfield Product 2           | 1     | 0   | 1   | 0   | 1   | 0   | --- | 0       |
 * | Bigfield Product 3           | 1     | 0   | 1   | 0   | 0   | 1   | --- | 0       |
 * | RAM/ROM access gate          | 1     | 1   | 0   | 0   | 0   | 1   | --- | 0       |
 * | RAM timestamp check          | 1     | 1   | 0   | 0   | 1   | 0   | --- | 0       |
 * | ROM consistency check        | 1     | 1   | 1   | 0   | 0   | 0   | --- | 0       |
 * | RAM consistency check        | 1     | 0   | 0   | 0   | 0   | 0   | 0   | 1       |
 *
 * N.B. The RAM consistency check identity is degree 3. To keep the overall quotient degree at <=5, only 2 selectors can
 * be used to select it.
 *
 * N.B.2 The q_c selector is used to store circuit-specific values in the RAM/ROM access gate
 *
 */

UltraCircuitChecker::FF UltraCircuitChecker::compute_auxilary_identity(
    UltraCircuitChecker::FF q_aux_value,
    UltraCircuitChecker::FF q_arith_value,
    UltraCircuitChecker::FF q_1_value,
    UltraCircuitChecker::FF q_2_value,
    UltraCircuitChecker::FF q_3_value,
    UltraCircuitChecker::FF q_4_value,
    UltraCircuitChecker::FF q_m_value,
    UltraCircuitChecker::FF q_c_value,
    UltraCircuitChecker::FF w_1_value,
    UltraCircuitChecker::FF w_2_value,
    UltraCircuitChecker::FF w_3_value,
    UltraCircuitChecker::FF w_4_value,
    UltraCircuitChecker::FF w_1_shifted_value,
    UltraCircuitChecker::FF w_2_shifted_value,
    UltraCircuitChecker::FF w_3_shifted_value,
    UltraCircuitChecker::FF w_4_shifted_value,
    UltraCircuitChecker::FF alpha_base,
    UltraCircuitChecker::FF alpha,
    UltraCircuitChecker::FF eta)
{
    constexpr FF LIMB_SIZE(uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
    // TODO(kesha): Replace with a constant defined in header
    constexpr FF SUBLIMB_SHIFT(uint256_t(1) << 14);

    // Non-native field arithmetic gate relations
    // a{a_0, ..., a_3}⋅b{b_0,...,b_3} + q{q_0,..., q_3}⋅neg_p{neg_p_0,...,neg_p_3} - r{r_0,...,r_3} = 0 mod 2²⁷²
    // neg_p and limb shifts are constants, so we can use big addition gates for them.
    // Activated with q_2 & (q_3 | q_4 | q_m) - first, second, third appropriately
    // For native gate_1: limb_subproduct = a_1 ⋅ b_0 + a_0 ⋅ b_1
    // For native gate_2: limb_subproduct = a_0 ⋅ b_2 + a_2 ⋅ b_0
    // For native gate_3: limb_subproduct = a_2 ⋅ b_1 + a_1 ⋅ b_2
    FF limb_subproduct = w_1_value * w_2_shifted_value + w_1_shifted_value * w_2_value;

    // ( a_0 ⋅ b_3 + a_3 ⋅ b_0 - r_3 )
    FF non_native_field_gate_2 = (w_1_value * w_4_value + w_2_value * w_3_value - w_3_shifted_value);
    // ( a_0 ⋅ b_3 + a_3 ⋅ b_0 - r_3 ) << 68
    non_native_field_gate_2 *= LIMB_SIZE;
    // ( a_0 ⋅ b_3 + a_3 ⋅ b_0 - r_3 ) << 68 - hi_0
    non_native_field_gate_2 -= w_4_shifted_value;
    // ( a_0 ⋅ b_3 + a_3 ⋅ b_0 - r_3 ) << 68 - hi_0 + a_0 ⋅ b_2 + a_2 ⋅ b_0
    non_native_field_gate_2 += limb_subproduct;
    non_native_field_gate_2 *= q_4_value;

    limb_subproduct *= LIMB_SIZE;

    // ( a_1 ⋅ b_0 + a_0 ⋅ b_1 ) << 68 + ( a_0 ⋅ b_0 )
    limb_subproduct += (w_1_shifted_value * w_2_shifted_value);
    FF non_native_field_gate_1 = limb_subproduct;
    // ( a_1 ⋅ b_0 + a_0 ⋅ b_1 ) << 68 + ( a_0 ⋅ b_0 )
    non_native_field_gate_1 -= (w_3_value + w_4_value);
    non_native_field_gate_1 *= q_3_value;

    // ( a_2 ⋅ b_1 + a_1 ⋅ b_2 ) << 68 + ( a_1 ⋅ b_1 )
    FF non_native_field_gate_3 = limb_subproduct;
    // ( a_2 ⋅ b_1 + a_1 ⋅ b_2 ) << 68 + ( a_1 ⋅ b_1 ) + hi_0
    non_native_field_gate_3 += w_4_value;
    // ( a_2 ⋅ b_1 + a_1 ⋅ b_2 ) << 68 + ( a_1 ⋅ b_1 ) + hi_0 - r_2 - hi_1
    non_native_field_gate_3 -= (w_3_shifted_value + w_4_shifted_value);
    non_native_field_gate_3 *= q_m_value;

    // Accumulate the 3 gates and multiply by q_2
    FF non_native_field_identity = non_native_field_gate_1 + non_native_field_gate_2 + non_native_field_gate_3;
    non_native_field_identity *= q_2_value;

    // Accummulator limbs. These are activated with (q_3)&( q_4 | q_m).
    // The limbs are configured in such a way as to take 3 gates to process a decomposition of 2 at maximum 70-bit
    // elements into 5 14-bit limbs each. Then through set permutation we can range constrain each
    //
    // w_4 == (w_2_shifted << 56) | (w_1_shifted << 42) |  (w_3 << 28) | (w_2 << 14) |
    // w_1
    FF limb_accumulator_1 = w_2_shifted_value;
    limb_accumulator_1 *= SUBLIMB_SHIFT;
    limb_accumulator_1 += w_1_shifted_value;
    limb_accumulator_1 *= SUBLIMB_SHIFT;
    limb_accumulator_1 += w_3_value;
    limb_accumulator_1 *= SUBLIMB_SHIFT;
    limb_accumulator_1 += w_2_value;
    limb_accumulator_1 *= SUBLIMB_SHIFT;
    limb_accumulator_1 += w_1_value;
    limb_accumulator_1 -= w_4_value;
    limb_accumulator_1 *= q_4_value;

    // w_4_shifted == (w_3_shifted << 56) | (w_2_shifted << 42) |  (w_1_shifted << 28) | (w_4 << 14) | w_3
    FF limb_accumulator_2 = w_3_shifted_value;
    limb_accumulator_2 *= SUBLIMB_SHIFT;
    limb_accumulator_2 += w_2_shifted_value;
    limb_accumulator_2 *= SUBLIMB_SHIFT;
    limb_accumulator_2 += w_1_shifted_value;
    limb_accumulator_2 *= SUBLIMB_SHIFT;
    limb_accumulator_2 += w_4_value;
    limb_accumulator_2 *= SUBLIMB_SHIFT;
    limb_accumulator_2 += w_3_value;
    limb_accumulator_2 -= w_4_shifted_value;
    limb_accumulator_2 *= q_m_value;

    FF limb_accumulator_identity = limb_accumulator_1 + limb_accumulator_2;
    limb_accumulator_identity *= q_3_value;

    /**
     * MEMORY
     *
     * A RAM memory record contains a tuple of the following fields:
     *  * i: `index` of memory cell being accessed
     *  * t: `timestamp` of memory cell being accessed (used for RAM, set to 0 for ROM)
     *  * v: `value` of memory cell being accessed
     *  * a: `access` type of record. read: 0 = read, 1 = write
     *  * r: `record` of memory cell. record = access + index * eta + timestamp * eta^2 + value * eta^3
     *
     * A ROM memory record contains a tuple of the following fields:
     *  * i: `index` of memory cell being accessed
     *  * v: `value1` of memory cell being accessed (ROM tables can store up to 2 values per index)
     *  * v2:`value2` of memory cell being accessed (ROM tables can store up to 2 values per index)
     *  * r: `record` of memory cell. record = index * eta + value2 * eta^2 + value1 * eta^3
     *
     *  When performing a read/write access, the values of i, t, v, v2, a, r are stored in the following wires +
     * selectors, depending on whether the gate is a RAM read/write or a ROM read
     *
     *  | gate type | i  | v2/t  |  v | a  | r  |
     *  | --------- | -- | ----- | -- | -- | -- |
     *  | ROM       | w1 | w2    | w3 | -- | w4 |
     *  | RAM       | w1 | w2    | w3 | qc | w4 |
     *
     * (for accesses where `index` is a circuit constant, it is assumed the circuit will apply a copy constraint on
     * `w2` to fix its value)
     *
     **/

    /**
     * Memory Record Check
     *
     * Memory record check is needed to generate a 4 ~ 1 correspondence between the record of the memory cell and all
     * the other values. It allows us to use set equivalence for whole cells, since we only need to take care of
     * 1 witness per cell
     *
     * A ROM/ROM access gate can be evaluated with the identity:
     *
     * qc + w1 \eta + w2 \eta^2 + w3 \eta^3 - w4 = 0
     *
     * For ROM gates, qc = 0
     */

    FF memory_record_check = w_3_value;
    memory_record_check *= eta;
    memory_record_check += w_2_value;
    memory_record_check *= eta;
    memory_record_check += w_1_value;
    memory_record_check *= eta;
    memory_record_check += q_c_value;
    FF partial_record_check = memory_record_check; // used in RAM consistency check
    memory_record_check = memory_record_check - w_4_value;

    /**
     * ROM Consistency Check
     *
     * For every ROM read, a set equivalence check is applied between the record witnesses, and a second set of
     * records that are sorted.
     *
     * We apply the following checks for the sorted records:
     *
     * 1. w1, w2, w3 correctly map to 'index', 'v1, 'v2' for a given record value at w4
     * 2. index values for adjacent records are monotonically increasing
     * 3. if, at gate i, index_i == index_{i + 1}, then value1_i == value1_{i + 1} and value2_i == value2_{i + 1}
     *
     */

    FF index_delta = w_1_shifted_value - w_1_value;
    FF record_delta = w_4_shifted_value - w_4_value;

    // (index_delta - 1) ⋅ (index_delta)
    FF index_is_monotonically_increasing = index_delta.sqr() - index_delta;
    // (1 - index_delta) ⋅ (record_delta)
    FF adjacent_values_match_if_adjacent_indices_match = (FF(1) - index_delta) * record_delta;

    FF ROM_consistency_check_identity = adjacent_values_match_if_adjacent_indices_match;
    ROM_consistency_check_identity *= alpha;
    ROM_consistency_check_identity += index_is_monotonically_increasing;
    ROM_consistency_check_identity *= alpha;
    // α²⋅(1 - index_delta) ⋅ record_delta + α ⋅ (index_delta - 1) ⋅ index_delta + (q_c + η ⋅ w_1 + η ⋅ w_2 + η ⋅ w_3 -
    // w_4)
    ROM_consistency_check_identity += memory_record_check;

    /**
     * RAM Consistency Check
     *
     * The 'access' type of the record is extracted with the expression `w_4 - partial_record_check`
     * (i.e. for an honest Prover `w1 * eta + w2 * eta^2 + w3 * eta^3 - w4 = access`.
     * This is validated by requiring `access` to be boolean
     *
     * For two adjacent entries in the sorted list if _both_
     *  A) index values match
     *  B) adjacent access value is 0 (i.e. next gate is a READ)
     * then
     *  C) both values must match.
     * The gate boolean check is
     * (A && B) => C  === !(A && B) || C ===  !A || !B || C
     *
     * N.B. it is the responsibility of the circuit writer to ensure that every RAM cell is initialized
     * with a WRITE operation.
     */
    FF access_type = (w_4_value - partial_record_check); // will be 0 or 1 for honest Prover
    FF access_check = access_type.sqr() - access_type;   // check value is 0 or 1

    // TODO: oof nasty compute here. If we sorted in reverse order we could re-use `partial_record_check`
    FF next_gate_access_type = w_3_shifted_value;
    next_gate_access_type *= eta;
    next_gate_access_type += w_2_shifted_value;
    next_gate_access_type *= eta;
    next_gate_access_type += w_1_shifted_value;
    next_gate_access_type *= eta;
    next_gate_access_type = w_4_shifted_value - next_gate_access_type;

    FF value_delta = w_3_shifted_value - w_3_value;
    FF adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation =
        (FF(1) - index_delta) * value_delta * (FF(1) - next_gate_access_type);

    // We can't apply the RAM consistency check identity on the final entry in the sorted list (the wires in the
    // next gate would make the identity fail).
    // We need to validate that its 'access type' bool is correct. Can't do
    // with an arithmetic gate because of the `eta` factors. We need to check that the *next* gate's access type is
    // correct, to cover this edge case
    FF next_gate_access_type_is_boolean = next_gate_access_type.sqr() - next_gate_access_type;

    // Putting it all together...
    FF RAM_consistency_check_identity =
        adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation;
    RAM_consistency_check_identity *= alpha;
    RAM_consistency_check_identity += index_is_monotonically_increasing;
    RAM_consistency_check_identity *= alpha;
    RAM_consistency_check_identity += next_gate_access_type_is_boolean;
    RAM_consistency_check_identity *= alpha;
    RAM_consistency_check_identity += access_check;

    /**
     * RAM Timestamp Consistency Check
     *
     * | w1 | w2 | w3 | w4 |
     * | index | timestamp | timestamp_check | -- |
     *
     * Let delta_index = index_{i + 1} - index_{i}
     *
     * Iff delta_index == 0, timestamp_check = timestamp_{i + 1} - timestamp_i
     * Else timestamp_check = 0
     */
    FF timestamp_delta = w_2_shifted_value - w_2_value;
    FF RAM_timestamp_check_identity = (FF(1) - index_delta) * timestamp_delta - w_3_value;

    /**
     * The complete RAM/ROM memory identity
     *
     */

    FF memory_identity = ROM_consistency_check_identity * q_2_value;
    memory_identity += RAM_timestamp_check_identity * q_4_value;
    memory_identity += memory_record_check * q_m_value;
    memory_identity *= q_1_value;
    memory_identity += (RAM_consistency_check_identity * q_arith_value);

    FF auxiliary_identity = memory_identity + non_native_field_identity + limb_accumulator_identity;
    auxiliary_identity *= q_aux_value;
    auxiliary_identity *= alpha_base;

    return auxiliary_identity;
}

/**
 * @brief Check that the circuit is correct in its current state
 *
 * @details The method switches the circuit to the "in-the-head" version, finalizes it, checks gates, lookups and
 * permutations and then switches it back from the in-the-head version, discarding the updates
 * @note We want to check that the whole circuit works, but ultra circuits need to have ram, rom and range gates added in the end for the check to be complete as
 * well as the set permutation check, so we finalize the circuit when we check it. This structure allows us to
 * restore the circuit to the state before the finalization.
 *
 * @return true
 * @return false
 */
bool UltraCircuitChecker::execute(UltraCircuitBuilder circuit)
{
    bool result = true;

    // Copy prefinalized circuit so that original circuit can be restored prior to return
    // UltraCircuitBuilder_<Arithmetization> prefinalized_circuit = *this;

    // Finalize the circuit
    circuit.finalize_circuit();

    // Sample randomness
    const FF arithmetic_base = FF::random_element();
    const FF elliptic_base = FF::random_element();
    const FF genperm_sort_base = FF::random_element();
    const FF auxillary_base = FF::random_element();
    const FF alpha = FF::random_element();
    const FF eta = FF::random_element();

    // We need to get all memory
    std::unordered_set<size_t> memory_read_record_gates;
    std::unordered_set<size_t> memory_write_record_gates;
    for (const auto& gate_idx : circuit.memory_read_records) {
        memory_read_record_gates.insert(gate_idx);
    }
    for (const auto& gate_idx : circuit.memory_write_records) {
        memory_write_record_gates.insert(gate_idx);
    }

    // A hashing implementation for quick simulation lookups
    struct HashFrTuple {
        const FF mult_const = FF(uint256_t(0x1337, 0x1336, 0x1335, 0x1334));
        const FF mc_sqr = mult_const.sqr();
        const FF mc_cube = mult_const * mc_sqr;

        size_t operator()(const std::tuple<FF, FF, FF, FF>& entry) const
        {
            return (size_t)((std::get<0>(entry) + mult_const * std::get<1>(entry) + mc_sqr * std::get<2>(entry) +
                             mc_cube * std::get<3>(entry))
                                .reduce_once()
                                .data[0]);
        }
    };

    // Equality checks for lookup tuples
    struct EqualFrTuple {

        bool operator()(const std::tuple<FF, FF, FF, FF>& entry1, const std::tuple<FF, FF, FF, FF>& entry2) const
        {
            return entry1 == entry2;
        }
    };
    // The set of all lookup tuples that are in the tables
    std::unordered_set<std::tuple<FF, FF, FF, FF>, HashFrTuple, EqualFrTuple> table_hash;
    // Prepare the lookup set for use in the circuit
    for (auto& table : circuit.lookup_tables) {
        const FF table_index(table.table_index);
        for (size_t i = 0; i < table.size; ++i) {
            const auto components =
                std::make_tuple(table.column_1[i], table.column_2[i], table.column_3[i], table_index);
            table_hash.insert(components);
        }
    }

    // We use a running tag product mechanism to ensure tag correctness
    // This is the product of (value + γ ⋅ tag)
    FF left_tag_product = FF::one();
    // This is the product of (value + γ ⋅ tau[tag])
    FF right_tag_product = FF::one();
    // Randomness for the tag check
    const FF tag_gamma = FF::random_element();
    // We need to include each variable only once
    std::unordered_set<size_t> encountered_variables;

    // Function to quickly update tag products and encountered variable set by index and value
    auto update_tag_check_information = [&](size_t variable_index, FF value) {
        size_t real_index = circuit.real_variable_index[variable_index];
        // Check to ensure that we are not including a variable twice
        if (encountered_variables.contains(real_index)) {
            return;
        }
        size_t tag_in = circuit.real_variable_tags[real_index];
        if (tag_in != DUMMY_TAG) {
            size_t tag_out = circuit.tau.at((uint32_t)tag_in);
            left_tag_product *= value + tag_gamma * FF(tag_in);
            right_tag_product *= value + tag_gamma * FF(tag_out);
            encountered_variables.insert(real_index);
        }
    };
    // For each gate
    for (size_t i = 0; i < circuit.num_gates; i++) {
        FF q_arith_value;
        FF q_aux_value;
        FF q_elliptic_value;
        FF q_sort_value;
        FF q_lookup_type_value;
        FF q_1_value;
        FF q_2_value;
        FF q_3_value;
        FF q_4_value;
        FF q_m_value;
        FF q_c_value;
        FF w_1_value;
        FF w_2_value;
        FF w_3_value;
        FF w_4_value;
        FF w_4_index;
        // Get the values of selectors and wires and update tag products along the way
        q_arith_value = circuit.blocks.main.q_arith()[i];
        q_aux_value = circuit.blocks.main.q_aux()[i];
        q_elliptic_value = circuit.blocks.main.q_elliptic()[i];
        q_sort_value = circuit.blocks.main.q_sort()[i];
        q_lookup_type_value = circuit.blocks.main.q_lookup_type()[i];
        q_1_value = circuit.blocks.main.q_1()[i];
        q_2_value = circuit.blocks.main.q_2()[i];
        q_3_value = circuit.blocks.main.q_3()[i];
        q_4_value = circuit.blocks.main.q_4()[i];
        q_m_value = circuit.blocks.main.q_m()[i];
        q_c_value = circuit.blocks.main.q_c()[i];
        w_1_value = circuit.get_variable(circuit.blocks.main.w_l()[i]);
        update_tag_check_information(circuit.blocks.main.w_l()[i], w_1_value);
        w_2_value = circuit.get_variable(circuit.blocks.main.w_r()[i]);
        update_tag_check_information(circuit.blocks.main.w_r()[i], w_2_value);
        w_3_value = circuit.get_variable(circuit.blocks.main.w_o()[i]);
        update_tag_check_information(circuit.blocks.main.w_o()[i], w_3_value);
        w_4_value = circuit.get_variable(circuit.blocks.main.w_4()[i]);
        // We need to wait before updating tag product for w_4
        w_4_index = circuit.blocks.main.w_4()[i];

        // If we are touching a gate with memory access, we need to update the value of the 4th witness
        if (memory_read_record_gates.contains(i)) {
            w_4_value = ((w_3_value * eta + w_2_value) * eta + w_1_value) * eta;
        }
        if (memory_write_record_gates.contains(i)) {
            w_4_value = ((w_3_value * eta + w_2_value) * eta + w_1_value) * eta + FF::one();
        }
        // Now we can update the tag product for w_4
        update_tag_check_information((uint32_t)w_4_index, w_4_value);
        FF w_1_shifted_value;
        FF w_2_shifted_value;
        FF w_3_shifted_value;
        FF w_4_shifted_value;
        if (i < (circuit.num_gates - 1)) {
            w_1_shifted_value = circuit.get_variable(circuit.blocks.main.w_l()[i + 1]);
            w_2_shifted_value = circuit.get_variable(circuit.blocks.main.w_r()[i + 1]);
            w_3_shifted_value = circuit.get_variable(circuit.blocks.main.w_o()[i + 1]);
            w_4_shifted_value = circuit.get_variable(circuit.blocks.main.w_4()[i + 1]);
        } else {
            w_1_shifted_value = FF::zero();
            w_2_shifted_value = FF::zero();
            w_3_shifted_value = FF::zero();
            w_4_shifted_value = FF::zero();
        }
        if (memory_read_record_gates.contains(i + 1)) {
            w_4_shifted_value = ((w_3_shifted_value * eta + w_2_shifted_value) * eta + w_1_shifted_value) * eta;
        }
        if (memory_write_record_gates.contains(i + 1)) {
            w_4_shifted_value =
                ((w_3_shifted_value * eta + w_2_shifted_value) * eta + w_1_shifted_value) * eta + FF::one();
        }
        if (!compute_arithmetic_identity(q_arith_value,
                                         q_1_value,
                                         q_2_value,
                                         q_3_value,
                                         q_4_value,
                                         q_m_value,
                                         q_c_value,
                                         w_1_value,
                                         w_2_value,
                                         w_3_value,
                                         w_4_value,
                                         w_1_shifted_value,
                                         w_4_shifted_value,
                                         arithmetic_base,
                                         alpha)
                 .is_zero()) {
#ifndef FUZZING
            info("Arithmetic identity fails at gate ", i);
#endif
            result = false;
            break;
        }
        if (!compute_auxilary_identity(q_aux_value,
                                       q_arith_value,
                                       q_1_value,
                                       q_2_value,
                                       q_3_value,
                                       q_4_value,
                                       q_m_value,
                                       q_c_value,
                                       w_1_value,
                                       w_2_value,
                                       w_3_value,
                                       w_4_value,
                                       w_1_shifted_value,
                                       w_2_shifted_value,
                                       w_3_shifted_value,
                                       w_4_shifted_value,
                                       auxillary_base,
                                       alpha,
                                       eta)
                 .is_zero()) {
#ifndef FUZZING
            info("Auxilary identity fails at gate ", i);
#endif

            result = false;
            break;
        }
        if (!compute_elliptic_identity(q_elliptic_value,
                                       q_1_value,
                                       q_m_value,
                                       w_2_value,
                                       w_3_value,
                                       w_1_shifted_value,
                                       w_2_shifted_value,
                                       w_3_shifted_value,
                                       w_4_shifted_value,
                                       elliptic_base,
                                       alpha)
                 .is_zero()) {
#ifndef FUZZING
            info("Elliptic identity fails at gate ", i);
#endif
            result = false;
            break;
        }
        if (!compute_genperm_sort_identity(
                 q_sort_value, w_1_value, w_2_value, w_3_value, w_4_value, w_1_shifted_value, genperm_sort_base, alpha)
                 .is_zero()) {
#ifndef FUZZING
            info("Genperm sort identity fails at gate ", i);
#endif

            result = false;
            break;
        }
        if (!q_lookup_type_value.is_zero()) {
            if (!table_hash.contains(std::make_tuple(w_1_value + q_2_value * w_1_shifted_value,
                                                     w_2_value + q_m_value * w_2_shifted_value,
                                                     w_3_value + q_c_value * w_3_shifted_value,
                                                     q_3_value))) {
#ifndef FUZZING
                info("Lookup fails at gate ", i);
#endif

                result = false;
                break;
            }
        }
    }
    if (left_tag_product != right_tag_product) {
#ifndef FUZZING
        if (result) {
            info("Tag permutation failed");
        }
#endif

        result = false;
    }

    // Restore the circuit to its pre-finalized state
    // *this = prefinalized_circuit;

    return result;
}

} // namespace bb

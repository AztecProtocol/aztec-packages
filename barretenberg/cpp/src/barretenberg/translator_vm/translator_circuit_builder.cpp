// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @file translator_circuit_builder.cpp
 * @author @Rumata888
 * @brief Circuit Logic generation for Goblin Plonk translator (checks equivalence of Queues/Transcripts for ECCVM and
 * Recursive Circuits)
 *
 * @copyright Copyright (c) 2023
 *
 */
#include "translator_circuit_builder.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

#include <cstddef>
namespace bb {

/**
 * @brief Given the transcript values from the EccOpQueue, the values of the previous accumulator, batching challenge
 * and input x, compute witness for one step of accumulation
 *
 * @tparam Fq
 * @tparam Fr
 * @param ultra_op The ultra op used to produce the wire data
 * @param previous_accumulator The value of the previous accumulator (we assume standard decomposition into limbs)
 * @param batching_challenge_v The value of the challenge for batching polynomial evaluations
 * @param evaluation_input_x The value at which we evaluate the polynomials
 * @return TranslatorCircuitBuilder::AccumulationInput
 */
TranslatorCircuitBuilder::AccumulationInput TranslatorCircuitBuilder::generate_witness_values(
    const UltraOp& ultra_op,
    const Fq& previous_accumulator,
    const Fq& batching_challenge_v,
    const Fq& evaluation_input_x)
{
    // All parameters are well-described in the header, this is just for convenience
    constexpr size_t TOP_STANDARD_MICROLIMB_BITS = NUM_LAST_LIMB_BITS % MICRO_LIMB_BITS;
    constexpr size_t TOP_Z_MICROLIMB_BITS = (NUM_Z_BITS % NUM_LIMB_BITS) % MICRO_LIMB_BITS;
    constexpr size_t TOP_QUOTIENT_MICROLIMB_BITS =
        (TranslatorCircuitBuilder::NUM_QUOTIENT_BITS % NUM_LIMB_BITS) % MICRO_LIMB_BITS;

    /**
     * @brief A small function to transform a uint512_t element into its 4 68-bit limbs in Fr scalars
     *
     * @details Split and integer stored in uint512_T into 4 68-bit chunks (we assume that it is lower than 2²⁷²),
     * convert to Fr
     *
     */
    auto uint512_t_to_limbs = [](const uint512_t& original) {
        return std::array<Fr, NUM_BINARY_LIMBS>{ Fr(original.slice(0, NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS).lo) };
    };

    /**
     * @brief A method for splitting wide limbs (P_x_lo, P_y_hi, etc) into two limbs
     *
     */
    auto split_wide_limb_into_2_limbs = [](const Fr& wide_limb) {
        return std::array<Fr, NUM_Z_LIMBS>{ Fr(uint256_t(wide_limb).slice(0, NUM_LIMB_BITS)),
                                            Fr(uint256_t(wide_limb).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)) };
    };
    /**
     * @brief A method to split a full 68-bit limb into 5 14-bit limb and 1 shifted limb for a more secure constraint
     *
     */
    auto split_standard_limb_into_micro_limbs = [](const Fr& limb) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, NUM_MICRO_LIMBS>{
            uint256_t(limb).slice(0, MICRO_LIMB_BITS),
            uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS)
                << (MICRO_LIMB_BITS - (NUM_LIMB_BITS % MICRO_LIMB_BITS)),
        };
    };

    /**
     * @brief A method to split the top 50-bit limb into 4 14-bit limbs and 1 shifted limb for a more secure constraint
     * (plus there is 1 extra space for other constraints)
     *
     */
    auto split_top_limb_into_micro_limbs = [](const Fr& limb, const size_t last_limb_bits) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, NUM_MICRO_LIMBS>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS)
                                                    << (MICRO_LIMB_BITS - (last_limb_bits % MICRO_LIMB_BITS)),
                                                0 };
    };

    /**
     * @brief A method for splitting the top 60-bit z limb into microlimbs (differs from the 68-bit limb by the shift in
     * the last limb)
     *
     */
    auto split_top_z_limb_into_micro_limbs = [](const Fr& limb, const size_t last_limb_bits) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, NUM_MICRO_LIMBS>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
                                                uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS)
                                                    << (MICRO_LIMB_BITS - (last_limb_bits % MICRO_LIMB_BITS)) };
    };

    /**
     * @brief Split a 72-bit relation limb into 6 14-bit limbs (we can allow the slack here, since we only need to
     * ensure non-overflow of the modulus)
     *
     */
    auto split_relation_limb_into_micro_limbs = [](const Fr& limb) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, 6>{
            uint256_t(limb).slice(0, MICRO_LIMB_BITS),
            uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(5 * MICRO_LIMB_BITS, 6 * MICRO_LIMB_BITS),
        };
    };
    //  x and powers of v are given to us in challenge form, so the verifier has to deal with this :)
    Fq v_squared = batching_challenge_v * batching_challenge_v;
    Fq v_cubed = v_squared * batching_challenge_v;
    Fq v_quarted = v_cubed * batching_challenge_v;

    // Convert the accumulator, powers of v and x into "bigfield" form
    auto previous_accumulator_limbs = split_fq_into_limbs(previous_accumulator);
    auto v_witnesses = split_fq_into_limbs(batching_challenge_v);
    auto v_squared_witnesses = split_fq_into_limbs(v_squared);
    auto v_cubed_witnesses = split_fq_into_limbs(v_cubed);
    auto v_quarted_witnesses = split_fq_into_limbs(v_quarted);
    auto x_witnesses = split_fq_into_limbs(evaluation_input_x);

    // To calculate the quotient, we need to evaluate the expression in integers. So we need uint512_t versions of all
    // elements involved
    size_t op_code = ultra_op.op_code.value();
    auto uint_previous_accumulator = uint512_t(previous_accumulator);
    auto uint_x = uint512_t(evaluation_input_x);
    auto uint_op = uint512_t(op_code);
    auto uint_p_x = uint512_t(uint256_t(ultra_op.x_lo) + (uint256_t(ultra_op.x_hi) << (NUM_LIMB_BITS << 1)));
    auto uint_p_y = uint512_t(uint256_t(ultra_op.y_lo) + (uint256_t(ultra_op.y_hi) << (NUM_LIMB_BITS << 1)));
    auto uint_z1 = uint512_t(ultra_op.z_1);
    auto uint_z2 = uint512_t(ultra_op.z_2);
    auto uint_v = uint512_t(batching_challenge_v);
    auto uint_v_squared = uint512_t(v_squared);
    auto uint_v_cubed = uint512_t(v_cubed);
    auto uint_v_quarted = uint512_t(v_quarted);

    // Construct Fq for op, P.x, P.y, z_1, z_2 for use in witness computation
    Fq base_op = Fq(uint256_t(op_code));
    Fq base_p_x = Fq(uint256_t(ultra_op.x_lo) + (uint256_t(ultra_op.x_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_p_y = Fq(uint256_t(ultra_op.y_lo) + (uint256_t(ultra_op.y_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_z_1 = Fq(uint256_t(ultra_op.z_1));
    Fq base_z_2 = Fq(uint256_t(ultra_op.z_2));

    // Construct bigfield representations of P.x and P.y
    auto [p_x_0, p_x_1] = split_wide_limb_into_2_limbs(ultra_op.x_lo);
    auto [p_x_2, p_x_3] = split_wide_limb_into_2_limbs(ultra_op.x_hi);
    std::array<Fr, NUM_BINARY_LIMBS> p_x_limbs = { p_x_0, p_x_1, p_x_2, p_x_3 };
    auto [p_y_0, p_y_1] = split_wide_limb_into_2_limbs(ultra_op.y_lo);
    auto [p_y_2, p_y_3] = split_wide_limb_into_2_limbs(ultra_op.y_hi);
    std::array<Fr, NUM_BINARY_LIMBS> p_y_limbs = { p_y_0, p_y_1, p_y_2, p_y_3 };

    // Construct bigfield representations of ultra_op.z_1 and ultra_op.z_2 only using 2 limbs each
    auto z_1_limbs = split_wide_limb_into_2_limbs(ultra_op.z_1);
    auto z_2_limbs = split_wide_limb_into_2_limbs(ultra_op.z_2);

    // The formula is `accumulator = accumulator⋅x + (op + v⋅p.x + v²⋅p.y + v³⋅z₁ + v⁴z₂)`. We need to compute the
    // remainder (new accumulator value)

    const Fq remainder = previous_accumulator * evaluation_input_x + base_z_2 * v_quarted + base_z_1 * v_cubed +
                         base_p_y * v_squared + base_p_x * batching_challenge_v + base_op;

    // We also need to compute the quotient
    uint512_t quotient_by_modulus = uint_previous_accumulator * uint_x + uint_z2 * uint_v_quarted +
                                    uint_z1 * uint_v_cubed + uint_p_y * uint_v_squared + uint_p_x * uint_v + uint_op -
                                    uint512_t(remainder);

    uint512_t quotient = quotient_by_modulus / uint512_t(Fq::modulus);

    ASSERT(quotient_by_modulus == (quotient * uint512_t(Fq::modulus)));

    // Compute quotient and remainder bigfield representation
    auto remainder_limbs = split_fq_into_limbs(remainder);
    std::array<Fr, NUM_BINARY_LIMBS> quotient_limbs = uint512_t_to_limbs(quotient);

    // We will divide by shift_2 instantly in the relation itself, but first we need to compute the low part (0*0) and
    // the high part (0*1, 1*0) multiplied by a single limb shift
    Fr low_wide_relation_limb_part_1 = previous_accumulator_limbs[0] * x_witnesses[0] + op_code +
                                       v_witnesses[0] * p_x_limbs[0] + v_squared_witnesses[0] * p_y_limbs[0] +
                                       v_cubed_witnesses[0] * z_1_limbs[0] + v_quarted_witnesses[0] * z_2_limbs[0] +
                                       quotient_limbs[0] * NEGATIVE_MODULUS_LIMBS[0] -
                                       remainder_limbs[0]; // This covers the lowest limb

    Fr low_wide_relation_limb =
        low_wide_relation_limb_part_1 +
        (previous_accumulator_limbs[1] * x_witnesses[0] + previous_accumulator_limbs[0] * x_witnesses[1] +
         v_witnesses[1] * p_x_limbs[0] + p_x_limbs[1] * v_witnesses[0] + v_squared_witnesses[1] * p_y_limbs[0] +
         v_squared_witnesses[0] * p_y_limbs[1] + v_cubed_witnesses[1] * z_1_limbs[0] +
         z_1_limbs[1] * v_cubed_witnesses[0] + v_quarted_witnesses[1] * z_2_limbs[0] +
         v_quarted_witnesses[0] * z_2_limbs[1] + quotient_limbs[0] * NEGATIVE_MODULUS_LIMBS[1] +
         quotient_limbs[1] * NEGATIVE_MODULUS_LIMBS[0] - remainder_limbs[1]) *
            SHIFT_1;

    // Low bits have to be zero
    ASSERT(uint256_t(low_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS) == 0);

    Fr low_wide_relation_limb_divided = low_wide_relation_limb * SHIFT_2_INVERSE;

    // The high relation limb is the accumulation of the low limb divided by 2¹³⁶ and the combination of limbs with
    // indices (0*2,1*1,2*0) with limbs with indices (0*3,1*2,2*1,3*0) multiplied by 2⁶⁸

    Fr high_wide_relation_limb =
        low_wide_relation_limb_divided + previous_accumulator_limbs[2] * x_witnesses[0] +
        previous_accumulator_limbs[1] * x_witnesses[1] + previous_accumulator_limbs[0] * x_witnesses[2] +
        v_witnesses[2] * p_x_limbs[0] + v_witnesses[1] * p_x_limbs[1] + v_witnesses[0] * p_x_limbs[2] +
        v_squared_witnesses[2] * p_y_limbs[0] + v_squared_witnesses[1] * p_y_limbs[1] +
        v_squared_witnesses[0] * p_y_limbs[2] + v_cubed_witnesses[2] * z_1_limbs[0] +
        v_cubed_witnesses[1] * z_1_limbs[1] + v_quarted_witnesses[2] * z_2_limbs[0] +
        v_quarted_witnesses[1] * z_2_limbs[1] + quotient_limbs[2] * NEGATIVE_MODULUS_LIMBS[0] +
        quotient_limbs[1] * NEGATIVE_MODULUS_LIMBS[1] + quotient_limbs[0] * NEGATIVE_MODULUS_LIMBS[2] -
        remainder_limbs[2] +
        (previous_accumulator_limbs[3] * x_witnesses[0] + previous_accumulator_limbs[2] * x_witnesses[1] +
         previous_accumulator_limbs[1] * x_witnesses[2] + previous_accumulator_limbs[0] * x_witnesses[3] +
         v_witnesses[3] * p_x_limbs[0] + v_witnesses[2] * p_x_limbs[1] + v_witnesses[1] * p_x_limbs[2] +
         v_witnesses[0] * p_x_limbs[3] + v_squared_witnesses[3] * p_y_limbs[0] + v_squared_witnesses[2] * p_y_limbs[1] +
         v_squared_witnesses[1] * p_y_limbs[2] + v_squared_witnesses[0] * p_y_limbs[3] +
         v_cubed_witnesses[3] * z_1_limbs[0] + v_cubed_witnesses[2] * z_1_limbs[1] +
         v_quarted_witnesses[3] * z_2_limbs[0] + v_quarted_witnesses[2] * z_2_limbs[1] +
         quotient_limbs[3] * NEGATIVE_MODULUS_LIMBS[0] + quotient_limbs[2] * NEGATIVE_MODULUS_LIMBS[1] +
         quotient_limbs[1] * NEGATIVE_MODULUS_LIMBS[2] + quotient_limbs[0] * NEGATIVE_MODULUS_LIMBS[3] -
         remainder_limbs[3]) *
            SHIFT_1;

    // Check that the results lower 136 bits are zero
    ASSERT(uint256_t(high_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS) == 0);

    // Get divided version
    auto high_wide_relation_limb_divided = high_wide_relation_limb * SHIFT_2_INVERSE;

    const auto last_limb_index = NUM_BINARY_LIMBS - 1;

    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_x_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_y_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_1_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_2_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> current_accumulator_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> quotient_microlimbs;
    // Split P_x into microlimbs for range constraining
    for (size_t i = 0; i < last_limb_index; i++) {
        P_x_microlimbs[i] = split_standard_limb_into_micro_limbs(p_x_limbs[i]);
    }
    P_x_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(p_x_limbs[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);

    // Split P_y into microlimbs for range constraining
    for (size_t i = 0; i < last_limb_index; i++) {
        P_y_microlimbs[i] = split_standard_limb_into_micro_limbs(p_y_limbs[i]);
    }
    P_y_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(p_y_limbs[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);

    // Split z scalars into microlimbs for range constraining
    for (size_t i = 0; i < NUM_Z_LIMBS - 1; i++) {
        z_1_microlimbs[i] = split_standard_limb_into_micro_limbs(z_1_limbs[i]);
        z_2_microlimbs[i] = split_standard_limb_into_micro_limbs(z_2_limbs[i]);
    }
    z_1_microlimbs[NUM_Z_LIMBS - 1] =
        split_top_z_limb_into_micro_limbs(z_1_limbs[NUM_Z_LIMBS - 1], TOP_Z_MICROLIMB_BITS);
    z_2_microlimbs[NUM_Z_LIMBS - 1] =
        split_top_z_limb_into_micro_limbs(z_2_limbs[NUM_Z_LIMBS - 1], TOP_Z_MICROLIMB_BITS);

    // Split current accumulator into microlimbs for range constraining
    for (size_t i = 0; i < last_limb_index; i++) {
        current_accumulator_microlimbs[i] = split_standard_limb_into_micro_limbs(remainder_limbs[i]);
    }
    current_accumulator_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(remainder_limbs[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);

    // Split quotient into microlimbs for range constraining
    for (size_t i = 0; i < last_limb_index; i++) {
        quotient_microlimbs[i] = split_standard_limb_into_micro_limbs(quotient_limbs[i]);
    }
    quotient_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(quotient_limbs[last_limb_index], TOP_QUOTIENT_MICROLIMB_BITS);

    // Start filling the witness container
    AccumulationInput input{
        .ultra_op = ultra_op,
        .P_x_limbs = p_x_limbs,
        .P_x_microlimbs = P_x_microlimbs,
        .P_y_limbs = p_y_limbs,
        .P_y_microlimbs = P_y_microlimbs,
        .z_1_limbs = z_1_limbs,
        .z_1_microlimbs = z_1_microlimbs,
        .z_2_limbs = z_2_limbs,
        .z_2_microlimbs = z_2_microlimbs,
        .previous_accumulator = previous_accumulator_limbs,
        .current_accumulator = remainder_limbs,
        .current_accumulator_microlimbs = current_accumulator_microlimbs,
        .quotient_binary_limbs = quotient_limbs,
        .quotient_microlimbs = quotient_microlimbs,
        .relation_wide_limbs = { low_wide_relation_limb_divided, high_wide_relation_limb_divided },
        .relation_wide_microlimbs = { split_relation_limb_into_micro_limbs(low_wide_relation_limb_divided),
                                      split_relation_limb_into_micro_limbs(high_wide_relation_limb_divided) },

    };

    return input;
}

void TranslatorCircuitBuilder::assert_well_formed_ultra_op(const UltraOp& ultra_op)
{
    // Opcode should be {0,3,4,8}
    size_t op_code = ultra_op.op_code.value();
    ASSERT(op_code == 0 || op_code == 3 || op_code == 4 || op_code == 8);

    // Check and insert x_lo and y_hi into wire 1
    ASSERT(uint256_t(ultra_op.x_lo) <= MAX_LOW_WIDE_LIMB_SIZE);
    ASSERT(uint256_t(ultra_op.y_hi) <= MAX_HIGH_WIDE_LIMB_SIZE);

    // Check and insert x_hi and z_1 into wire 2
    ASSERT(uint256_t(ultra_op.x_hi) <= MAX_HIGH_WIDE_LIMB_SIZE);
    ASSERT(uint256_t(ultra_op.z_1) <= MAX_LOW_WIDE_LIMB_SIZE);

    // Check and insert y_lo and z_2 into wire 3
    ASSERT(uint256_t(ultra_op.y_lo) <= MAX_LOW_WIDE_LIMB_SIZE);
    ASSERT(uint256_t(ultra_op.z_2) <= MAX_LOW_WIDE_LIMB_SIZE);
}

void TranslatorCircuitBuilder::assert_well_formed_accumulation_input(const AccumulationInput& acc_step)
{
    // The first wires OpQueue/Transcript wires
    assert_well_formed_ultra_op(acc_step.ultra_op);

    // Check decomposition of values from the Queue into limbs used in bigfield evaluations
    ASSERT(acc_step.ultra_op.x_lo == (acc_step.P_x_limbs[0] + acc_step.P_x_limbs[1] * SHIFT_1));
    ASSERT(acc_step.ultra_op.x_hi == (acc_step.P_x_limbs[2] + acc_step.P_x_limbs[3] * SHIFT_1));
    ASSERT(acc_step.ultra_op.y_lo == (acc_step.P_y_limbs[0] + acc_step.P_y_limbs[1] * SHIFT_1));
    ASSERT(acc_step.ultra_op.y_hi == (acc_step.P_y_limbs[2] + acc_step.P_y_limbs[3] * SHIFT_1));
    ASSERT(acc_step.ultra_op.z_1 == (acc_step.z_1_limbs[0] + acc_step.z_1_limbs[1] * SHIFT_1));
    ASSERT(acc_step.ultra_op.z_2 == (acc_step.z_2_limbs[0] + acc_step.z_2_limbs[1] * SHIFT_1));
    /**
     * @brief Check correctness of limbs values
     *
     */
    auto check_binary_limbs_maximum_values = []<size_t total_limbs>(const std::array<Fr, total_limbs>& limbs,
                                                                    const uint256_t& MAX_LAST_LIMB =
                                                                        (uint256_t(1) << NUM_LAST_LIMB_BITS)) {
        for (size_t i = 0; i < total_limbs - 1; i++) {
            ASSERT(uint256_t(limbs[i]) < SHIFT_1);
        }
        ASSERT(uint256_t(limbs[total_limbs - 1]) < MAX_LAST_LIMB);
    };

    const auto MAX_Z_LAST_LIMB = uint256_t(1) << (NUM_Z_BITS - NUM_LIMB_BITS);
    const auto MAX_QUOTIENT_LAST_LIMB = uint256_t(1) << (NUM_LAST_QUOTIENT_LIMB_BITS);
    // Check limb values are in 68-bit range
    check_binary_limbs_maximum_values(acc_step.P_x_limbs);
    check_binary_limbs_maximum_values(acc_step.P_y_limbs);
    check_binary_limbs_maximum_values(acc_step.z_1_limbs, /*MAX_LAST_LIMB=*/MAX_Z_LAST_LIMB);
    check_binary_limbs_maximum_values(acc_step.z_2_limbs, /*MAX_LAST_LIMB=*/MAX_Z_LAST_LIMB);
    check_binary_limbs_maximum_values(acc_step.previous_accumulator);
    check_binary_limbs_maximum_values(acc_step.current_accumulator);
    check_binary_limbs_maximum_values(acc_step.quotient_binary_limbs, /*MAX_LAST_LIMB=*/MAX_QUOTIENT_LAST_LIMB);

    // Check limbs used in range constraints are in range
    auto check_micro_limbs_maximum_values =
        []<size_t binary_limb_count, size_t micro_limb_count>(
            const std::array<std::array<Fr, micro_limb_count>, binary_limb_count>& limbs) {
            for (size_t i = 0; i < binary_limb_count; i++) {
                for (size_t j = 0; j < micro_limb_count; j++) {
                    ASSERT(uint256_t(limbs[i][j]) < MICRO_SHIFT);
                }
            }
        };
    check_micro_limbs_maximum_values(acc_step.P_x_microlimbs);
    check_micro_limbs_maximum_values(acc_step.P_y_microlimbs);
    check_micro_limbs_maximum_values(acc_step.z_1_microlimbs);
    check_micro_limbs_maximum_values(acc_step.z_2_microlimbs);
    check_micro_limbs_maximum_values(acc_step.current_accumulator_microlimbs);

    // Check that relation limbs are in range
    ASSERT(uint256_t(acc_step.relation_wide_limbs[0]) < MAX_RELATION_WIDE_LIMB_SIZE);
    ASSERT(uint256_t(acc_step.relation_wide_limbs[1]) < MAX_RELATION_WIDE_LIMB_SIZE);
}

void TranslatorCircuitBuilder::populate_wires_from_ultra_op(const UltraOp& ultra_op)
{
    auto& op_wire = std::get<WireIds::OP>(wires);
    op_wire.push_back(add_variable(ultra_op.op_code.value()));
    // Similarly to the ColumnPolynomials in the merge protocol, the op_wire is 0 at every second index
    op_wire.push_back(zero_idx);

    insert_pair_into_wire(WireIds::X_LOW_Y_HI, ultra_op.x_lo, ultra_op.y_hi);

    insert_pair_into_wire(WireIds::X_HIGH_Z_1, ultra_op.x_hi, ultra_op.z_1);

    insert_pair_into_wire(WireIds::Y_LOW_Z_2, ultra_op.y_lo, ultra_op.z_2);
}

/**
 * @brief Create a single accumulation gate
 *
 * @param acc_step
 */
void TranslatorCircuitBuilder::create_accumulation_gate(const AccumulationInput& acc_step)
{
    assert_well_formed_accumulation_input(acc_step);

    populate_wires_from_ultra_op(acc_step.ultra_op);

    // Insert limbs used in bigfield evaluations
    insert_pair_into_wire(P_X_LOW_LIMBS, acc_step.P_x_limbs[0], acc_step.P_x_limbs[1]);
    insert_pair_into_wire(P_X_HIGH_LIMBS, acc_step.P_x_limbs[2], acc_step.P_x_limbs[3]);
    insert_pair_into_wire(P_Y_LOW_LIMBS, acc_step.P_y_limbs[0], acc_step.P_y_limbs[1]);
    insert_pair_into_wire(P_Y_HIGH_LIMBS, acc_step.P_y_limbs[2], acc_step.P_y_limbs[3]);
    insert_pair_into_wire(Z_LOW_LIMBS, acc_step.z_1_limbs[0], acc_step.z_2_limbs[0]);
    insert_pair_into_wire(Z_HIGH_LIMBS, acc_step.z_1_limbs[1], acc_step.z_2_limbs[1]);
    insert_pair_into_wire(
        QUOTIENT_LOW_BINARY_LIMBS, acc_step.quotient_binary_limbs[0], acc_step.quotient_binary_limbs[1]);
    insert_pair_into_wire(
        QUOTIENT_HIGH_BINARY_LIMBS, acc_step.quotient_binary_limbs[2], acc_step.quotient_binary_limbs[3]);
    insert_pair_into_wire(RELATION_WIDE_LIMBS, acc_step.relation_wide_limbs[0], acc_step.relation_wide_limbs[1]);

    // We are using some leftover crevices for relation_wide_microlimbs
    auto low_relation_microlimbs = acc_step.relation_wide_microlimbs[0];
    auto high_relation_microlimbs = acc_step.relation_wide_microlimbs[1];

    // We have 4 wires specifically for the relation microlimbs
    insert_pair_into_wire(
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0, low_relation_microlimbs[0], high_relation_microlimbs[0]);
    insert_pair_into_wire(
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1, low_relation_microlimbs[1], high_relation_microlimbs[1]);
    insert_pair_into_wire(
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2, low_relation_microlimbs[2], high_relation_microlimbs[2]);
    insert_pair_into_wire(
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3, low_relation_microlimbs[3], high_relation_microlimbs[3]);

    // Next ones go into top P_x and P_y, current accumulator and quotient unused microlimbs

    // Insert the second highest low relation microlimb into the space left in P_x range constraints highest wire
    auto top_p_x_microlimbs = acc_step.P_x_microlimbs[NUM_BINARY_LIMBS - 1];
    top_p_x_microlimbs[NUM_MICRO_LIMBS - 1] = low_relation_microlimbs[NUM_MICRO_LIMBS - 2];

    // Insert the second highest high relation microlimb into the space left in P_y range constraints highest wire
    auto top_p_y_microlimbs = acc_step.P_y_microlimbs[NUM_BINARY_LIMBS - 1];
    top_p_y_microlimbs[NUM_MICRO_LIMBS - 1] = high_relation_microlimbs[NUM_MICRO_LIMBS - 2];

    // The highest low relation microlimb goes into the crevice left in current accumulator microlimbs
    auto top_current_accumulator_microlimbs = acc_step.current_accumulator_microlimbs[NUM_BINARY_LIMBS - 1];
    top_current_accumulator_microlimbs[NUM_MICRO_LIMBS - 1] = low_relation_microlimbs[NUM_MICRO_LIMBS - 1];

    // The highest high relation microlimb goes into the quotient crevice
    auto top_quotient_microlimbs = acc_step.quotient_microlimbs[NUM_BINARY_LIMBS - 1];
    top_quotient_microlimbs[NUM_MICRO_LIMBS - 1] = high_relation_microlimbs[NUM_MICRO_LIMBS - 1];

    /**
     * @brief Put several values in sequential wires
     *
     */
    auto lay_limbs_in_row = [this]<size_t array_size>(std::array<Fr, array_size> input, WireIds starting_wire) {
        size_t wire_index = starting_wire;
        for (auto element : input) {
            wires[wire_index].push_back(add_variable(element));
            wire_index++;
        }
    };

    // Now put all microlimbs into appropriate wires
    lay_limbs_in_row(acc_step.P_x_microlimbs[0], P_X_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_x_microlimbs[1], P_X_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_x_microlimbs[2], P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_p_x_microlimbs, P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[0], P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[1], P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[2], P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_p_y_microlimbs, P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_1_microlimbs[0], Z_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_2_microlimbs[0], Z_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_1_microlimbs[1], Z_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_2_microlimbs[1], Z_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator, ACCUMULATORS_BINARY_LIMBS_0);
    lay_limbs_in_row(acc_step.previous_accumulator, ACCUMULATORS_BINARY_LIMBS_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[0], ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[1], ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[2], ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_current_accumulator_microlimbs, ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[0], QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[1], QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[2], QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(top_quotient_microlimbs, QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0);

    num_gates += 2;

    // Check that all the wires are filled equally
    bb::constexpr_for<0, TOTAL_COUNT, 1>([&]<size_t i>() { ASSERT(std::get<i>(wires).size() == num_gates); });
}

void TranslatorCircuitBuilder::feed_ecc_op_queue_into_circuit(const std::shared_ptr<ECCOpQueue> ecc_op_queue)
{
    using Fq = bb::fq;
    const auto& ultra_ops = ecc_op_queue->get_ultra_ops();
    std::vector<Fq> accumulator_trace;
    Fq current_accumulator(0);
    if (ultra_ops.empty()) {
        return;
    }

    // Process the first UltraOp - a no-op - and populate with zeros the beginning of all other wires to ensure all wire
    // polynomials in translator start with 0 (required for shifted polynomials in the proving system). Technically,
    // we'd need only first index to be a zero but, given each "real" UltraOp populates two indices in a polynomial we
    // add two zeros for consistency.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1360): We'll also have to eventually process random
    // data in the merge protocol (added for zero knowledge)/
    populate_wires_from_ultra_op(ultra_ops[0]);
    for (auto& wire : wires) {
        if (wire.empty()) {
            wire.push_back(zero_idx);
            wire.push_back(zero_idx);
        }
    }
    num_gates += 2;

    // We need to precompute the accumulators at each step, because in the actual circuit we compute the values starting
    // from the later indices. We need to know the previous accumulator to create the gate
    for (size_t i = 1; i < ultra_ops.size(); i++) {
        const auto& ultra_op = ultra_ops[ultra_ops.size() - i];
        current_accumulator *= evaluation_input_x;
        const auto [x_256, y_256] = ultra_op.get_base_point_standard_form();
        current_accumulator +=
            Fq(ultra_op.op_code.value()) +
            batching_challenge_v *
                (x_256 + batching_challenge_v *
                             (y_256 + batching_challenge_v *
                                          (uint256_t(ultra_op.z_1) + batching_challenge_v * uint256_t(ultra_op.z_2))));
        accumulator_trace.push_back(current_accumulator);
    }

    // We don't care about the last value since we'll recompute it during witness generation anyway
    accumulator_trace.pop_back();

    // Generate witness values from all the UltraOps
    for (size_t i = 1; i < ultra_ops.size(); i++) {
        const auto& ultra_op = ultra_ops[i];
        Fq previous_accumulator = 0;
        // Pop the last value from accumulator trace and use it as previous accumulator
        if (!accumulator_trace.empty()) {
            previous_accumulator = accumulator_trace.back();
            accumulator_trace.pop_back();
        }
        // Compute witness values
        AccumulationInput one_accumulation_step =
            generate_witness_values(ultra_op, previous_accumulator, batching_challenge_v, evaluation_input_x);

        // And put them into the wires
        create_accumulation_gate(one_accumulation_step);
    }
}
} // namespace bb

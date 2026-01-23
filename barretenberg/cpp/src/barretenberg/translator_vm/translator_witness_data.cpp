// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file translator_witness_data.cpp
 * @brief Witness generation for Goblin Translator circuit
 *
 * This computes witness values for the Translator circuit, which verifies the correctness
 * of batched evaluation of EccOpQueue polynomials in non-native field arithmetic.
 */

#include "translator_witness_data.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb {

TranslatorWitnessData::TranslatorWitnessData(Fq batching_challenge_v_,
                                             Fq evaluation_input_x_,
                                             const std::shared_ptr<ECCOpQueue>& op_queue,
                                             bool avm_mode_)
    : batching_challenge_v(batching_challenge_v_)
    , evaluation_input_x(evaluation_input_x_)
    , avm_mode(avm_mode_)
{
    feed_ecc_op_queue_into_circuit(op_queue);
}

TranslatorWitnessData::AccumulationInput TranslatorWitnessData::generate_witness_values(const UltraOp& ultra_op,
                                                                                        const Fq& previous_accumulator,
                                                                                        const Fq& batching_challenge_v,
                                                                                        const Fq& evaluation_input_x)
{
    /**
     * @brief A small function to transform a uint512_t element into its 4 68-bit limbs in Fr scalars
     */
    auto uint512_t_to_limbs = [](const uint512_t& original) {
        return std::array<Fr, NUM_BINARY_LIMBS>{ Fr(original.slice(0, NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS).lo),
                                                 Fr(original.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS).lo) };
    };

    /**
     * @brief A function for splitting wide limbs (P_x_lo, P_y_hi, etc) into two limbs
     */
    auto split_wide_limb_into_2_limbs = [](const Fr& wide_limb) {
        return std::array<Fr, NUM_Z_LIMBS>{ Fr(uint256_t(wide_limb).slice(0, NUM_LIMB_BITS)),
                                            Fr(uint256_t(wide_limb).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)) };
    };

    /**
     * @brief A function to split a limb into microlimbs for range constraints
     */
    auto split_limb_into_microlimbs = [](const Fr& limb, const size_t num_bits) {
        static_assert(MICRO_LIMB_BITS == 14);
        size_t num_full_micro_limbs = num_bits / MICRO_LIMB_BITS;
        size_t last_limb_bits = num_bits % MICRO_LIMB_BITS;
        std::array<Fr, NUM_MICRO_LIMBS> microlimbs{};

        for (size_t i = 0; i < num_full_micro_limbs; ++i) {
            microlimbs[i] = uint256_t(limb).slice(i * MICRO_LIMB_BITS, (i + 1) * MICRO_LIMB_BITS);
        }

        if (last_limb_bits > 0) {
            microlimbs[num_full_micro_limbs] = uint256_t(limb).slice(num_full_micro_limbs * MICRO_LIMB_BITS,
                                                                     (num_full_micro_limbs + 1) * MICRO_LIMB_BITS);
            microlimbs[num_full_micro_limbs + 1] = uint256_t(microlimbs[num_full_micro_limbs])
                                                   << (MICRO_LIMB_BITS - last_limb_bits);
        }
        return microlimbs;
    };

    // Powers of v
    Fq v_squared = batching_challenge_v * batching_challenge_v;
    Fq v_cubed = v_squared * batching_challenge_v;
    Fq v_quarted = v_cubed * batching_challenge_v;

    // Convert to bigfield form
    auto previous_accumulator_limbs = split_fq_into_limbs(previous_accumulator);
    auto v_witnesses = split_fq_into_limbs(batching_challenge_v);
    auto v_squared_witnesses = split_fq_into_limbs(v_squared);
    auto v_cubed_witnesses = split_fq_into_limbs(v_cubed);
    auto v_quarted_witnesses = split_fq_into_limbs(v_quarted);
    auto x_witnesses = split_fq_into_limbs(evaluation_input_x);

    // uint512_t versions for quotient computation
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

    // Construct Fq for witness computation
    Fq base_op = Fq(uint256_t(op_code));
    Fq base_p_x = Fq(uint256_t(ultra_op.x_lo) + (uint256_t(ultra_op.x_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_p_y = Fq(uint256_t(ultra_op.y_lo) + (uint256_t(ultra_op.y_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_z_1 = Fq(uint256_t(ultra_op.z_1));
    Fq base_z_2 = Fq(uint256_t(ultra_op.z_2));

    // Construct bigfield representations
    auto [p_x_0, p_x_1] = split_wide_limb_into_2_limbs(ultra_op.x_lo);
    auto [p_x_2, p_x_3] = split_wide_limb_into_2_limbs(ultra_op.x_hi);
    std::array<Fr, NUM_BINARY_LIMBS> p_x_limbs = { p_x_0, p_x_1, p_x_2, p_x_3 };
    auto [p_y_0, p_y_1] = split_wide_limb_into_2_limbs(ultra_op.y_lo);
    auto [p_y_2, p_y_3] = split_wide_limb_into_2_limbs(ultra_op.y_hi);
    std::array<Fr, NUM_BINARY_LIMBS> p_y_limbs = { p_y_0, p_y_1, p_y_2, p_y_3 };

    auto z_1_limbs = split_wide_limb_into_2_limbs(ultra_op.z_1);
    auto z_2_limbs = split_wide_limb_into_2_limbs(ultra_op.z_2);

    // Compute remainder (new accumulator value)
    // clang-format off
    const Fq remainder = previous_accumulator * evaluation_input_x +
                         base_op                                   +
                         base_p_x * batching_challenge_v           +
                         base_p_y * v_squared                      +
                         base_z_1 * v_cubed                        +
                         base_z_2 * v_quarted;

    // Compute quotient
    uint512_t quotient_by_modulus = uint_previous_accumulator * uint_x +
                                    uint_op                            +
                                    uint_p_x * uint_v                  +
                                    uint_p_y * uint_v_squared          +
                                    uint_z1  * uint_v_cubed            +
                                    uint_z2  * uint_v_quarted          -
                                    uint512_t(remainder);
    // clang-format on

    uint512_t quotient = quotient_by_modulus / uint512_t(Fq::modulus);
    BB_ASSERT_EQ(quotient_by_modulus, quotient * uint512_t(Fq::modulus));

    auto remainder_limbs = split_fq_into_limbs(remainder);
    std::array<Fr, NUM_BINARY_LIMBS> quotient_limbs = uint512_t_to_limbs(quotient);

    // Compute relation limbs for mod 2^272 check
    // clang-format off
    Fr low_wide_relation_limb_part_1 =
        previous_accumulator_limbs[0] * x_witnesses[0]            +
        op_code                                                   +
        p_x_limbs[0]                  * v_witnesses[0]            +
        p_y_limbs[0]                  * v_squared_witnesses[0]    +
        z_1_limbs[0]                  * v_cubed_witnesses[0]      +
        z_2_limbs[0]                  * v_quarted_witnesses[0]    +
        quotient_limbs[0]             * NEGATIVE_MODULUS_LIMBS[0] -
        remainder_limbs[0];

    Fr low_wide_relation_limb =
        low_wide_relation_limb_part_1 +
        (previous_accumulator_limbs[1] * x_witnesses[0]            +
         previous_accumulator_limbs[0] * x_witnesses[1]            +
         p_x_limbs[0]                  * v_witnesses[1]            +
         p_x_limbs[1]                  * v_witnesses[0]            +
         p_y_limbs[0]                  * v_squared_witnesses[1]    +
         p_y_limbs[1]                  * v_squared_witnesses[0]    +
         z_1_limbs[0]                  * v_cubed_witnesses[1]      +
         z_1_limbs[1]                  * v_cubed_witnesses[0]      +
         z_2_limbs[0]                  * v_quarted_witnesses[1]    +
         z_2_limbs[1]                  * v_quarted_witnesses[0]    +
         quotient_limbs[0]             * NEGATIVE_MODULUS_LIMBS[1] +
         quotient_limbs[1]             * NEGATIVE_MODULUS_LIMBS[0] -
         remainder_limbs[1]) * SHIFT_1;
    // clang-format on

    BB_ASSERT_EQ(uint256_t(low_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS), 0U);
    Fr low_wide_relation_limb_divided = low_wide_relation_limb * SHIFT_2_INVERSE;

    // clang-format off
    Fr high_wide_relation_limb_part_1 =
        low_wide_relation_limb_divided                            +
        previous_accumulator_limbs[2] * x_witnesses[0]            +
        previous_accumulator_limbs[1] * x_witnesses[1]            +
        previous_accumulator_limbs[0] * x_witnesses[2]            +
        p_x_limbs[0]                  * v_witnesses[2]            +
        p_x_limbs[1]                  * v_witnesses[1]            +
        p_x_limbs[2]                  * v_witnesses[0]            +
        p_y_limbs[0]                  * v_squared_witnesses[2]    +
        p_y_limbs[1]                  * v_squared_witnesses[1]    +
        p_y_limbs[2]                  * v_squared_witnesses[0]    +
        z_1_limbs[0]                  * v_cubed_witnesses[2]      +
        z_1_limbs[1]                  * v_cubed_witnesses[1]      +
        z_2_limbs[0]                  * v_quarted_witnesses[2]    +
        z_2_limbs[1]                  * v_quarted_witnesses[1]    +
        quotient_limbs[2]             * NEGATIVE_MODULUS_LIMBS[0] +
        quotient_limbs[1]             * NEGATIVE_MODULUS_LIMBS[1] +
        quotient_limbs[0]             * NEGATIVE_MODULUS_LIMBS[2] -
        remainder_limbs[2];

    Fr high_wide_relation_limb =
        high_wide_relation_limb_part_1 +
        (previous_accumulator_limbs[3] * x_witnesses[0]            +
         previous_accumulator_limbs[2] * x_witnesses[1]            +
         previous_accumulator_limbs[1] * x_witnesses[2]            +
         previous_accumulator_limbs[0] * x_witnesses[3]            +
         p_x_limbs[0]                  * v_witnesses[3]            +
         p_x_limbs[1]                  * v_witnesses[2]            +
         p_x_limbs[2]                  * v_witnesses[1]            +
         p_x_limbs[3]                  * v_witnesses[0]            +
         p_y_limbs[0]                  * v_squared_witnesses[3]    +
         p_y_limbs[1]                  * v_squared_witnesses[2]    +
         p_y_limbs[2]                  * v_squared_witnesses[1]    +
         p_y_limbs[3]                  * v_squared_witnesses[0]    +
         z_1_limbs[0]                  * v_cubed_witnesses[3]      +
         z_1_limbs[1]                  * v_cubed_witnesses[2]      +
         z_2_limbs[0]                  * v_quarted_witnesses[3]    +
         z_2_limbs[1]                  * v_quarted_witnesses[2]    +
         quotient_limbs[3]             * NEGATIVE_MODULUS_LIMBS[0] +
         quotient_limbs[2]             * NEGATIVE_MODULUS_LIMBS[1] +
         quotient_limbs[1]             * NEGATIVE_MODULUS_LIMBS[2] +
         quotient_limbs[0]             * NEGATIVE_MODULUS_LIMBS[3] -
         remainder_limbs[3]) * SHIFT_1;
    // clang-format on

    BB_ASSERT_EQ(uint256_t(high_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS), 0U);
    auto high_wide_relation_limb_divided = high_wide_relation_limb * SHIFT_2_INVERSE;

    const auto last_limb_index = NUM_BINARY_LIMBS - 1;

    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_x_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_y_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_1_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_2_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> current_accumulator_microlimbs;
    std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> quotient_microlimbs;

    // Split standard 68-bit limbs into microlimbs
    for (size_t i = 0; i < last_limb_index; i++) {
        P_x_microlimbs[i] = split_limb_into_microlimbs(p_x_limbs[i], NUM_LIMB_BITS);
        P_y_microlimbs[i] = split_limb_into_microlimbs(p_y_limbs[i], NUM_LIMB_BITS);
        current_accumulator_microlimbs[i] = split_limb_into_microlimbs(remainder_limbs[i], NUM_LIMB_BITS);
        quotient_microlimbs[i] = split_limb_into_microlimbs(quotient_limbs[i], NUM_LIMB_BITS);
    }

    // Split top limbs with varying bit sizes
    P_x_microlimbs[last_limb_index] = split_limb_into_microlimbs(p_x_limbs[last_limb_index], NUM_LAST_LIMB_BITS);
    P_y_microlimbs[last_limb_index] = split_limb_into_microlimbs(p_y_limbs[last_limb_index], NUM_LAST_LIMB_BITS);
    current_accumulator_microlimbs[last_limb_index] =
        split_limb_into_microlimbs(remainder_limbs[last_limb_index], NUM_LAST_LIMB_BITS);
    quotient_microlimbs[last_limb_index] =
        split_limb_into_microlimbs(quotient_limbs[last_limb_index], NUM_LAST_QUOTIENT_LIMB_BITS);

    // Split z scalars
    for (size_t i = 0; i < NUM_Z_LIMBS - 1; i++) {
        z_1_microlimbs[i] = split_limb_into_microlimbs(z_1_limbs[i], NUM_LIMB_BITS);
        z_2_microlimbs[i] = split_limb_into_microlimbs(z_2_limbs[i], NUM_LIMB_BITS);
    }
    z_1_microlimbs[NUM_Z_LIMBS - 1] =
        split_limb_into_microlimbs(z_1_limbs[NUM_Z_LIMBS - 1], NUM_Z_BITS - NUM_LIMB_BITS);
    z_2_microlimbs[NUM_Z_LIMBS - 1] =
        split_limb_into_microlimbs(z_2_limbs[NUM_Z_LIMBS - 1], NUM_Z_BITS - NUM_LIMB_BITS);

    return AccumulationInput{
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
        .relation_wide_microlimbs = { split_limb_into_microlimbs(low_wide_relation_limb_divided,
                                                                 RELATION_WIDE_LIMB_BITS),
                                      split_limb_into_microlimbs(high_wide_relation_limb_divided,
                                                                 RELATION_WIDE_LIMB_BITS) },
    };
}

void TranslatorWitnessData::assert_well_formed_ultra_op(const UltraOp& ultra_op)
{
    size_t op_code = ultra_op.op_code.value();
    BB_ASSERT(op_code == 0 || op_code == 3 || op_code == 4 || op_code == 8);

    BB_ASSERT_LTE(uint256_t(ultra_op.x_lo), MAX_LOW_WIDE_LIMB_SIZE);
    BB_ASSERT_LTE(uint256_t(ultra_op.y_hi), MAX_HIGH_WIDE_LIMB_SIZE);
    BB_ASSERT_LTE(uint256_t(ultra_op.x_hi), MAX_HIGH_WIDE_LIMB_SIZE);
    BB_ASSERT_LTE(uint256_t(ultra_op.z_1), MAX_Z_LIMB_SIZE);
    BB_ASSERT_LTE(uint256_t(ultra_op.y_lo), MAX_LOW_WIDE_LIMB_SIZE);
    BB_ASSERT_LTE(uint256_t(ultra_op.z_2), MAX_Z_LIMB_SIZE);
}

void TranslatorWitnessData::assert_well_formed_accumulation_input(const AccumulationInput& acc_step)
{
    assert_well_formed_ultra_op(acc_step.ultra_op);

    // Check decomposition correctness
    BB_ASSERT_EQ(acc_step.ultra_op.x_lo, acc_step.P_x_limbs[0] + acc_step.P_x_limbs[1] * SHIFT_1);
    BB_ASSERT_EQ(acc_step.ultra_op.x_hi, acc_step.P_x_limbs[2] + acc_step.P_x_limbs[3] * SHIFT_1);
    BB_ASSERT_EQ(acc_step.ultra_op.y_lo, acc_step.P_y_limbs[0] + acc_step.P_y_limbs[1] * SHIFT_1);
    BB_ASSERT_EQ(acc_step.ultra_op.y_hi, acc_step.P_y_limbs[2] + acc_step.P_y_limbs[3] * SHIFT_1);
    BB_ASSERT_EQ(acc_step.ultra_op.z_1, acc_step.z_1_limbs[0] + acc_step.z_1_limbs[1] * SHIFT_1);
    BB_ASSERT_EQ(acc_step.ultra_op.z_2, acc_step.z_2_limbs[0] + acc_step.z_2_limbs[1] * SHIFT_1);

    // Check limb values are in range
    auto check_binary_limbs_maximum_values = []<size_t total_limbs>(const std::array<Fr, total_limbs>& limbs,
                                                                    const uint256_t& MAX_LAST_LIMB =
                                                                        (uint256_t(1) << NUM_LAST_LIMB_BITS)) {
        for (size_t i = 0; i < total_limbs - 1; i++) {
            BB_ASSERT_LT(uint256_t(limbs[i]), SHIFT_1);
        }
        BB_ASSERT_LT(uint256_t(limbs[total_limbs - 1]), MAX_LAST_LIMB);
    };

    const auto MAX_Z_LAST_LIMB = uint256_t(1) << (NUM_Z_BITS - NUM_LIMB_BITS);
    const auto MAX_QUOTIENT_LAST_LIMB = uint256_t(1) << (NUM_LAST_QUOTIENT_LIMB_BITS);

    check_binary_limbs_maximum_values(acc_step.P_x_limbs);
    check_binary_limbs_maximum_values(acc_step.P_y_limbs);
    check_binary_limbs_maximum_values(acc_step.z_1_limbs, MAX_Z_LAST_LIMB);
    check_binary_limbs_maximum_values(acc_step.z_2_limbs, MAX_Z_LAST_LIMB);
    check_binary_limbs_maximum_values(acc_step.previous_accumulator);
    check_binary_limbs_maximum_values(acc_step.current_accumulator);
    check_binary_limbs_maximum_values(acc_step.quotient_binary_limbs, MAX_QUOTIENT_LAST_LIMB);

    // Check microlimbs are in range
    auto check_micro_limbs_maximum_values =
        []<size_t binary_limb_count, size_t micro_limb_count>(
            const std::array<std::array<Fr, micro_limb_count>, binary_limb_count>& limbs) {
            for (size_t i = 0; i < binary_limb_count; i++) {
                for (size_t j = 0; j < micro_limb_count; j++) {
                    BB_ASSERT_LT(uint256_t(limbs[i][j]), MICRO_SHIFT);
                }
            }
        };

    check_micro_limbs_maximum_values(acc_step.P_x_microlimbs);
    check_micro_limbs_maximum_values(acc_step.P_y_microlimbs);
    check_micro_limbs_maximum_values(acc_step.z_1_microlimbs);
    check_micro_limbs_maximum_values(acc_step.z_2_microlimbs);
    check_micro_limbs_maximum_values(acc_step.current_accumulator_microlimbs);

    BB_ASSERT_LT(uint256_t(acc_step.relation_wide_limbs[0]), MAX_RELATION_WIDE_LIMB_SIZE);
    BB_ASSERT_LT(uint256_t(acc_step.relation_wide_limbs[1]), MAX_RELATION_WIDE_LIMB_SIZE);
}

void TranslatorWitnessData::populate_wires_from_ultra_op(const UltraOp& ultra_op)
{
    auto& op_wire = wire_values[WireIdx::OP];
    if (ultra_op.op_code.is_random_op) {
        op_wire.push_back(Fr(ultra_op.op_code.random_value_1));
        op_wire.push_back(Fr(ultra_op.op_code.random_value_2));
    } else {
        op_wire.push_back(Fr(ultra_op.op_code.value()));
        op_wire.push_back(Fr::zero());
    }

    insert_pair_into_wire(WireIdx::X_LOW_Y_HI, ultra_op.x_lo, ultra_op.y_hi);
    insert_pair_into_wire(WireIdx::X_HIGH_Z_1, ultra_op.x_hi, ultra_op.z_1);
    insert_pair_into_wire(WireIdx::Y_LOW_Z_2, ultra_op.y_lo, ultra_op.z_2);
}

void TranslatorWitnessData::create_accumulation_gate(const AccumulationInput& acc_step)
{
    assert_well_formed_accumulation_input(acc_step);

    populate_wires_from_ultra_op(acc_step.ultra_op);

    // Insert limbs used in bigfield evaluations
    insert_pair_into_wire(WireIdx::P_X_LOW_LIMBS, acc_step.P_x_limbs[0], acc_step.P_x_limbs[1]);
    insert_pair_into_wire(WireIdx::P_X_HIGH_LIMBS, acc_step.P_x_limbs[2], acc_step.P_x_limbs[3]);
    insert_pair_into_wire(WireIdx::P_Y_LOW_LIMBS, acc_step.P_y_limbs[0], acc_step.P_y_limbs[1]);
    insert_pair_into_wire(WireIdx::P_Y_HIGH_LIMBS, acc_step.P_y_limbs[2], acc_step.P_y_limbs[3]);
    insert_pair_into_wire(WireIdx::Z_LOW_LIMBS, acc_step.z_1_limbs[0], acc_step.z_2_limbs[0]);
    insert_pair_into_wire(WireIdx::Z_HIGH_LIMBS, acc_step.z_1_limbs[1], acc_step.z_2_limbs[1]);
    insert_pair_into_wire(
        WireIdx::QUOTIENT_LOW_BINARY_LIMBS, acc_step.quotient_binary_limbs[0], acc_step.quotient_binary_limbs[1]);
    insert_pair_into_wire(
        WireIdx::QUOTIENT_HIGH_BINARY_LIMBS, acc_step.quotient_binary_limbs[2], acc_step.quotient_binary_limbs[3]);
    insert_pair_into_wire(
        WireIdx::RELATION_WIDE_LIMBS, acc_step.relation_wide_limbs[0], acc_step.relation_wide_limbs[1]);

    // Relation microlimbs with crevice optimization
    auto low_relation_microlimbs = acc_step.relation_wide_microlimbs[0];
    auto high_relation_microlimbs = acc_step.relation_wide_microlimbs[1];

    insert_pair_into_wire(
        WireIdx::RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0, low_relation_microlimbs[0], high_relation_microlimbs[0]);
    insert_pair_into_wire(
        WireIdx::RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1, low_relation_microlimbs[1], high_relation_microlimbs[1]);
    insert_pair_into_wire(
        WireIdx::RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2, low_relation_microlimbs[2], high_relation_microlimbs[2]);
    insert_pair_into_wire(
        WireIdx::RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3, low_relation_microlimbs[3], high_relation_microlimbs[3]);

    // Insert remaining microlimbs into crevices
    auto top_p_x_microlimbs = acc_step.P_x_microlimbs[NUM_BINARY_LIMBS - 1];
    top_p_x_microlimbs[NUM_MICRO_LIMBS - 1] = low_relation_microlimbs[NUM_MICRO_LIMBS - 2];

    auto top_p_y_microlimbs = acc_step.P_y_microlimbs[NUM_BINARY_LIMBS - 1];
    top_p_y_microlimbs[NUM_MICRO_LIMBS - 1] = high_relation_microlimbs[NUM_MICRO_LIMBS - 2];

    auto top_current_accumulator_microlimbs = acc_step.current_accumulator_microlimbs[NUM_BINARY_LIMBS - 1];
    top_current_accumulator_microlimbs[NUM_MICRO_LIMBS - 1] = low_relation_microlimbs[NUM_MICRO_LIMBS - 1];

    auto top_quotient_microlimbs = acc_step.quotient_microlimbs[NUM_BINARY_LIMBS - 1];
    top_quotient_microlimbs[NUM_MICRO_LIMBS - 1] = high_relation_microlimbs[NUM_MICRO_LIMBS - 1];

    /**
     * @brief Helper to lay microlimbs in sequential wires
     */
    auto lay_limbs_in_row = [this]<size_t array_size>(std::array<Fr, array_size> input, WireIdx starting_wire) {
        size_t wire_index = starting_wire;
        for (auto element : input) {
            wire_values[wire_index].push_back(element);
            wire_index++;
        }
    };

    // Put all microlimbs into appropriate wires
    lay_limbs_in_row(acc_step.P_x_microlimbs[0], WireIdx::P_X_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_x_microlimbs[1], WireIdx::P_X_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_x_microlimbs[2], WireIdx::P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_p_x_microlimbs, WireIdx::P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[0], WireIdx::P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[1], WireIdx::P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.P_y_microlimbs[2], WireIdx::P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_p_y_microlimbs, WireIdx::P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_1_microlimbs[0], WireIdx::Z_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_2_microlimbs[0], WireIdx::Z_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_1_microlimbs[1], WireIdx::Z_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.z_2_microlimbs[1], WireIdx::Z_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator, WireIdx::ACCUMULATORS_BINARY_LIMBS_0);
    lay_limbs_in_row(acc_step.previous_accumulator, WireIdx::ACCUMULATORS_BINARY_LIMBS_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[0], WireIdx::ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[1], WireIdx::ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.current_accumulator_microlimbs[2], WireIdx::ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(top_current_accumulator_microlimbs, WireIdx::ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[0], WireIdx::QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[1], WireIdx::QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(acc_step.quotient_microlimbs[2], WireIdx::QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0);
    lay_limbs_in_row(top_quotient_microlimbs, WireIdx::QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0);

    num_rows_ += 2;

    // Verify all wires are filled equally
    for (size_t i = 0; i < NUM_WIRES; i++) {
        BB_ASSERT_EQ(wire_values[i].size(), num_rows_);
    }
}

void TranslatorWitnessData::feed_ecc_op_queue_into_circuit(const std::shared_ptr<ECCOpQueue>& ecc_op_queue)
{
    const auto& ultra_ops = ecc_op_queue->get_ultra_ops();
    std::vector<Fq> accumulator_trace;
    Fq current_accumulator(0);

    if (ultra_ops.empty()) {
        return;
    }

    // Handle the initial UltraOp (a no-op) by filling start of all wires with zeros
    for (auto& wire : wire_values) {
        wire.push_back(Fr::zero());
        wire.push_back(Fr::zero());
    }
    num_rows_ += 2;

    auto process_random_op = [&](const UltraOp& ultra_op) {
        BB_ASSERT(ultra_op.op_code.is_random_op, "function should only be called to process a random op");
        populate_wires_from_ultra_op(ultra_op);
        // Populate other wires with zeros
        for (size_t i = WireIdx::P_X_LOW_LIMBS; i < wire_values.size(); i++) {
            wire_values[i].push_back(Fr::zero());
            wire_values[i].push_back(Fr::zero());
        }
        num_rows_ += 2;
    };

    // Process random operations at the beginning
    for (size_t i = NUM_NO_OPS_START; i <= NUM_RANDOM_OPS_START; ++i) {
        process_random_op(ultra_ops[i]);
    }

    const size_t ops_end = avm_mode ? ultra_ops.size() : ultra_ops.size() - NUM_RANDOM_OPS_END;
    std::span ultra_ops_span(ultra_ops.begin() + static_cast<std::ptrdiff_t>(NUM_NO_OPS_START + NUM_RANDOM_OPS_START),
                             ultra_ops.begin() + static_cast<std::ptrdiff_t>(ops_end));

    // Pre-compute accumulator values in reverse order
    for (const auto& ultra_op : std::ranges::reverse_view(ultra_ops_span)) {
        if (ultra_op.op_code.value() == 0) {
            continue;
        }
        current_accumulator *= evaluation_input_x;
        const auto [x_fq, y_fq] = ultra_op.get_base_point_standard_form();
        current_accumulator +=
            Fq(ultra_op.op_code.value()) +
            batching_challenge_v *
                (x_fq + batching_challenge_v *
                            (y_fq + batching_challenge_v *
                                        (uint256_t(ultra_op.z_1) + batching_challenge_v * uint256_t(ultra_op.z_2))));
        accumulator_trace.push_back(current_accumulator);
    }

    Fq final_accumulator_state = accumulator_trace.back();
    accumulator_trace.pop_back();

    std::array<Fr, NUM_BINARY_LIMBS> previous_accumulator_binary_limbs = split_fq_into_limbs(final_accumulator_state);

    // Generate witness values and accumulation gates
    for (const auto& ultra_op : ultra_ops_span) {
        if (ultra_op.op_code.value() == 0) {
            // For no-op operations, copy accumulator and fill rest with zeros
            for (size_t j = 0; j < WireIdx::ACCUMULATORS_BINARY_LIMBS_0; j++) {
                wire_values[j].push_back(Fr::zero());
                wire_values[j].push_back(Fr::zero());
            }
            size_t idx = 0;
            for (size_t j = WireIdx::ACCUMULATORS_BINARY_LIMBS_0; j <= WireIdx::ACCUMULATORS_BINARY_LIMBS_3; j++) {
                wire_values[j].push_back(previous_accumulator_binary_limbs[idx]);
                wire_values[j].push_back(previous_accumulator_binary_limbs[idx]);
                idx++;
            }
            for (size_t j = WireIdx::ACCUMULATORS_BINARY_LIMBS_3 + 1; j < NUM_WIRES; j++) {
                wire_values[j].push_back(Fr::zero());
                wire_values[j].push_back(Fr::zero());
            }
            num_rows_ += 2;
            continue;
        }

        Fq previous_accumulator{ 0 };
        if (!accumulator_trace.empty()) {
            previous_accumulator = accumulator_trace.back();
            accumulator_trace.pop_back();
        }

        AccumulationInput one_accumulation_step =
            generate_witness_values(ultra_op, previous_accumulator, batching_challenge_v, evaluation_input_x);

        previous_accumulator_binary_limbs = one_accumulation_step.previous_accumulator;
        create_accumulation_gate(one_accumulation_step);
    }

    // Process random operations at the end
    for (size_t i = ops_end; i < ultra_ops.size(); ++i) {
        process_random_op(ultra_ops[i]);
    }
}

} // namespace bb

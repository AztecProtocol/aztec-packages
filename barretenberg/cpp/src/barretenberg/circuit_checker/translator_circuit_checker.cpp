#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"

namespace bb {
TranslatorCircuitChecker::RelationInputs TranslatorCircuitChecker::compute_relation_inputs_limbs(
    const Fq& batching_challenge_v, const Fq& evaluation_input_x)
{
    Fq v_squared = batching_challenge_v * batching_challenge_v;
    Fq v_cubed = v_squared * batching_challenge_v;
    Fq v_quarted = v_cubed * batching_challenge_v;
    return RelationInputs{
        .x_limbs = ProvingKey::split_fq_into_limbs(evaluation_input_x),
        .v_limbs = ProvingKey::split_fq_into_limbs(batching_challenge_v),
        .v_squared_limbs = ProvingKey::split_fq_into_limbs(v_squared),
        .v_cubed_limbs = ProvingKey::split_fq_into_limbs(v_cubed),
        .v_quarted_limbs = ProvingKey::split_fq_into_limbs(v_quarted),
    };
}

bool TranslatorCircuitChecker::check(const ProvingKey& proving_key)
{
    const auto& polys = proving_key.proving_key->polynomials;
    const size_t num_gates = Flavor::MINI_CIRCUIT_SIZE;
    const bool avm_mode = proving_key.avm_mode;

    auto report_fail = [&](const char* message, size_t row_idx) {
        info(message, row_idx);
        return false;
    };

    // Compute the limbs of evaluation_input_x and powers of batching_challenge_v (these go into the relation)
    RelationInputs relation_inputs =
        compute_relation_inputs_limbs(proving_key.batching_challenge_v, proving_key.evaluation_input_x);

    auto reconstructed_evaluation_input_x = Fr(uint256_t(proving_key.evaluation_input_x));
    auto reconstructed_batching_evaluation_v = Fr(uint256_t(proving_key.batching_challenge_v));
    auto reconstructed_batching_evaluation_v2 = Fr(uint256_t(proving_key.batching_challenge_v.pow(2)));
    auto reconstructed_batching_evaluation_v3 = Fr(uint256_t(proving_key.batching_challenge_v.pow(3)));
    auto reconstructed_batching_evaluation_v4 = Fr(uint256_t(proving_key.batching_challenge_v.pow(4)));

    auto check_binary_limbs_equality = [&](const std::vector<Fr>& first, const std::vector<Fr>& second, size_t gate) {
        for (const auto [first_limb, second_limb] : zip_view(first, second)) {
            if (first_limb != second_limb) {
                return report_fail("Binary limbs are not equal = ", gate);
            }
        }
        return true;
    };

    auto check_accumulator_transfer = [&](const std::vector<Fr>& previous_accumulator,
                                          size_t gate,
                                          const auto& in_random_range_fn) {
        if (gate % 2 != 1) {
            return report_fail("accumulator transfer should only be checked at odd gates = ", gate);
        }
        // Don't check transfer into random ops region - that data is garbage
        if (in_random_range_fn(gate + 1)) {
            return true;
        }
        if (gate + 1 < num_gates - 1) {
            // Check that the next gate's current accumulator equals this gate's previous accumulator
            const std::vector next_gate_current_accumulator = {
                polys.accumulators_binary_limbs_0[gate + 1],
                polys.accumulators_binary_limbs_1[gate + 1],
                polys.accumulators_binary_limbs_2[gate + 1],
                polys.accumulators_binary_limbs_3[gate + 1],
            };
            if (!check_binary_limbs_equality(next_gate_current_accumulator, previous_accumulator, gate + 1)) {
                return false;
            }
        } else {
            // Check accumulator starts at zero
            for (const auto& limb : previous_accumulator) {
                if (limb != Fr(0)) {
                    return report_fail("accumulator doesn't start with 0 = ", gate + 1);
                }
            }
        }
        return true;
    };

    auto check_no_op =
        [&](const std::vector<Fr>& current_accumulator,
            const std::vector<Fr>& previous_accumulator,
            size_t gate,
            const auto& in_random_range_fn) {
            if (!check_binary_limbs_equality(current_accumulator, previous_accumulator, gate)) {
                return false;
            }
            return check_accumulator_transfer(previous_accumulator, gate + 1, in_random_range_fn);
        };

    auto check_random_op_code = [&](const Fr op_code, size_t gate) {
        if (gate % 2 == 0) {
            if (op_code == Fr(0) || op_code == Fr(3) || op_code == Fr(4) || op_code == Fr(8)) {
                return report_fail("Opcode should be random value at even gate = ", gate);
            }
        } else {
            if (op_code == Fr(0)) {
                return report_fail("Opcode should be 0 at odd gate = ", gate);
            }
        }
        return true;
    };

    auto in_random_range = [&](size_t i) {
        return (i >= 2 * Flavor::NUM_NO_OPS_START && i < RESULT_ROW) ||
               (i >= num_gates - (avm_mode ? 0 : 2 * Flavor::NUM_RANDOM_OPS_END) && i < num_gates);
    };

    // Constants for shifts
    constexpr auto SHIFT_1 = ProvingKey::SHIFT_1;
    constexpr auto SHIFT_2 = ProvingKey::SHIFT_2;
    constexpr auto SHIFT_3 = ProvingKey::SHIFT_3;
    const auto& NEGATIVE_MODULUS_LIMBS = Flavor::NEGATIVE_MODULUS_LIMBS;

    for (size_t i = 2; i < num_gates - 1; i += 2) {

        // Ensure random op is present in expected ranges
        Fr op_code = polys.op[i];
        if (in_random_range(i)) {
            check_random_op_code(op_code, i);
            Fr op_code_next = polys.op[i + 1];
            check_random_op_code(op_code_next, i + 1);
            continue;
        }

        // Current accumulator (updated value)
        const std::vector current_accumulator_binary_limbs = {
            polys.accumulators_binary_limbs_0[i],
            polys.accumulators_binary_limbs_1[i],
            polys.accumulators_binary_limbs_2[i],
            polys.accumulators_binary_limbs_3[i],
        };

        // Previous accumulator
        const std::vector previous_accumulator_binary_limbs = {
            polys.accumulators_binary_limbs_0[i + 1],
            polys.accumulators_binary_limbs_1[i + 1],
            polys.accumulators_binary_limbs_2[i + 1],
            polys.accumulators_binary_limbs_3[i + 1],
        };

        if (op_code == 0) {
            if (!check_no_op(
                    current_accumulator_binary_limbs, previous_accumulator_binary_limbs, i, in_random_range)) {
                return false;
            }
            continue;
        }

        Fr p_x_lo = polys.x_lo_y_hi[i];
        Fr p_x_hi = polys.x_hi_z_1[i];
        Fr p_x_0 = polys.p_x_low_limbs[i];
        Fr p_x_1 = polys.p_x_low_limbs[i + 1];
        Fr p_x_2 = polys.p_x_high_limbs[i];
        Fr p_x_3 = polys.p_x_high_limbs[i + 1];
        const std::vector p_x_binary_limbs = { p_x_0, p_x_1, p_x_2, p_x_3 };

        // P.y
        Fr p_y_lo = polys.y_lo_z_2[i];
        Fr p_y_hi = polys.x_lo_y_hi[i + 1];
        Fr p_y_0 = polys.p_y_low_limbs[i];
        Fr p_y_1 = polys.p_y_low_limbs[i + 1];
        Fr p_y_2 = polys.p_y_high_limbs[i];
        Fr p_y_3 = polys.p_y_high_limbs[i + 1];
        const std::vector p_y_binary_limbs = { p_y_0, p_y_1, p_y_2, p_y_3 };

        // z1, z2
        Fr z_1 = polys.x_hi_z_1[i + 1];
        Fr z_2 = polys.y_lo_z_2[i + 1];

        Fr z_1_lo = polys.z_low_limbs[i];
        Fr z_2_lo = polys.z_low_limbs[i + 1];
        Fr z_1_hi = polys.z_high_limbs[i];
        Fr z_2_hi = polys.z_high_limbs[i + 1];

        const std::vector z_1_binary_limbs = { z_1_lo, z_1_hi };
        const std::vector z_2_binary_limbs = { z_2_lo, z_2_hi };

        // Relation limbs
        Fr low_wide_relation_limb = polys.relation_wide_limbs[i];
        Fr high_wide_relation_limb = polys.relation_wide_limbs[i + 1];

        // Quotient
        const std::vector quotient_binary_limbs = {
            polys.quotient_low_binary_limbs[i],
            polys.quotient_low_binary_limbs[i + 1],
            polys.quotient_high_binary_limbs[i],
            polys.quotient_high_binary_limbs[i + 1],
        };

        // Lambda for checking the correctness of decomposition of values in the Queue into limbs for
        // checking the relation
        auto check_wide_limb_into_binary_limb_relation = [](const std::vector<Fr>& wide_limbs,
                                                            const std::vector<Fr>& binary_limbs) {
            BB_ASSERT_EQ(wide_limbs.size() * 2, binary_limbs.size());
            for (size_t j = 0; j < wide_limbs.size(); j++) {
                if ((binary_limbs[j * 2] + Fr(ProvingKey::SHIFT_1) * binary_limbs[j * 2 + 1]) != wide_limbs[j]) {
                    return false;
                }
            }
            return true;
        };

        // Check that everything has been decomposed correctly
        if (!(check_wide_limb_into_binary_limb_relation({ p_x_lo, p_x_hi }, p_x_binary_limbs) &&
              check_wide_limb_into_binary_limb_relation({ p_y_lo, p_y_hi }, p_y_binary_limbs) &&
              check_wide_limb_into_binary_limb_relation({ z_1 }, z_1_binary_limbs) &&
              check_wide_limb_into_binary_limb_relation({ z_2 }, z_2_binary_limbs))) {

            return report_fail("wide limb decomposition failed at row = ", i);
        }

        // Check low wide relation limb
        Fr low_wide_relation_limb_check =
            previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[0] + op_code +
            relation_inputs.v_limbs[0] * p_x_0 + relation_inputs.v_squared_limbs[0] * p_y_0 +
            relation_inputs.v_cubed_limbs[0] * z_1_lo + relation_inputs.v_quarted_limbs[0] * z_2_lo +
            quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[0] - current_accumulator_binary_limbs[0] +
            (previous_accumulator_binary_limbs[1] * relation_inputs.x_limbs[0] +
             previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[1] + relation_inputs.v_limbs[1] * p_x_0 +
             relation_inputs.v_limbs[0] * p_x_1 + relation_inputs.v_squared_limbs[1] * p_y_0 +
             relation_inputs.v_squared_limbs[0] * p_y_1 + relation_inputs.v_cubed_limbs[1] * z_1_lo +
             relation_inputs.v_cubed_limbs[0] * z_1_hi + relation_inputs.v_quarted_limbs[1] * z_2_lo +
             relation_inputs.v_quarted_limbs[0] * z_2_hi + quotient_binary_limbs[1] * NEGATIVE_MODULUS_LIMBS[0] +
             quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[1] - current_accumulator_binary_limbs[1]) *
                SHIFT_1;
        Fr expected_low_wide = low_wide_relation_limb * SHIFT_2;
        if (low_wide_relation_limb_check != expected_low_wide) {
            return report_fail("Low wide limb relation check failed at row = ", i);
        }

        // Check high wide relation limb (includes carry from low limb)
        Fr high_wide_relation_limb_check =
            low_wide_relation_limb + // carry from low limb (already divided by SHIFT_2)
            previous_accumulator_binary_limbs[2] * relation_inputs.x_limbs[0] +
            previous_accumulator_binary_limbs[1] * relation_inputs.x_limbs[1] +
            previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[2] + relation_inputs.v_limbs[2] * p_x_0 +
            relation_inputs.v_limbs[1] * p_x_1 + relation_inputs.v_limbs[0] * p_x_2 +
            relation_inputs.v_squared_limbs[2] * p_y_0 + relation_inputs.v_squared_limbs[1] * p_y_1 +
            relation_inputs.v_squared_limbs[0] * p_y_2 + relation_inputs.v_cubed_limbs[2] * z_1_lo +
            relation_inputs.v_cubed_limbs[1] * z_1_hi + relation_inputs.v_quarted_limbs[2] * z_2_lo +
            relation_inputs.v_quarted_limbs[1] * z_2_hi + quotient_binary_limbs[2] * NEGATIVE_MODULUS_LIMBS[0] +
            quotient_binary_limbs[1] * NEGATIVE_MODULUS_LIMBS[1] +
            quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[2] - current_accumulator_binary_limbs[2] +
            (previous_accumulator_binary_limbs[3] * relation_inputs.x_limbs[0] +
             previous_accumulator_binary_limbs[2] * relation_inputs.x_limbs[1] +
             previous_accumulator_binary_limbs[1] * relation_inputs.x_limbs[2] +
             previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[3] + relation_inputs.v_limbs[3] * p_x_0 +
             relation_inputs.v_limbs[2] * p_x_1 + relation_inputs.v_limbs[1] * p_x_2 +
             relation_inputs.v_limbs[0] * p_x_3 + relation_inputs.v_squared_limbs[3] * p_y_0 +
             relation_inputs.v_squared_limbs[2] * p_y_1 + relation_inputs.v_squared_limbs[1] * p_y_2 +
             relation_inputs.v_squared_limbs[0] * p_y_3 + relation_inputs.v_cubed_limbs[3] * z_1_lo +
             relation_inputs.v_cubed_limbs[2] * z_1_hi + relation_inputs.v_quarted_limbs[3] * z_2_lo +
             relation_inputs.v_quarted_limbs[2] * z_2_hi + quotient_binary_limbs[3] * NEGATIVE_MODULUS_LIMBS[0] +
             quotient_binary_limbs[2] * NEGATIVE_MODULUS_LIMBS[1] +
             quotient_binary_limbs[1] * NEGATIVE_MODULUS_LIMBS[2] +
             quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[3] - current_accumulator_binary_limbs[3]) *
                SHIFT_1;
        Fr expected_high_wide = high_wide_relation_limb * SHIFT_2;
        if (high_wide_relation_limb_check != expected_high_wide) {
            return report_fail("High wide limb relation check failed at row = ", i);
        }

        // Apart from checking the correctness of the evaluation modulo 2²⁷² we also need to ensure that the
        // logic works in our scalar field. For this we reconstruct the scalar field values from individual limbs
        auto reconstructed_p_x = (p_x_0 + p_x_1 * SHIFT_1 + p_x_2 * SHIFT_2 + p_x_3 * SHIFT_3);
        auto reconstructed_p_y = (p_y_0 + p_y_1 * SHIFT_1 + p_y_2 * SHIFT_2 + p_y_3 * SHIFT_3);
        auto reconstructed_current_accumulator =
            (current_accumulator_binary_limbs[0] + current_accumulator_binary_limbs[1] * SHIFT_1 +
             current_accumulator_binary_limbs[2] * SHIFT_2 + current_accumulator_binary_limbs[3] * SHIFT_3);
        auto reconstructed_previous_accumulator =
            (previous_accumulator_binary_limbs[0] + previous_accumulator_binary_limbs[1] * SHIFT_1 +
             previous_accumulator_binary_limbs[2] * SHIFT_2 + previous_accumulator_binary_limbs[3] * SHIFT_3);

        auto reconstructed_z1 = (z_1_lo + z_1_hi * SHIFT_1);
        auto reconstructed_z2 = (z_2_lo + z_2_hi * SHIFT_1);
        auto reconstructed_quotient = (quotient_binary_limbs[0] + quotient_binary_limbs[1] * SHIFT_1 +
                                       quotient_binary_limbs[2] * SHIFT_2 + quotient_binary_limbs[3] * SHIFT_3);

        // Check the relation
        Fr scalar_field_relation = reconstructed_previous_accumulator * reconstructed_evaluation_input_x + op_code +
                                   reconstructed_p_x * reconstructed_batching_evaluation_v +
                                   reconstructed_p_y * reconstructed_batching_evaluation_v2 +
                                   reconstructed_z1 * reconstructed_batching_evaluation_v3 +
                                   reconstructed_z2 * reconstructed_batching_evaluation_v4 +
                                   reconstructed_quotient * NEGATIVE_MODULUS_LIMBS[4] -
                                   reconstructed_current_accumulator;
        if (!scalar_field_relation.is_zero()) {
            return report_fail("Scalar field relation check failed at row = ", i);
        };

        if (!check_accumulator_transfer(previous_accumulator_binary_limbs, i + 1, in_random_range)) {
            return false;
        }
    }
    return true;
}
} // namespace bb

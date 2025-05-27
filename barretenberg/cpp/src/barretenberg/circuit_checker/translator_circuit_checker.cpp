#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"

namespace bb {
TranslatorCircuitChecker::RelationInputs TranslatorCircuitChecker::compute_relation_inputs_limbs(
    const Fq& batching_challenge_v, const Fq& evaluation_input_x)
{
    Fq v_squared = batching_challenge_v * batching_challenge_v;
    Fq v_cubed = v_squared * batching_challenge_v;
    Fq v_quarted = v_cubed * batching_challenge_v;
    return RelationInputs{
        .x_limbs = Builder::split_fq_into_limbs(evaluation_input_x),
        .v_limbs = Builder::split_fq_into_limbs(batching_challenge_v),
        .v_squared_limbs = Builder::split_fq_into_limbs(v_squared),
        .v_cubed_limbs = Builder::split_fq_into_limbs(v_cubed),
        .v_quarted_limbs = Builder::split_fq_into_limbs(v_quarted),
    };
}

bool TranslatorCircuitChecker::check(const Builder& circuit)
{

    auto wires = circuit.wires;

    auto report_fail = [&](const char* message, size_t row_idx) {
        info(message, row_idx);
        return false;
    };

    // Compute the limbs of evaluation_input_x and powers of batching_challenge_v (these go into the relation)
    RelationInputs relation_inputs =
        compute_relation_inputs_limbs(circuit.batching_challenge_v, circuit.evaluation_input_x);
    // Get the main wires (we will operate with range constraint wires mainly through indices, since this is
    // easier)
    auto& op_wire = std::get<WireIds::OP>(circuit.wires);
    auto& x_lo_y_hi_wire = std::get<WireIds::X_LOW_Y_HI>(circuit.wires);
    auto& x_hi_z_1_wire = std::get<WireIds::X_HIGH_Z_1>(circuit.wires);
    auto& y_lo_z_2_wire = std::get<WireIds::Y_LOW_Z_2>(circuit.wires);
    auto& p_x_0_p_x_1_wire = std::get<WireIds::P_X_LOW_LIMBS>(circuit.wires);
    auto& p_x_2_p_x_3_wire = std::get<WireIds::P_X_HIGH_LIMBS>(circuit.wires);
    auto& p_y_0_p_y_1_wire = std::get<WireIds::P_Y_LOW_LIMBS>(circuit.wires);
    auto& p_y_2_p_y_3_wire = std::get<WireIds::P_Y_HIGH_LIMBS>(circuit.wires);
    auto& z_lo_wire = std::get<WireIds::Z_LOW_LIMBS>(circuit.wires);
    auto& z_hi_wire = std::get<WireIds::Z_HIGH_LIMBS>(circuit.wires);
    auto& accumulators_binary_limbs_0_wire = std::get<WireIds::ACCUMULATORS_BINARY_LIMBS_0>(circuit.wires);
    auto& accumulators_binary_limbs_1_wire = std::get<WireIds::ACCUMULATORS_BINARY_LIMBS_1>(circuit.wires);
    auto& accumulators_binary_limbs_2_wire = std::get<WireIds::ACCUMULATORS_BINARY_LIMBS_2>(circuit.wires);
    auto& accumulators_binary_limbs_3_wire = std::get<WireIds::ACCUMULATORS_BINARY_LIMBS_3>(circuit.wires);
    auto& quotient_low_binary_limbs = std::get<WireIds::QUOTIENT_LOW_BINARY_LIMBS>(circuit.wires);
    auto& quotient_high_binary_limbs = std::get<WireIds::QUOTIENT_HIGH_BINARY_LIMBS>(circuit.wires);
    auto& relation_wide_limbs_wire = std::get<WireIds::RELATION_WIDE_LIMBS>(circuit.wires);
    auto reconstructed_evaluation_input_x = Fr(uint256_t(circuit.evaluation_input_x));
    auto reconstructed_batching_evaluation_v = Fr(uint256_t(circuit.batching_challenge_v));
    auto reconstructed_batching_evaluation_v2 = Fr(uint256_t(circuit.batching_challenge_v.pow(2)));
    auto reconstructed_batching_evaluation_v3 = Fr(uint256_t(circuit.batching_challenge_v.pow(3)));
    auto reconstructed_batching_evaluation_v4 = Fr(uint256_t(circuit.batching_challenge_v.pow(4)));
    /**
     * @brief Get elements at the same index from several sequential circuit.wires and put them into a vector
     *
     */
    auto get_sequential_micro_chunks = [&](size_t gate_index, WireIds starting_wire_index, size_t chunk_count) {
        std::vector<Fr> chunks;
        for (size_t i = starting_wire_index; i < starting_wire_index + chunk_count; i++) {
            chunks.push_back(circuit.get_variable(circuit.wires[i][gate_index]));
        }
        return chunks;
    };

    /**
     * @brief Reconstruct the value of one regular limb used in relation computation from micro chunks used to
     * create range constraints
     *
     * @details We might want to skip several items at the end, since those will be shifted or used
     * for another decomposition
     *
     */
    auto accumulate_limb_from_micro_chunks = [](const std::vector<Fr>& chunks, const int skipped_at_end = 1) {
        Fr mini_accumulator(0);
        auto end = chunks.end();
        std::advance(end, -skipped_at_end);
        for (auto it = end; it != chunks.begin();) {
            --it;
            mini_accumulator = mini_accumulator * TranslatorCircuitBuilder::MICRO_SHIFT + *it;
        }
        return mini_accumulator;
    };

    // TODO(https: // github.com/AztecProtocol/barretenberg/issues/1367): Report all failures more explicitly and
    // consider making use of relations.

    for (size_t i = 2; i < circuit.num_gates - 1; i += 2) {
        {
            // Get the values of P.x
            Fr op_code = circuit.get_variable(op_wire[i]);
            Fr p_x_lo = circuit.get_variable(x_lo_y_hi_wire[i]);
            Fr p_x_hi = circuit.get_variable(x_hi_z_1_wire[i]);
            Fr p_x_0 = circuit.get_variable(p_x_0_p_x_1_wire[i]);
            Fr p_x_1 = circuit.get_variable(p_x_0_p_x_1_wire[i + 1]);
            Fr p_x_2 = circuit.get_variable(p_x_2_p_x_3_wire[i]);
            Fr p_x_3 = circuit.get_variable(p_x_2_p_x_3_wire[i + 1]);
            const std::vector p_x_binary_limbs = { p_x_0, p_x_1, p_x_2, p_x_3 };

            // P.y
            Fr p_y_lo = circuit.get_variable(y_lo_z_2_wire[i]);
            Fr p_y_hi = circuit.get_variable(x_lo_y_hi_wire[i + 1]);
            Fr p_y_0 = circuit.get_variable(p_y_0_p_y_1_wire[i]);
            Fr p_y_1 = circuit.get_variable(p_y_0_p_y_1_wire[i + 1]);
            Fr p_y_2 = circuit.get_variable(p_y_2_p_y_3_wire[i]);
            Fr p_y_3 = circuit.get_variable(p_y_2_p_y_3_wire[i + 1]);
            const std::vector p_y_binary_limbs = { p_y_0, p_y_1, p_y_2, p_y_3 };
            // z1, z2
            Fr z_1 = circuit.get_variable(x_hi_z_1_wire[i + 1]);
            Fr z_2 = circuit.get_variable(y_lo_z_2_wire[i + 1]);

            Fr z_1_lo = circuit.get_variable(z_lo_wire[i]);
            Fr z_2_lo = circuit.get_variable(z_lo_wire[i + 1]);
            Fr z_1_hi = circuit.get_variable(z_hi_wire[i]);
            Fr z_2_hi = circuit.get_variable(z_hi_wire[i + 1]);

            const std::vector z_1_binary_limbs = { z_1_lo, z_1_hi };
            const std::vector z_2_binary_limbs = { z_2_lo, z_2_hi };
            // Relation limbs
            Fr low_wide_relation_limb = circuit.get_variable(relation_wide_limbs_wire[i]);
            Fr high_wide_relation_limb = circuit.get_variable(relation_wide_limbs_wire[i + 1]);

            // Current accumulator (updated value)
            const std::vector current_accumulator_binary_limbs = {
                circuit.get_variable(accumulators_binary_limbs_0_wire[i]),
                circuit.get_variable(accumulators_binary_limbs_1_wire[i]),
                circuit.get_variable(accumulators_binary_limbs_2_wire[i]),
                circuit.get_variable(accumulators_binary_limbs_3_wire[i]),
            };

            // Previous accumulator
            const std::vector previous_accumulator_binary_limbs = {
                circuit.get_variable(accumulators_binary_limbs_0_wire[i + 1]),
                circuit.get_variable(accumulators_binary_limbs_1_wire[i + 1]),
                circuit.get_variable(accumulators_binary_limbs_2_wire[i + 1]),
                circuit.get_variable(accumulators_binary_limbs_3_wire[i + 1]),
            };

            // Quotient
            const std::vector quotient_binary_limbs = {
                circuit.get_variable(quotient_low_binary_limbs[i]),
                circuit.get_variable(quotient_low_binary_limbs[i + 1]),
                circuit.get_variable(quotient_high_binary_limbs[i]),
                circuit.get_variable(quotient_high_binary_limbs[i + 1]),
            };

            const size_t NUM_MICRO_LIMBS = Builder::NUM_MICRO_LIMBS;

            // Get micro chunks for checking decomposition and range
            auto p_x_micro_chunks = {
                get_sequential_micro_chunks(i, WireIds::P_X_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::P_X_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i, WireIds::P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS)
            };
            auto p_y_micro_chunks = {
                get_sequential_micro_chunks(i, WireIds::P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i, WireIds::P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS)
            };
            auto z_1_micro_chunks = {
                get_sequential_micro_chunks(i, WireIds::Z_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i, WireIds::Z_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
            };

            auto z_2_micro_chunks = {

                get_sequential_micro_chunks(i + 1, WireIds::Z_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::Z_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS)
            };

            auto current_accumulator_micro_chunks = {
                get_sequential_micro_chunks(i, WireIds::ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i, WireIds::ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0, NUM_MICRO_LIMBS),
            };
            auto quotient_micro_chunks = {
                get_sequential_micro_chunks(i, WireIds::QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i, WireIds::QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0, NUM_MICRO_LIMBS),
                get_sequential_micro_chunks(i + 1, WireIds::QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0, NUM_MICRO_LIMBS),
            };

            // Lambda for checking the correctness of decomposition of values in the Queue into limbs for
            // checking the relation
            auto check_wide_limb_into_binary_limb_relation = [](const std::vector<Fr>& wide_limbs,
                                                                const std::vector<Fr>& binary_limbs) {
                BB_ASSERT_EQ(wide_limbs.size() * 2, binary_limbs.size());
                for (size_t i = 0; i < wide_limbs.size(); i++) {
                    if ((binary_limbs[i * 2] + Fr(Builder::SHIFT_1) * binary_limbs[i * 2 + 1]) != wide_limbs[i]) {
                        return false;
                    }
                }
                return true;
            };
            // Check that everything has been decomposed correctly
            // P.xₗₒ = P.xₗₒ_0 + SHIFT_1 * P.xₗₒ_1
            // P.xₕᵢ  = P.xₕᵢ_0 + SHIFT_1 * P.xₕᵢ_1
            // z_1 = z_1ₗₒ + SHIFT_1 * z_1ₕᵢ
            // z_2 = z_2ₗₒ + SHIFT_2 * z_1ₕᵢ
            if (!(check_wide_limb_into_binary_limb_relation({ p_x_lo, p_x_hi }, p_x_binary_limbs) &&
                  check_wide_limb_into_binary_limb_relation({ p_y_lo, p_y_hi }, p_y_binary_limbs) &&
                  check_wide_limb_into_binary_limb_relation({ z_1 }, z_1_binary_limbs) &&
                  check_wide_limb_into_binary_limb_relation({ z_2 }, z_2_binary_limbs))) {

                return report_fail("wide limb decomposition failied at row = ", i);
            }

            enum LimbSeriesType { STANDARD_COORDINATE, Z_SCALAR, QUOTIENT };

            // Check that limbs have been decomposed into microlimbs correctly
            // value = ∑ (2ˡ)ⁱ⋅ chunkᵢ, where 2ˡ is the shift
            auto check_micro_limb_decomposition_correctness = [&accumulate_limb_from_micro_chunks](
                                                                  const std::vector<Fr>& binary_limbs,
                                                                  const std::vector<std::vector<Fr>>& micro_limbs,
                                                                  const LimbSeriesType limb_series_type) {
                // Shifts for decompositions
                constexpr auto SHIFT_12_TO_14 = Fr(4);
                constexpr auto SHIFT_10_TO_14 = Fr(16);
                constexpr auto SHIFT_8_TO_14 = Fr(64);
                constexpr auto SHIFT_4_TO_14 = Fr(1024);

                BB_ASSERT_EQ(binary_limbs.size(), micro_limbs.size());
                // First check that all the microlimbs are properly range constrained
                for (auto& micro_limb_series : micro_limbs) {
                    for (auto& micro_limb : micro_limb_series) {
                        if (uint256_t(micro_limb) > Builder::MAX_MICRO_LIMB_SIZE) {
                            return false;
                        }
                    }
                }
                // For low limbs the last microlimb is used with the shift, so we skip it when reconstructing
                // the limb
                const size_t SKIPPED_FOR_LOW_LIMBS = 1;
                for (size_t i = 0; i < binary_limbs.size() - 1; i++) {
                    if (binary_limbs[i] != accumulate_limb_from_micro_chunks(micro_limbs[i], SKIPPED_FOR_LOW_LIMBS)) {
                        return false;
                    }
                    // Check last additional constraint (68->70)
                    if (micro_limbs[i][NUM_MICRO_LIMBS - 1] != (SHIFT_12_TO_14 * micro_limbs[i][NUM_MICRO_LIMBS - 2])) {
                        return false;
                    }
                }

                const size_t SKIPPED_FOR_STANDARD = 2;
                const size_t SKIPPED_FOR_Z_SCALARS = 1;
                const size_t SKIPPED_FOR_QUOTIENT = 2;
                switch (limb_series_type) {
                case STANDARD_COORDINATE:
                    // For standard Fq value the highest limb is 50 bits, so we skip the top 2 microlimbs
                    if (binary_limbs[binary_limbs.size() - 1] !=
                        accumulate_limb_from_micro_chunks(micro_limbs[binary_limbs.size() - 1], SKIPPED_FOR_STANDARD)) {
                        return false;
                    }
                    // Check last additional constraint (50->56)
                    if (micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_STANDARD] !=
                        (SHIFT_8_TO_14 *
                         micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_STANDARD - 1])) {

                        return false;
                    }
                    break;
                // For z top limbs we need as many microlimbs as for the low limbs
                case Z_SCALAR:
                    if (binary_limbs[binary_limbs.size() - 1] !=
                        accumulate_limb_from_micro_chunks(micro_limbs[binary_limbs.size() - 1],
                                                          SKIPPED_FOR_Z_SCALARS)) {
                        return false;
                    }
                    // Check last additional constraint (60->70)
                    if (micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_Z_SCALARS] !=
                        (SHIFT_4_TO_14 *
                         micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_Z_SCALARS - 1])) {
                        return false;
                    }
                    break;
                // Quotient also doesn't need the top 2
                case QUOTIENT:
                    if (binary_limbs[binary_limbs.size() - 1] !=
                        accumulate_limb_from_micro_chunks(micro_limbs[binary_limbs.size() - 1], SKIPPED_FOR_QUOTIENT)) {
                        return false;
                    }
                    // Check last additional constraint (52->56)
                    if (micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_QUOTIENT] !=
                        (SHIFT_10_TO_14 *
                         micro_limbs[binary_limbs.size() - 1][NUM_MICRO_LIMBS - SKIPPED_FOR_QUOTIENT - 1])) {
                        return false;
                    }
                    break;
                default:
                    abort();
                }

                return true;
            };
            // Check all micro limb decompositions
            if (!check_micro_limb_decomposition_correctness(p_x_binary_limbs, p_x_micro_chunks, STANDARD_COORDINATE)) {
                return false;
            }
            if (!check_micro_limb_decomposition_correctness(p_y_binary_limbs, p_y_micro_chunks, STANDARD_COORDINATE)) {
                return false;
            }
            if (!check_micro_limb_decomposition_correctness(z_1_binary_limbs, z_1_micro_chunks, Z_SCALAR)) {
                return false;
            }
            if (!check_micro_limb_decomposition_correctness(z_2_binary_limbs, z_2_micro_chunks, Z_SCALAR)) {
                return false;
            }
            if (!check_micro_limb_decomposition_correctness(
                    current_accumulator_binary_limbs, current_accumulator_micro_chunks, STANDARD_COORDINATE)) {
                return false;
            }
            if (!check_micro_limb_decomposition_correctness(quotient_binary_limbs, quotient_micro_chunks, QUOTIENT)) {
                return false;
            }

            // The logic we are trying to enforce is:
            // current_accumulator = previous_accumulator ⋅ x + op_code + P.x ⋅ v + P.y ⋅ v² + z_1 ⋅ v³ + z_2 ⋅
            // v⁴ mod Fq To ensure this we transform the relation into the form: previous_accumulator ⋅ x + op +
            // P.x ⋅ v + P.y ⋅ v² + z_1 ⋅ v³ + z_2 ⋅ v⁴ - quotient ⋅ p - current_accumulator = 0 However, we
            // don't have integers. Despite that, we can approximate integers for a certain range, if we know
            // that there will not be any overflows. For now we set the range to 2²⁷² ⋅ r. We can evaluate the
            // logic modulo 2²⁷² with range constraints and r is native.
            //
            // previous_accumulator ⋅ x + op + P.x ⋅ v + P.y ⋅ v² + z_1 ⋅ v³ + z_2 ⋅ v⁴ - quotient ⋅ p -
            // current_accumulator = 0 =>
            // 1. previous_accumulator ⋅ x + op + P.x ⋅ v + P.y ⋅ v² + z_1 ⋅ v³ + z_2 ⋅ v⁴ + quotient ⋅ (-p mod
            // 2²⁷²) - current_accumulator = 0 mod 2²⁷²
            // 2. previous_accumulator ⋅ x + op + P.x ⋅ v + P.y ⋅ v² + z_1 ⋅ v³ + z_2 ⋅ v⁴ - quotient ⋅ p -
            // current_accumulator = 0 mod r
            //
            // The second relation is straightforward and easy to check. The first, not so much. We have to
            // evaluate certain bit chunks of the equation and ensure that they are zero. For example, for the
            // lowest limb it would be (inclusive ranges):
            //
            // previous_accumulator[0:67] ⋅ x[0:67] + op + P.x[0:67] ⋅ v[0:67] + P.y[0:67] ⋅ v²[0:67] +
            // z_1[0:67] ⋅ v³[0:67] + z_2[0:67] ⋅ v⁴[0:67] + quotient[0:67] ⋅ (-p mod 2²⁷²)[0:67] -
            // current_accumulator[0:67] = intermediate_value; (we don't take parts of op, because it's supposed
            // to be between 0 and 3)
            //
            // We could check that this intermediate_value is equal to  0 mod 2⁶⁸ by dividing it by 2⁶⁸ and
            // constraining it. For efficiency, we actually compute wider evaluations for 136 bits, which
            // require us to also obtain and shift products of [68:135] by [0:67] and [0:67] by [68:135] bits.
            // The result of division goes into the next evaluation (the same as a carry flag would)
            // So the lowest wide limb is : (∑everything[0:67]⋅everything[0:67] +
            // 2⁶⁸⋅(∑everything[0:67]⋅everything[68:135]))/ 2¹³⁶
            //
            // The high is:
            // (low_limb + ∑everything[0:67]⋅everything[136:203] + ∑everything[68:135]⋅everything[68:135] +
            // 2⁶⁸(∑everything[0:67]⋅everything[204:271] + ∑everything[68:135]⋅everything[136:203])) / 2¹³⁶
            //
            // We also limit computation on limbs of op, z_1 and z_2, since we know that op has only the lowest
            // limb and z_1 and z_2 have only the two lowest limbs
            constexpr std::array<Fr, 5> NEGATIVE_MODULUS_LIMBS = Builder::NEGATIVE_MODULUS_LIMBS;
            const uint256_t SHIFT_1 = Builder::SHIFT_1;
            const uint256_t SHIFT_2 = Builder::SHIFT_2;
            const uint256_t SHIFT_3 = Builder::SHIFT_3;
            Fr low_wide_limb_relation_check =

                (previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[0] + op_code +
                 relation_inputs.v_limbs[0] * p_x_0 + relation_inputs.v_squared_limbs[0] * p_y_0 +
                 relation_inputs.v_cubed_limbs[0] * z_1_lo + relation_inputs.v_quarted_limbs[0] * z_2_lo +
                 quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[0] - current_accumulator_binary_limbs[0]) +
                (previous_accumulator_binary_limbs[1] * relation_inputs.x_limbs[0] +
                 relation_inputs.v_limbs[1] * p_x_0 + relation_inputs.v_squared_limbs[1] * p_y_0 +
                 relation_inputs.v_cubed_limbs[1] * z_1_lo + relation_inputs.v_quarted_limbs[1] * z_2_lo +
                 quotient_binary_limbs[1] * NEGATIVE_MODULUS_LIMBS[0] +
                 previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[1] +
                 relation_inputs.v_limbs[0] * p_x_1 + relation_inputs.v_squared_limbs[0] * p_y_1 +
                 relation_inputs.v_cubed_limbs[0] * z_1_hi + relation_inputs.v_quarted_limbs[0] * z_2_hi +
                 quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[1] - current_accumulator_binary_limbs[1]) *
                    Fr(SHIFT_1);
            if (low_wide_limb_relation_check != (low_wide_relation_limb * SHIFT_2)) {
                return false;
            }
            Fr high_wide_relation_limb_check =
                low_wide_relation_limb + previous_accumulator_binary_limbs[2] * relation_inputs.x_limbs[0] +
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
                 previous_accumulator_binary_limbs[0] * relation_inputs.x_limbs[3] +
                 relation_inputs.v_limbs[3] * p_x_0 + relation_inputs.v_limbs[2] * p_x_1 +
                 relation_inputs.v_limbs[1] * p_x_2 + relation_inputs.v_limbs[0] * p_x_3 +
                 relation_inputs.v_squared_limbs[3] * p_y_0 + relation_inputs.v_squared_limbs[2] * p_y_1 +
                 relation_inputs.v_squared_limbs[1] * p_y_2 + relation_inputs.v_squared_limbs[0] * p_y_3 +
                 relation_inputs.v_cubed_limbs[3] * z_1_lo + relation_inputs.v_cubed_limbs[2] * z_1_hi +
                 relation_inputs.v_quarted_limbs[3] * z_2_lo + relation_inputs.v_quarted_limbs[2] * z_2_hi +
                 quotient_binary_limbs[3] * NEGATIVE_MODULUS_LIMBS[0] +
                 quotient_binary_limbs[2] * NEGATIVE_MODULUS_LIMBS[1] +
                 quotient_binary_limbs[1] * NEGATIVE_MODULUS_LIMBS[2] +
                 quotient_binary_limbs[0] * NEGATIVE_MODULUS_LIMBS[3] - current_accumulator_binary_limbs[3]) *
                    SHIFT_1;
            if (high_wide_relation_limb_check != (high_wide_relation_limb * SHIFT_2)) {
                return false;
            }
            // Apart from checking the correctness of the evaluation modulo 2²⁷² we also need to ensure that the
            // logic works in our scalar field. For this we reconstruct the scalar field values from individual
            // limbs
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
            if (!(reconstructed_previous_accumulator * reconstructed_evaluation_input_x + op_code +
                  reconstructed_p_x * reconstructed_batching_evaluation_v +
                  reconstructed_p_y * reconstructed_batching_evaluation_v2 +
                  reconstructed_z1 * reconstructed_batching_evaluation_v3 +
                  reconstructed_z2 * reconstructed_batching_evaluation_v4 +
                  reconstructed_quotient * NEGATIVE_MODULUS_LIMBS[4] - reconstructed_current_accumulator)
                     .is_zero()) {
                return false;
            };
        }
        {
            size_t odd_gate_index = i + 1;
            // Check the accumulator is copied correctly
            const std::vector current_accumulator_binary_limbs_copy = {
                circuit.get_variable(accumulators_binary_limbs_0_wire[odd_gate_index]),
                circuit.get_variable(accumulators_binary_limbs_1_wire[odd_gate_index]),
                circuit.get_variable(accumulators_binary_limbs_2_wire[odd_gate_index]),
                circuit.get_variable(accumulators_binary_limbs_3_wire[odd_gate_index]),
            };
            if (odd_gate_index < circuit.num_gates - 1) {
                size_t next_even_gate_index = i + 2;
                const std::vector current_accumulator_binary_limbs = {
                    circuit.get_variable(accumulators_binary_limbs_0_wire[next_even_gate_index]),
                    circuit.get_variable(accumulators_binary_limbs_1_wire[next_even_gate_index]),
                    circuit.get_variable(accumulators_binary_limbs_2_wire[next_even_gate_index]),
                    circuit.get_variable(accumulators_binary_limbs_3_wire[next_even_gate_index]),
                };

                for (size_t j = 0; j < current_accumulator_binary_limbs.size(); j++) {
                    if (current_accumulator_binary_limbs_copy[j] != current_accumulator_binary_limbs[j]) {
                        return report_fail("accumulator copy failed at row = ", odd_gate_index);
                    }
                }
            } else {
                // Check accumulator starts at zero
                for (const auto& limb : current_accumulator_binary_limbs_copy) {
                    if (limb != Fr(0)) {
                        return report_fail("accumulator doesn't start with 0 = ", odd_gate_index);
                    }
                }
            }
        }
    }
    return true;
};
}; // namespace bb

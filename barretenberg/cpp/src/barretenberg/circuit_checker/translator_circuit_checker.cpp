// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"

namespace bb {

TranslatorCircuitChecker::Params TranslatorCircuitChecker::compute_relation_params(const Builder& circuit)
{
    Params params;

    const Fq v = circuit.batching_challenge_v;
    const Fq v2 = v * v;
    const Fq v3 = v2 * v;
    const Fq v4 = v3 * v;

    const auto x_limbs = Builder::split_fq_into_limbs(circuit.evaluation_input_x);
    const auto v_limbs = Builder::split_fq_into_limbs(v);
    const auto v2_limbs = Builder::split_fq_into_limbs(v2);
    const auto v3_limbs = Builder::split_fq_into_limbs(v3);
    const auto v4_limbs = Builder::split_fq_into_limbs(v4);

    // evaluation_input_x: 4 binary limbs + 1 native Fr representation
    params.evaluation_input_x = {
        x_limbs[0], x_limbs[1], x_limbs[2], x_limbs[3], Fr(uint256_t(circuit.evaluation_input_x))
    };

    // batching_challenge_v^1 through v^4: each has 4 binary limbs + 1 native Fr
    params.batching_challenge_v[0] = { v_limbs[0], v_limbs[1], v_limbs[2], v_limbs[3], Fr(uint256_t(v)) };
    params.batching_challenge_v[1] = { v2_limbs[0], v2_limbs[1], v2_limbs[2], v2_limbs[3], Fr(uint256_t(v2)) };
    params.batching_challenge_v[2] = { v3_limbs[0], v3_limbs[1], v3_limbs[2], v3_limbs[3], Fr(uint256_t(v3)) };
    params.batching_challenge_v[3] = { v4_limbs[0], v4_limbs[1], v4_limbs[2], v4_limbs[3], Fr(uint256_t(v4)) };

    // accumulated_result: the 4 binary limbs stored at RESULT_ROW.
    // The AccumulatorTransferRelation verifies this matches the accumulator at the result row.
    BB_ASSERT_GT(circuit.num_gates(), RESULT_ROW);
    params.accumulated_result = {
        circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_0][RESULT_ROW]),
        circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_1][RESULT_ROW]),
        circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_2][RESULT_ROW]),
        circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_3][RESULT_ROW]),
    };

    return params;
}

void TranslatorCircuitChecker::populate_values(const Builder& circuit, AllValues& values, size_t row_idx)
{
    const size_t num_gates = circuit.num_gates();
    BB_ASSERT_LT(row_idx, num_gates);

    // -----------------------------------------------------------------------
    // Wire values at current row
    // get_wires() returns 81 refs in WireIds order: [op, x_lo_y_hi, ..., range_constraints]
    // This matches circuit.wires[0..80] exactly.
    // -----------------------------------------------------------------------
    auto wire_refs = values.get_wires();
    for (size_t j = 0; j < Builder::WireIds::TOTAL_COUNT; j++) {
        wire_refs[j] = circuit.get_variable(circuit.wires[j][row_idx]);
    }

    // -----------------------------------------------------------------------
    // Shifted wire values (= values at next row, or zero at boundary).
    // ShiftedEntities::get_all() returns 86 refs:
    //   [0..79]  : shifts of circuit.wires[1..80]  (x_lo_y_hi through last range constraint)
    //   [80..85] : shifts of ordered range constraints (0..4) and z_perm (not from circuit wires)
    // -----------------------------------------------------------------------
    auto& shifted_base = static_cast<Flavor::ShiftedEntities<Fr>&>(values);
    auto shifted_refs = shifted_base.get_all();
    if (row_idx + 1 < num_gates) {
        // circuit.wires[j+1] holds the wire that shifts to shifted_refs[j]
        for (size_t j = 0; j < 80; j++) {
            shifted_refs[j] = circuit.get_variable(circuit.wires[j + 1][row_idx + 1]);
        }
    }
    // shifted_refs[80..85] (ordered range constraints + z_perm) remain zero;
    // the relations that use them (Permutation, DeltaRange) are not checked here.

    // -----------------------------------------------------------------------
    // Lagrange selector values — computed analytically from the row index.
    //
    // Translator processes the trace in two regions per mini-circuit:
    //   [0, RANDOMNESS_START)          : initialisation rows (rows 0..1)
    //   [RANDOMNESS_START, RESULT_ROW) : random no-op rows (lagrange_mini_masking)
    //   [RESULT_ROW, num_without_mask) : actual accumulation rows (even/odd processing)
    //   [num_without_mask, num_gates)  : end-masking rows (lagrange_mini_masking, unless AVM mode)
    // -----------------------------------------------------------------------
    const size_t end_masking_rows = circuit.avm_mode ? 0 : Flavor::NUM_MASKED_ROWS_END;
    const size_t num_without_mask = (num_gates > end_masking_rows) ? (num_gates - end_masking_rows) : num_gates;

    const bool in_start_random_range = (row_idx >= Flavor::RANDOMNESS_START && row_idx < RESULT_ROW);
    const bool in_end_random_range = (row_idx >= num_without_mask);
    const bool in_processing_range = (row_idx >= RESULT_ROW && row_idx < num_without_mask);
    const bool is_even = (row_idx % 2 == 0);

    values.lagrange_mini_masking = Fr(in_start_random_range || in_end_random_range ? 1 : 0);
    values.lagrange_even_in_minicircuit = Fr(in_processing_range && is_even ? 1 : 0);
    values.lagrange_odd_in_minicircuit = Fr(in_processing_range && !is_even ? 1 : 0);
    values.lagrange_result_row = Fr(row_idx == RESULT_ROW ? 1 : 0);
    values.lagrange_last_in_minicircuit = Fr(num_without_mask > 0 && row_idx == num_without_mask - 1 ? 1 : 0);
}

bool TranslatorCircuitChecker::check(const Builder& circuit)
{
    using OpcodeConstraint = TranslatorOpcodeConstraintRelation<Fr>;
    using AccumulatorTransfer = TranslatorAccumulatorTransferRelation<Fr>;
    using Decomposition = TranslatorDecompositionRelation<Fr>;
    using NonNativeField = TranslatorNonNativeFieldRelation<Fr>;

    const Params params = compute_relation_params(circuit);
    AllValues values{};

    for (size_t i = 0; i < circuit.num_gates(); ++i) {
        populate_values(circuit, values, i);

        if (!check_relation<OpcodeConstraint>(values, params)) {
            info("TranslatorCircuitChecker: Failed TranslatorOpcodeConstraintRelation at row = ", i);
            return false;
        }
        if (!check_relation<AccumulatorTransfer>(values, params)) {
            info("TranslatorCircuitChecker: Failed TranslatorAccumulatorTransferRelation at row = ", i);
            return false;
        }
        if (!check_relation<Decomposition>(values, params)) {
            info("TranslatorCircuitChecker: Failed TranslatorDecompositionRelation at row = ", i);
            return false;
        }
        if (!check_relation<NonNativeField>(values, params)) {
            info("TranslatorCircuitChecker: Failed TranslatorNonNativeFieldRelation at row = ", i);
            return false;
        }
    }
    return true;
}

} // namespace bb

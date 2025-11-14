// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "acir_format.hpp"
#include "serde/index.hpp"

namespace acir_format {

/**
 * @brief Converts from the ACIR-native `WitnessStack` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param buf Serialized representation of a `WitnessStack`.
 * @return A `WitnessVector` equivalent to the last `WitnessMap` in the stack.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_buf_to_witness_data(std::vector<uint8_t>&& buf);

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf);

/**
 * @brief Converts an ACIR Circuit object directly to AcirFormat (exposed for fuzzing)
 * @param circuit The ACIR circuit object
 * @return AcirFormat representation of the circuit
 */
AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit);

std::vector<AcirFormat> program_buf_to_acir_format(std::vector<uint8_t>&& buf);

WitnessVectorStack witness_buf_to_witness_stack(std::vector<uint8_t>&& buf);

AcirProgramStack get_acir_program_stack(std::string const& bytecode_path, std::string const& witness_path);

/**
 * @brief Converts an Acir::Expression representing a width-4 arithmetic gate into Barretenberg's internal
 * representation for this constraint.
 *
 * @details An Acir::Expression representing a width-4 arithmetic gate represents the following equation:
 *    mul_scaling * (a * b) + a_scaling * a + b_scaling * b + c_scaling * c + d_scaling * d + const_scaling == 0
 * We map the Acir::Expression into Barretenberg's internal representation for this type of constraint: mul_quad_<fr>.
 * We proceed in this:
 *  - Step 1: We check if there is a multiplication term in the expression. In this case, we assign the corresponding
 *            witnesses and multiplication scalar.
 *  - Step 2: We iterate over the linear terms in the expression, and we assign each term to one of the four wires. If
 *            repeated witnesses are encountered, the selector values for those witnesses are aggregated together.
 *  - Step 3: We assign the constant term.
 *
 * If in Step 2 we encounter more than four distinct witnesses, we raise an error. Note that this should never happen,
 * as this function is only used when it has been determined that the Acir::Expression first in one width-4 arithmetic
 * gate.
 */
mul_quad_<fr> serialize_single_quad_gate(Acir::Expression const& arg);

// clang-format off
/**
 * @brief Convert an Acir::Expression representing an arithmetic operation that doesn't fit into a single width-4
 * arithmetic gate into multiple width-4 arithmetic gates.
 *
 * @details This function handles Acir::Expressions that don't fit into a single width-4 arithmetic gate. For example,
 * expressions with multiple multiplication terms, or expressions involving more than 4 distinct witnesses. To optimize
 * the number of gates added to the builder, we leverage the 4th wire and the fact that our arithmetic relation supports
 * representing the following expressions:
 *    mul_scaling * (a * b) +
 *          a_scaling * a + b_scaling * b + c_scaling * c + d_scaling * d + const_scaling + w4_shift == 0
 * where w4_shift is the value of the 4th wire at the next row in the trace.
 *
 * @example Consider the expression: w1 * w2 + w3 * w4 + w5 + w6 + w7 + const == 0. Then, we split the expression as follows:
 *
 * | a_idx | b_idx | c_idx | d_idx                          | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx |
 * |-------|-------|-------|--------------------------------|-------------|-----------|-----------|-----------|-----------|-----------|
 * | w1    | w2    | w5    | w6                             | 1           | 1         | 1         | 1         | 1         | const     |
 * | w3    | w4    | w7    | -(w1 * w2 + w5 + w6 + const)   | 1           | 1         | 1         | 1         | -1        | 0         |
 *
 * If we didn't have the option of using w4_shift, we would have needed a third gate to accomodate the expression. Note that we
 * don't know the witness index of the witness -(w1 * w2 + w5 + w6 + const) when we split the expression into multiple gates.
 * For this reason, we leave the d_idx unassigned for all gates except the first one when we split the expression, and we set d_idx
 * when we add the constraints for the expression to the builder.
 */
// clang-format on
std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg);

bool is_single_arithmetic_gate(Acir::Opcode::AssertZero const& arg);
} // namespace acir_format

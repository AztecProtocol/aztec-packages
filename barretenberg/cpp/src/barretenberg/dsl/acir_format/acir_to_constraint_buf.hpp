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

// clang-format off
/**
 * @brief Convert an Acir::Expression into a series of width-4 arithmetic gates.
 *
 * @details An Acir::Expression represents a calculation of the form
 * \f[
 *          \sum_{i, j} c_{ij} w_i * w_j + \sum_i c_i w_i + const = 0
 * \f]
 * These expressions are internally represented in Barretenberg as a series of mul_quad_ gates, each of which represents an expression
 * either of the form:
 * \f[
 *    mul_{scaling} * (a * b) +
 *          a_{scaling} * a + b_{scaling} * b + c_{scaling} * c + d_{scaling} * d + const == 0
 * \f]
 * or of the form:
 * \f[
 *    mul_{scaling} * (a * b) +
 *          a_{scaling} * a + b_{scaling} * b + c_{scaling} * c + d_{scaling} * d + const + w4_{shift} == 0
 * \f]
 * The usage of \f$w4_{shift}\f$ is toggled on and off according to whether the expression fits in a single width-4 arithmetic gate or not.
 *
 * The process of turning an Acir::Expression into a series of gates is split into the following steps:
 * 1. Add as many gates as there are multiplication terms. While adding these gates, attempt to add linear terms if they have the same witnesses
 *    indices of witnesses involved in the multiplication. For example, for w1 * w2 + w1, the first (and only) gate will be:
 *    | a_idx | b_idx | c_idx       | d_idx       | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx   |
 *    |-------|-------|-------------|-------------|-------------|-----------|-----------|-----------|-----------|-------------|
 *    | w1    | w2    | IS_CONSTANT | IS_CONSTANT | 1           | 1         | 0         | 0         | 0         | IS_CONSTANT |
 * 2. Run through the the gates that have been added and add as many linear terms as possible (for the first gate, we can use two witnesses,
 *    while for all the other gates we have only one as the fourth witness is reserved for w4_shift)
 * 3. Run through the remaining linear terms and add as many gates as needed to handle them.
 *
 *
 * @example Consider the expression: w1 * w2 + w5 + w6 + const == 0. This expression fits into a single width-4 arithmetic gate as it contains
 * only one multiplication term, and there are only 4 distinct witnesses. We turn this expression into the following gate (where w4_shift is
 * toggled off):
 *
 * | a_idx | b_idx | c_idx | d_idx | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx |
 * |-------|-------|-------|-------|-------------|-----------|-----------|-----------|-----------|-----------|
 * | w1    | w2    | w5    | w6    | 1           | 1         | 1         | 1         | 1         | const     |
 *
 * @example Consider the expression: w1 * w2 + w3 * w4 + w5 + w6 + w7 + const == 0. This expression doesn't fit into a single width-4
 * arithmetic gate as it contains 2 multiplications terms (and also because it contains 7 distinct witnesses). We turn this expression into
 * the following series of gates (where w4_shift is toggled on in all gates but the first one):
 *
 * | a_idx | b_idx | c_idx | d_idx                        | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx   |
 * |-------|-------|-------|------------------------------|-------------|-----------|-----------|-----------|-----------|-------------|
 * | w1    | w2    | w5    | w6                           | 1           | 1         | 1         | 1         | 1         | const       |
 * | w3    | w4    | w7    | -(w1 * w2 + w5 + w6 + const) | 1           | 1         | 1         | 1         | -1        | IS_CONSTANT |
 *
 * If we didn't have the option of using w4_shift, we would have needed a third gate to accomodate the expression. Note that we
 * don't know the witness index of the witness -(w1 * w2 + w5 + w6 + const) when we split the expression into multiple gates.
 * For this reason, we leave d_idx unassigned for all gates except the first one when we split the expression, and we set d_idx
 * when we add the constraints for the expression to the builder.
 *
 *
 *
 *
 */
// clang-format on
std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms);

/**
 * @brief Given an Acir::Expression and its processed linear terms, determine whether it can be represented by a single
 * width-4 arithmetic gate.
 *
 * @details By processed linear terms, we mean selector values accumulated per witness index. See process_linear_terms.
 */
bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms);

/**
 * @brief Process the linear terms of an Acir::Expression into a map of witness indices to selector values.
 *
 * @details Iterating over the linear terms of the expression, we accumulate selector values for each witness index
 */
std::map<uint32_t, bb::fr> process_linear_terms(Acir::Expression const& expr);
} // namespace acir_format

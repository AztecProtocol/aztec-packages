// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "acir_format.hpp"
#include "serde/index.hpp"

namespace acir_format {

/// ========= HELPERS ========= ///

/// The functions below are helpers for converting data between ACIR representations and Barretenberg's internal
/// representations.

/**
 * @brief Deserialize an fr element from buffer. The function checks that the buffer is exactly 32 bytes long.
 *
 * @param buffer
 * @return bb::fr
 */
bb::fr from_buffer_with_bound_checks(const std::vector<uint8_t>& buffer);

/**
 * @brief Parse an Acir::FunctionInput (which can either be a witness or a constant) into a WitnessOrConstant.
 */
WitnessOrConstant<bb::fr> parse_input(const Acir::FunctionInput& input);

/**
 * @brief Extract the witness index from an Acir::FunctionInput representing a witness.
 *
 * @note The function asserts that the input is indeed a witness variant.
 */
uint32_t get_witness_from_function_input(const Acir::FunctionInput& input);

/**
 * @brief Update the max_witness_index.
 *
 * @details In write_vk scenarios, we use the max witness index to populate the builder with enough dummy variables.
 * When a witness vector is provided, we check that the max witness index is equal to the length of the witness vector
 * minus one to avoid buffer overrides.
 *
 */
void update_max_witness_index(const uint32_t witness_idx, AcirFormat& af);

/**
 * @brief Update max_witness_index by processing all witnesses in an Acir::Expression.
 *
 * @details This function extracts witness indices from both multiplication terms and linear combinations
 * in an expression and updates the max witness index
 *
 */
void update_max_witness_index_from_expression(Acir::Expression const& expr, AcirFormat& af);

/**
 * @brief Update the max witness index by processing all the witness indices contained in the Acir::Opcode
 *
 * @param opcode
 * @param af
 */
void update_max_witness_index_from_opcode(Acir::Opcode const& opcode, AcirFormat& af);

/// ========= BYTES TO BARRETENBERG'S REPRESENTATION  ========= ///

/// The functions below handle the transition from serialized ACIR formats (msgpack-compact), which is the output of
/// compiling a Noir program, to Barretenberg's internal formats.
///
/// The flow is as follows:
/// - A buffer of bytes is deserialized according to msgpack-compact into an Acir::Circuit, which is just the
///   representation of a function in terms of Acir::Opcodes, Acir::Witness, Acir::PublicInputs.
/// - The Acir::Circuit is transformed into AcirFormat, which is Barretenberg's internal representation of the Acir
///   constraints that have to be added to the Builder.
/// - A buffer of bytes is deserialized into a WitnessVector, which is the list of witness values known at the time of
///   noir program execution. This conversion takes a WitnessMap (which is a list of couples (witness_index,
///   witness_value)) and converts it to a vector of bb::fr elements. ACIR optimizes away some witnesses, so the
///   WitnessMap may have holes: witness indices go up, but not necessarily by one. The conversion accounts for these
///   holes and fills them with zeros. NOTE: The witness vector does NOT contain all the witnesses that will be present
///   in the builder by the end of circuit construction.
/// - The AcirFormat structure and the WitnessVector are passed to acir_format::create_circuit,
///   which constructs a barretenberg circuit by adding the relevant constraints and witnesses to a Builder

/**
 * @brief Deserialize `buf` containing msgpack-compact format data.
 *
 * @note The function expects the first byte to be a format marker (2 for msgpack, 3 for msgpack-compact).
 * The data must be in msgpack array format (compact format), not map format.
 */
template <typename T>
T deserialize_msgpack_compact(std::vector<uint8_t>&& buf, std::function<T(msgpack::object const&)> decode_msgpack);

/**
 * @brief Convert an Acir::Circuit into an AcirFormat by processing all the opcodes.
 */
AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit);

/**
 * @brief Convert from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned a random value.
 * Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_map_to_witness_vector(Witnesses::WitnessMap const& witness_map);

/**
 * @brief Convert a buffer representing a circuit into Barretenberg's internal `AcirFormat` representation.
 */
AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf);

/**
 * @brief Convert a buffer representing a witness vector into Barretenberg's internal `WitnessVector` format.
 */
WitnessVector witness_buf_to_witness_vector(std::vector<uint8_t>&& buf);

/// ========= ACIR OPCODE HANDLERS ========= ///

/// ========= ARITHMETIC =================== ///

/**
 * @brief Process the linear terms of an Acir::Expression into a map of witness indices to selector values.
 *
 * @details Iterating over the linear terms of the expression, we accumulate selector values for each witness index
 */
std::map<uint32_t, bb::fr> process_linear_terms(Acir::Expression const& expr);

/**
 * @brief Given an Acir::Expression and its processed linear terms, determine whether it can be represented by a single
 * width-4 arithmetic gate.
 *
 * @details By processed linear terms, we mean selector values accumulated per witness index. See process_linear_terms.
 */
bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms);

// clang-format off
/**
 * @brief Convert an Acir::Expression into a series of width-4 arithmetic gates.
 *
 * @details An Acir::Expression represents a calculation of the form
 * \f[
 *          \sum_{i, j} c_{ij} w_i * w_j + \sum_i c_i w_i + const = 0
 * \f]
 * These expressions are internally represented in Barretenberg as a series of mul_quad_<bb::fr> gates, each of which represents an expression
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
 * 1. Add as many gates as there are multiplication terms. While adding these gates, attempt to add linear terms if they have the same
 *    witnesses indices of witnesses involved in the multiplication. For example, for w1 * w2 + w1, the first (and only) gate will be:
 *    | a_idx | b_idx | c_idx       | d_idx       | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const       |
 *    |-------|-------|-------------|-------------|-------------|-----------|-----------|-----------|-----------|-------------|
 *    | w1    | w2    | IS_CONSTANT | IS_CONSTANT | 1           | 1         | 0         | 0         | 0         | 0           |
 * 2. Run through the the gates that have been added and add as many linear terms as possible (for the first gate, we can use two witnesses,
 *    while for all the other gates we have only one as the fourth witness is reserved for w4_shift)
 * 3. Run through the remaining linear terms and add as many gates as needed to handle them.
 *
 * @note In the case of expressions that require more than one gate, this function performs the first step in a two-step process. Namely, it
 * leaves the d-terms of all the gates except the first one unassigned. The function create_big_quad_constraint handles the second part,
 * which assigns the d-terms.
 *
 * @example Consider the expression: w1 * w2 + w5 + w6 + const == 0. This expression fits into a single width-4 arithmetic gate as it
 * contains only one multiplication term, and there are only 4 distinct witnesses. We turn this expression into the following gate
 * (where w4_shift is toggled off):
 *
 * | a_idx | b_idx | c_idx | d_idx | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const     |
 * |-------|-------|-------|-------|-------------|-----------|-----------|-----------|-----------|-----------|
 * | w1    | w2    | w5    | w6    | 1           | 0         | 0         | 1         | 1         | const     |
 *
 */
// clang-format on
std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms);

/**
 * @brief Single entrypoint for processing arithmetic (AssertZero) opcodes.
 *
 * @details This function processes an Acir::Opcode::AssertZero by converting it into one more more mul_quad_ gates. The
 * function asserts that all the gates produced are non-zero and that the number of gates produced is consistent with
 * expectation (one gate if the opcode is meant to fit in one gate, more than one gate if the opcode is not meant to fit
 * in one gate).
 *
 */
void assert_zero_to_quad_constraints(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index);

/// ========= MEMORY OPERATIONS ========== ///

/**
 * @brief Process memory initialization: create a BlockConstraint storing the entries with which the memory table must
 * be initialized.
 *
 */
BlockConstraint memory_init_to_block_constraint(Acir::Opcode::MemoryInit const& mem_init);

/**
 * @brief Process memory operation, either read or write, and update the BlockConstraint type accordingly.
 *
 */
void add_memory_op_to_block_constraint(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block);

/// ========= BLACKBOX FUNCTIONS ========= ///

/**
 * @brief Single entrypoint for processing blackbox function opcodes.
 *
 * @details This function takes an Acir::Opcode::BlackBoxFuncCall and processes the data contained in it by converting
 * it into barretenberg's internal representation. The function handles each variant of Acir::Opcode::BlackBoxFunCall
 * and throws an error if it encounters an unknown type.
 *
 * @example BlackBoxFuncCall::AND is the opcode that barretenberg converts to a logic AND constraint.
 * BlackBoxFuncCall::AND has two inputs lhs, rhs, one output result, a parameter num_bits, and a flag is_xor_gate. The
 * inputs lhs, rhs are Acir::FunctionInput, which means they can be either witnesses or constants. The result is
 * Acir::Witness, which means it's a witness. Barretenberg internally represents a LogicConstraint as a struct with two
 * WitnessOrConstant inputs (lhs, rhs), one witness (result), the parameter num_bits, and the flag is_xor_flag. This
 * function takes BlackBoxFuncCall::AND, converts lhs and rhs into WitnessOrConstant objects, result into a uint32_t
 * (witness), and passes along num_bits and the flag. This representation of the logic constraint is then added to the
 * AcirFormat struct.
 *
 */
void add_blackbox_func_call_to_acir_format(Acir::Opcode::BlackBoxFuncCall const& arg,
                                           AcirFormat& af,
                                           size_t opcode_index);

} // namespace acir_format

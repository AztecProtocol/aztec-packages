// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "acir_format.hpp"
#include "serde/index.hpp"

namespace acir_format {

/// ========= HELPERS ========= ///

/// The functions below are helpers for converting data between ACIR representations and Barretenberg's internal
/// representations.

/**
 * @brief Convert an array of 32 bytes into a uint256_t by interpreting the bytes as the big-endian
 * (most-significant-byte first) representation of that number.
 *
 * @param bytes
 * @return uint256_t
 */
uint256_t from_big_endian_bytes(std::vector<uint8_t> const& bytes);

/**
 * @brief Parse an Acir::FunctionInput (which can either be a witness or a constant) into a WitnessOrConstant.
 */
WitnessOrConstant<bb::fr> parse_input(Acir::FunctionInput input);

/**
 * @brief Extract the witness index from an Acir::FunctionInput representing a witness.
 *
 * @note The function asserts that the input is indeed a witness variant.
 */
uint32_t get_witness_from_function_input(Acir::FunctionInput input);

/// ========= BYTES TO BARRETENBERG'S REPRESENTATION  ========= ///

/// The functions below handle the transition from serialized ACIR formats (msgpack and bincode), which is the output of
/// compiling a Noir program, to Barretenberg's internal formats.
///
/// The flow is as follows:
/// - A buffer of bytes is deserialised according to either msgpack or bincode into an Acir::Circuit, which is just the
///   representation of a function in terms of Acir::Opcodes, Acir::Witness, Acir::PublicInputs. As of now (Nov 2025)
///   only bincode is supported.
/// - The Acir::Circuit is transformed into AcirFormat, which is Barretenberg's internal representation of the Acir
///   constraints that have to be added to the Builder.
/// - A buffer of bytes is deserialised into a WitnessVector, which is the list of witness values known at the time of
///   noir program execution. This conversion takes a WitnessMap (which is a list of couples (witness_index,
///   witness_value)) and converts it to a vector of bb::fr elements. ACIR optimizes away some witnesses, so the
///   WitnessMap may have holes: witness indices go up, but not necessarily by one. The conversion accounts for these
///   holes and fills them with zeros. NOTE: The witness vector does NOT contain all the witnesses that will be present
///   in the builder by the end of circuit construction.
/// - The AcirFormat structure and the WitnessVector are passed to acir_format::create_circuit,
///   which constructs a barretenberg circuit by adding the relevant constraints and witnesses to a Builder

/**
 * @brief Deserialize `buf` either based on the first byte interpreted as a Noir serialization format byte, or
 * falling back to `bincode` if the format cannot be recognized. Currently only `bincode` is expected.
 *
 * @note The function is written so that it can deserialize either `msgpack` or `bincode` depending on the first byte
 * of the buffer. However, at the moment only `bincode` is supported, so we fail in case `msgpack` is encountered. Note
 * that due to the lack of exception handling available in Wasm, the code cannot be structured to try `bincode` and
 * fall back to `msgpack` if that fails. Therefore, we look at the first byte and commit to a format based on that.
 */
template <typename T>
T deserialize_any_format(std::vector<uint8_t>&& buf,
                         std::function<T(msgpack::object const&)> decode_msgpack,
                         std::function<T(std::vector<uint8_t>)> decode_bincode);

/**
 * @brief Convert an Acir::Circuit into an AcirFormat by processing all the opcodes.
 */
AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit);

/**
 * @brief Convert from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
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
/// AUDITTODO(federico): Restructure the functions below so that it is clear how they are used

/// ========= ARITHMETIC =================== ///

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
 *    | a_idx | b_idx | c_idx       | d_idx       | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx   |
 *    |-------|-------|-------------|-------------|-------------|-----------|-----------|-----------|-----------|-------------|
 *    | w1    | w2    | IS_CONSTANT | IS_CONSTANT | 1           | 1         | 0         | 0         | 0         | IS_CONSTANT |
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
 * | a_idx | b_idx | c_idx | d_idx | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx |
 * |-------|-------|-------|-------|-------------|-----------|-----------|-----------|-----------|-----------|
 * | w1    | w2    | w5    | w6    | 1           | 1         | 1         | 1         | 1         | const     |
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

/**
 * @brief Construct a poly_tuple for a standard width-3 arithmetic gate from its acir representation.
 */
arithmetic_triple serialize_arithmetic_gate(Acir::Expression const& arg);

/**
 * @brief Assigns a linear term to a specific index in a mul_quad_<bb::fr> gate.
 */
void assign_linear_term(mul_quad_<bb::fr>& gate, int index, uint32_t witness_index, bb::fr const& scaling);

bool is_assert_equal(mul_quad_<fr> const& mul_quad);

void handle_arithmetic(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index);

/// ========= MEMORY OPERATIONS ========== ///

BlockConstraint handle_memory_init(Acir::Opcode::MemoryInit const& mem_init);

bool is_rom(Acir::MemOp const& mem_op);

uint32_t poly_to_witness(const arithmetic_triple poly);

void handle_memory_op(Acir::Opcode::MemoryOp const& mem_op, AcirFormat& af, BlockConstraint& block);

/// ========= BLACKBOX FUNCTIONS ========= ///

void handle_blackbox_func_call(Acir::Opcode::BlackBoxFuncCall const& arg, AcirFormat& af, size_t opcode_index);

} // namespace acir_format

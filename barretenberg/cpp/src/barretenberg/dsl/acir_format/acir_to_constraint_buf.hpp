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

/**
 * @brief Construct a poly_tuple for a standard width-3 arithmetic gate from its acir representation.
 */
poly_triple serialize_arithmetic_gate(Acir::Expression const& arg);

/**
 * @brief Assigns a linear term to a specific index in a mul_quad_ gate.
 */
void assign_linear_term(mul_quad_<bb::fr>& gate, int index, uint32_t witness_index, bb::fr const& scaling);

/**
 * @brief Accumulate the input expression into a series of quad gates.
 */
std::vector<mul_quad_<bb::fr>> split_into_mul_quad_gates(Acir::Expression const& arg);

mul_quad_<bb::fr> serialize_mul_quad_gate(Acir::Expression const& arg);

void constrain_witnesses(Acir::Opcode::AssertZero const& arg, AcirFormat& af);

std::pair<uint32_t, uint32_t> is_assert_equal(Acir::Opcode::AssertZero const& arg,
                                              poly_triple const& pt,
                                              AcirFormat const& af);

void handle_arithmetic(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index);

void handle_blackbox_func_call(Acir::Opcode::BlackBoxFuncCall const& arg, AcirFormat& af, size_t opcode_index);

BlockConstraint handle_memory_init(Acir::Opcode::MemoryInit const& mem_init);

bool is_rom(Acir::MemOp const& mem_op);

uint32_t poly_to_witness(const poly_triple poly);

void handle_memory_op(Acir::Opcode::MemoryOp const& mem_op, AcirFormat& af, BlockConstraint& block);

} // namespace acir_format

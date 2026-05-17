// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "acir_format.hpp"

namespace acir_format {

/**
 * @brief Deserialize an fr element from buffer. The function checks that the buffer is exactly 32 bytes long.
 *
 * @param buffer
 * @return bb::fr
 */
bb::fr from_buffer_with_bound_checks(const std::vector<uint8_t>& buffer);

/**
 * @brief Update the max_witness_index.
 *
 * @details In write_vk scenarios, we use the max witness index to populate the builder with enough dummy variables.
 * When a witness vector is provided, we check that the max witness index is equal to the length of the witness vector
 * minus one to avoid buffer overrides.
 *
 */
void update_max_witness_index(const uint32_t witness_idx, AcirFormat& af);

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
 * @brief Convert a buffer representing a circuit into Barretenberg's internal `AcirFormat` representation.
 */
AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf);

/**
 * @brief Convert a buffer representing a witness vector into Barretenberg's internal `WitnessVector` format.
 */
WitnessVector witness_buf_to_witness_vector(std::vector<uint8_t>&& buf);

/**
 * @brief Deserialize an ACIR program byte buffer, reserialize it, and return the format marker plus msgpack payload.
 */
std::vector<uint8_t> roundtrip_acir_bytecode(std::vector<uint8_t>&& buf);

} // namespace acir_format

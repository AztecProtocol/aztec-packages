#pragma once
#include <filesystem>
#include <vector>

#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb {

/**
 * @brief Result of in-memory AVM proving.
 */
struct AvmProveResult {
    std::vector<bb::fr> proof;
};

/**
 * @brief Prove an AVM transaction from serialized inputs (msgpack bytes).
 * Callers that need to verify the proof should call avm_verify_from_bytes separately.
 */
AvmProveResult avm_prove_from_bytes(std::vector<uint8_t> inputs);

/**
 * @brief Verify an AVM proof from serialized data.
 * @param proof The proof as a vector of field elements.
 * @param public_inputs Serialized public inputs (msgpack bytes).
 * @return true if verification succeeds.
 */
bool avm_verify_from_bytes(std::vector<bb::fr> proof, std::vector<uint8_t> public_inputs);

/**
 * @brief Check the AVM circuit from serialized inputs (msgpack bytes).
 * @return true if the circuit check passes.
 */
bool avm_check_circuit_from_bytes(std::vector<uint8_t> inputs);

// Global flag indicating AVM support is available
extern const bool avm_enabled;

/**
 * @brief Writes an avm proof to a file.
 *
 * Communication:
 * - Filesystem: The proof is written to the path output_path/proof
 *
 * @param inputs_path Path to the file containing the serialised avm public inputs and hints
 * @param output_path Path (directory) to write the output proof
 */
void avm_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path);

void avm_check_circuit(const std::filesystem::path& inputs_path);

/**
 * @brief Verifies an avm proof and writes the result to stdout
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param public_inputs_path Path to the file containing the serialized public inputs
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
// NOTE: The proof should NOT include the public inputs.
bool avm_verify(const std::filesystem::path& proof_path, const std::filesystem::path& public_inputs_path);

/**
 * @brief Simulates an public transaction
 *
 * @param inputs_path Path to the file containing the serialised avm inputs
 */
// FIXME(fcarreiro): The inputs should not need to be the PROVING inputs.
void avm_simulate(const std::filesystem::path& inputs_path);

/**
 * @brief Writes an avm (incomplete) verification key to a file.
 *
 * Communication:
 * - Filesystem: The vk is written to the path output_path/vk
 *
 * @param output_path Path (directory) to write the output verification key
 */
void avm_write_verification_key(const std::filesystem::path& output_path);

} // namespace bb

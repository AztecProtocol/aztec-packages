#ifndef DISABLE_AZTEC_VM
#include <filesystem>

namespace bb {

/**
 * @brief Performs "check circuit" on the AVM circuit for the given public inputs and hints.
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 */
void avm_check_circuit(const std::filesystem::path& public_inputs_path, const std::filesystem::path& hints_path);

/**
 * @brief Writes an avm proof and corresponding (incomplete) verification key to files.
 *
 * Communication:
 * - Filesystem: The proof and vk are written to the paths output_path/proof and output_path/{vk, vk_fields.json}
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 * @param output_path Path (directory) to write the output proof and verification keys
 */
void avm_prove(const std::filesystem::path& public_inputs_path,
               const std::filesystem::path& hints_path,
               const std::filesystem::path& output_path);

void avm2_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path);

void avm2_check_circuit(const std::filesystem::path& inputs_path);

/**
 * @brief Verifies an avm proof and writes the result to stdout
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
bool avm_verify(const std::filesystem::path& proof_path, const std::filesystem::path& vk_path);

// NOTE: The proof should NOT include the public inputs.
bool avm2_verify(const std::filesystem::path& proof_path,
                 const std::filesystem::path& public_inputs_path,
                 const std::filesystem::path& vk_path);
} // namespace bb
#endif

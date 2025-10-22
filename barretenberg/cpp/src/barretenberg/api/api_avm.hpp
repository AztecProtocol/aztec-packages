#pragma once
#include <filesystem>
#include <string>

namespace bb {

// Global flag indicating AVM support is available
extern const bool avm_enabled;

/**
 * @brief Get the path to the loaded AVM library
 *
 * @return Path to libvm2.so/dylib if loaded, empty string otherwise
 */
std::string get_avm_library_path();

/**
 * @brief Update the CRS factories used by the loaded AVM library
 *
 * This should be called after bb initializes its CRS to transfer the CRS
 * to the dynamically loaded AVM library.
 */
void update_avm_crs();

/**
 * @brief Writes an avm proof and corresponding (incomplete) verification key to files.
 *
 * Communication:
 * - Filesystem: The proof and vk are written to the paths output_path/proof and output_path/vk
 *
 * @param inputs_path Path to the file containing the serialised avm public inputs and hints
 * @param output_path Path (directory) to write the output proof and verification keys
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
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
// NOTE: The proof should NOT include the public inputs.
bool avm_verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& vk_path);

/**
 * @brief Simulates an public transaction
 *
 * @param inputs_path Path to the file containing the serialised avm inputs
 */
// FIXME(fcarreiro): The inputs should not need to be the PROVING inputs.
void avm_simulate(const std::filesystem::path& inputs_path);

} // namespace bb

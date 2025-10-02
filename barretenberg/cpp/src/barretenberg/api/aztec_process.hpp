#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief Process Aztec contract artifacts: transpile and generate verification keys
 *
 * @param input_path Path to input artifact JSON
 * @param output_path Path to output artifact JSON (can be same as input)
 * @param force Force regeneration even if cached
 * @return true on success, false on failure
 */
bool process_aztec_artifact(const std::string& input_path, const std::string& output_path, bool force = false);

/**
 * @brief Find all contract artifacts in target/ directories
 *
 * @param search_path Root path to search from (defaults to current directory)
 * @return Vector of paths to contract artifacts
 */
std::vector<std::string> find_contract_artifacts(const std::string& search_path = ".");

/**
 * @brief Process all discovered contract artifacts in a directory tree
 *
 * @param search_path Root path to search from (defaults to current directory)
 * @param force Force regeneration even if cached
 * @return true if all artifacts processed successfully
 */
bool process_all_artifacts(const std::string& search_path = ".", bool force = false);

} // namespace bb

#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

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

} // namespace bb

#pragma once
#include <filesystem>

namespace bb {

// AVM is NOT enabled in this build (stub)
extern const bool avm_enabled;

/**
 * @brief Stub - throws runtime error if called
 */
void avm_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path);

/**
 * @brief Stub - throws runtime error if called
 */
void avm_check_circuit(const std::filesystem::path& inputs_path);

/**
 * @brief Stub - throws runtime error if called
 */
bool avm_verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& vk_path);

/**
 * @brief Stub - throws runtime error if called
 */
void avm_simulate(const std::filesystem::path& inputs_path);

/**
 * @brief Stub - throws runtime error if called
 */
void avm_write_verification_key(const std::filesystem::path& output_path);

} // namespace bb

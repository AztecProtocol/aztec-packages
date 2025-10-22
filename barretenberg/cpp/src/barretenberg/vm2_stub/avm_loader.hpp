/**
 * @file avm_loader.hpp
 * @brief Internal header for AVM lazy loading
 */
#pragma once

#include <string>

namespace bb {

class IAvmApi;

/**
 * @brief Lazy-load the AVM API
 *
 * This function attempts to load libvm2.so/dylib on first call.
 * Returns the loaded implementation if successful, nullptr otherwise.
 * The result is cached - subsequent calls return the same instance.
 *
 * @return Pointer to AVM API implementation, or nullptr if not available
 */
IAvmApi* get_or_load_avm_api();

/**
 * @brief Get the path to the loaded AVM library
 *
 * @return Path to libvm2.so/dylib if loaded, empty string otherwise
 */
std::string get_avm_library_path();

} // namespace bb

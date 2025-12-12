#pragma once

namespace bb {

/**
 * @brief Initialize memory limits for the process.
 *
 * This function sets the maximum memory (virtual address space) limit for the current process
 * using setrlimit (on Linux/macOS).
 *
 * On platforms where memory limiting is not supported, a warning is logged but execution continues.
 *
 * Memory limits:
 * - Regular BB: 16GB
 * - AVM: 128GB (conservative)
 *
 * The BB_MAX_MEMORY environment variable can override these defaults (value in bytes).
 *
 * If memory allocation fails due to the limit, a custom new handler reports the error to stderr
 * before throwing std::bad_alloc.
 *
 * @param is_avm Whether this is an AVM operation (uses 128GB instead of 16GB)
 * @note This should be called early before significant memory allocation occurs.
 */
void initialize_memory_limit(bool is_avm = false);

} // namespace bb

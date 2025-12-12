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
 * - Regular proving: 16GB
 * - AVM proving: 64GB (conservative estimate)
 *
 * If memory allocation fails due to the limit, a custom new handler reports the error to stderr
 * before throwing std::bad_alloc.
 *
 * @param is_avm Whether this is an AVM proving operation (uses higher 64GB limit)
 * @note This should be called early in main() before significant memory allocation occurs.
 */
void initialize_memory_limit(bool is_avm = false);

} // namespace bb

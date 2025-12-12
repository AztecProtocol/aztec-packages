#pragma once

#include <cstddef>

namespace bb {

/**
 * @brief Get the peak resident set size (RSS) in bytes.
 *
 * Returns the maximum RSS used by the process so far.
 * On Linux, uses getrusage(RUSAGE_SELF).ru_maxrss (in KB, converted to bytes).
 * On macOS, uses getrusage(RUSAGE_SELF).ru_maxrss (already in bytes).
 *
 * @return Peak RSS in bytes, or 0 on error/unsupported platform
 */
std::size_t get_peak_rss_bytes();

/**
 * @brief Get the current memory limit in bytes.
 *
 * Returns the current RLIMIT_AS (virtual address space) limit.
 *
 * @return Memory limit in bytes, or 0 if no limit set or unsupported platform
 */
std::size_t get_memory_limit_bytes();

/**
 * @brief Print current memory usage and limit to stderr.
 *
 * Displays "Memory usage: X.XX GB / Y.YY GB limit" or similar.
 * No-op on platforms without getrusage/getrlimit support.
 */
void print_memory_limit_usage();

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

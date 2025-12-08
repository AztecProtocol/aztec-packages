#pragma once

namespace bb {

/**
 * @brief Initialize memory limits for the process based on BB_MAX_MEMORY environment variable.
 *
 * This function sets the maximum memory (virtual address space) limit for the current process
 * using setrlimit (on Linux/macOS) or similar platform-specific mechanisms.
 *
 * On platforms where memory limiting is not supported, a warning is logged but execution continues.
 *
 * The memory limit is controlled by the BB_MAX_MEMORY environment variable, which specifies
 * the limit in bytes. If not set, defaults to 4GB.
 *
 * @note This should be called early in main() before significant memory allocation occurs.
 */
void initialize_memory_limit();

} // namespace bb

#include "memory_limit.hpp"
#include <cerrno>
#include <cstddef>
#include <cstring>
#include <iostream>
#include <new>

#if defined(__linux__) || defined(__APPLE__)
#include <sys/resource.h>
#endif

namespace bb {

namespace {
    // Default memory limits
    constexpr std::size_t DEFAULT_MEMORY_LIMIT = 16ULL * 1024 * 1024 * 1024;  // 16GB for regular proving
    constexpr std::size_t AVM_MEMORY_LIMIT = 64ULL * 1024 * 1024 * 1024;      // 64GB for AVM (conservative)

#if defined(__linux__) || defined(__APPLE__)
    /**
     * @brief Custom new handler that reports memory limit errors
     */
    void memory_limit_new_handler()
    {
        std::cerr << "FATAL: Failed to allocate memory!\n";
        std::cerr << "This may be due to the process memory limit (setrlimit RLIMIT_AS).\n";
        std::cerr << "The process has been configured with a memory limit for safety.\n";
        throw std::bad_alloc();
    }
#endif

} // anonymous namespace

void initialize_memory_limit(bool is_avm)
{
#if defined(__wasm__) || defined(__EMSCRIPTEN__)
    // WASM doesn't support setrlimit - silently skip without warnings
    return;
#elif defined(__linux__) || defined(__APPLE__)
    const std::size_t memory_limit = is_avm ? AVM_MEMORY_LIMIT : DEFAULT_MEMORY_LIMIT;
    const double memory_limit_gb = static_cast<double>(memory_limit) / (1024.0 * 1024.0 * 1024.0);

    struct rlimit limit;
    limit.rlim_cur = memory_limit;
    limit.rlim_max = memory_limit;

    if (setrlimit(RLIMIT_AS, &limit) == 0) {
        std::cerr << "BB memory limit set to " << memory_limit_gb << " GB"
                  << (is_avm ? " (AVM - conservative)" : "") << "\n";

        // Install new handler to report allocation failures
        std::set_new_handler(memory_limit_new_handler);
    } else {
        std::cerr << "Warning: Failed to set memory limit to " << memory_limit_gb
                  << " GB: " << std::strerror(errno) << "\n";
        std::cerr << "Continuing without memory limit enforcement\n";
    }
#else
    // Not Linux/macOS and not WASM - warn loudly
    std::cerr << "WARNING: Memory limiting is not supported on this platform!\n";
    std::cerr << "WARNING: The process may consume unlimited memory.\n";
#endif
}

} // namespace bb

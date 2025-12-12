#include "memory_limit.hpp"
#include <cerrno>
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <new>

#if defined(__linux__) || defined(__APPLE__)
#include <sys/resource.h>
#endif

namespace bb {

namespace {
    // Memory limits
    constexpr std::size_t DEFAULT_MEMORY_LIMIT = 16ULL * 1024 * 1024 * 1024;   // 16GB for BB
    constexpr std::size_t AVM_MEMORY_LIMIT = 128ULL * 1024 * 1024 * 1024;      // 128GB for AVM (conservative)

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
    std::size_t memory_limit;

    // Check for BB_MAX_MEMORY environment variable override
    const char* env_override = std::getenv("BB_MAX_MEMORY");
    if (env_override != nullptr) {
        char* end = nullptr;
        unsigned long long value = std::strtoull(env_override, &end, 10);
        if (end != env_override && *end == '\0') {
            memory_limit = static_cast<std::size_t>(value);
        } else {
            std::cerr << "Warning: Invalid BB_MAX_MEMORY value '" << env_override << "', ignoring\n";
            memory_limit = is_avm ? AVM_MEMORY_LIMIT : DEFAULT_MEMORY_LIMIT;
        }
    } else {
        // Use default based on mode
        memory_limit = is_avm ? AVM_MEMORY_LIMIT : DEFAULT_MEMORY_LIMIT;
    }

    // If memory limit is 0, skip setting rlimit entirely
    if (memory_limit == 0) {
        return;
    }

    const double memory_limit_gb = static_cast<double>(memory_limit) / (1024.0 * 1024.0 * 1024.0);

    struct rlimit limit;
    limit.rlim_cur = memory_limit;
    limit.rlim_max = memory_limit;

    if (setrlimit(RLIMIT_AS, &limit) == 0) {
        std::cerr << "BB memory limit set to " << memory_limit_gb << " GB\n";

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

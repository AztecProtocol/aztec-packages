#include "memory_limit.hpp"
#include <cerrno>
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <iostream>

#if defined(__linux__) || defined(__APPLE__)
#include <sys/resource.h>
#endif

namespace bb {

namespace {
    // Default memory limit: 4GB (in bytes)
    constexpr std::size_t DEFAULT_MAX_MEMORY = 4ULL * 1024 * 1024 * 1024;

    /**
     * @brief Parse BB_MAX_MEMORY environment variable.
     * @return Memory limit in bytes, or DEFAULT_MAX_MEMORY if not set or invalid.
     */
    std::size_t get_memory_limit_from_env()
    {
        const char* env_value = std::getenv("BB_MAX_MEMORY");
        if (env_value == nullptr) {
            return DEFAULT_MAX_MEMORY;
        }

        // Parse the value
        char* end = nullptr;
        unsigned long long value = std::strtoull(env_value, &end, 10);

        // Check for parsing errors
        if (end == env_value || *end != '\0' || value == 0) {
            std::cerr << "Warning: Invalid BB_MAX_MEMORY value '" << env_value
                      << "', using default " << (DEFAULT_MAX_MEMORY / (1024 * 1024 * 1024)) << "GB\n";
            return DEFAULT_MAX_MEMORY;
        }

        return static_cast<std::size_t>(value);
    }
} // anonymous namespace

void initialize_memory_limit()
{
#if defined(__wasm__) || defined(__EMSCRIPTEN__)
    // WASM doesn't support setrlimit - silently skip without warnings
    return;
#else
    const std::size_t memory_limit = get_memory_limit_from_env();
    const double memory_limit_gb = static_cast<double>(memory_limit) / (1024.0 * 1024.0 * 1024.0);

#if defined(__linux__) || defined(__APPLE__)
    struct rlimit limit;
    limit.rlim_cur = memory_limit;
    limit.rlim_max = memory_limit;

    if (setrlimit(RLIMIT_AS, &limit) == 0) {
        std::cerr << "BB memory limit set to " << memory_limit_gb << " GB\n";
    } else {
        std::cerr << "Warning: Failed to set memory limit to " << memory_limit_gb
                  << " GB: " << std::strerror(errno) << "\n";
        std::cerr << "Continuing without memory limit enforcement\n";
    }
#else
    // Not Linux/macOS and not WASM - warn loudly
    std::cerr << "WARNING: Memory limiting is not supported on this platform!\n";
    std::cerr << "WARNING: BB_MAX_MEMORY=" << memory_limit_gb << " GB will NOT be enforced!\n";
    std::cerr << "WARNING: The process may consume unlimited memory.\n";
#endif
#endif
}

} // namespace bb

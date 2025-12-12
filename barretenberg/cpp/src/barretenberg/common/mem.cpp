#include "mem.hpp"
#include <cerrno>
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <new>

#if defined(__linux__) || defined(__APPLE__)
#include <sys/resource.h>
#elif defined(_WIN32)
#define NOMINMAX
#define PSAPI_VERSION 1
#include <psapi.h>
#include <windows.h>
#endif

namespace bb {

namespace {
// Memory limits
constexpr std::size_t DEFAULT_MEMORY_LIMIT = 16ULL * 1024 * 1024 * 1024;   // 16GB for BB
constexpr std::size_t AVM_MEMORY_LIMIT = 128ULL * 1024 * 1024 * 1024;      // 128GB for AVM (conservative)

#if defined(__linux__) || defined(__APPLE__)
/**
 * @brief Custom new handler that reports memory limit errors with usage stats
 */
void memory_limit_new_handler()
{
    std::cerr << "FATAL: Failed to allocate memory!\n";
    print_memory_limit_usage();
    std::cerr << "The process has been configured with a memory limit for safety.\n";
    throw std::bad_alloc();
}
#endif

} // anonymous namespace

std::size_t get_peak_rss_bytes()
{
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS pmc {};
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        return static_cast<std::size_t>(pmc.PeakWorkingSetSize);
    }
#elif defined(__APPLE__) || defined(__FreeBSD__)
    struct rusage usage {};
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // ru_maxrss is already bytes on macOS / BSD
        return static_cast<std::size_t>(usage.ru_maxrss);
    }
#elif defined(__linux__)
    struct rusage usage {};
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // ru_maxrss is kilobytes on Linux → convert to bytes
        return static_cast<std::size_t>(usage.ru_maxrss) * 1024ULL;
    }
#endif
    return 0; // fallback on error / unsupported platform
}

std::size_t get_memory_limit_bytes()
{
#if defined(__linux__) || defined(__APPLE__)
    struct rlimit limit {};
    if (getrlimit(RLIMIT_AS, &limit) == 0) {
        return static_cast<std::size_t>(limit.rlim_cur);
    }
#endif
    return 0; // no limit set or unsupported
}

void print_memory_limit_usage()
{
    const std::size_t rss = get_peak_rss_bytes();
    const std::size_t limit = get_memory_limit_bytes();

    if (rss > 0 && limit > 0) {
        const double rss_gb = static_cast<double>(rss) / (1024.0 * 1024.0 * 1024.0);
        const double limit_gb = static_cast<double>(limit) / (1024.0 * 1024.0 * 1024.0);
        std::cerr << "Memory usage: " << std::fixed << std::setprecision(2) << rss_gb << " GB / " << limit_gb
                  << " GB limit\n";
    } else if (rss > 0) {
        const double rss_gb = static_cast<double>(rss) / (1024.0 * 1024.0 * 1024.0);
        std::cerr << "Memory usage: " << std::fixed << std::setprecision(2) << rss_gb << " GB (no limit set)\n";
    }
}

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

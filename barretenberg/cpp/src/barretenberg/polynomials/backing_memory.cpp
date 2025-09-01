#include "barretenberg/polynomials/backing_memory.hpp"
#include <atomic>
#include <cstdlib>
#include <limits>

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool slow_low_memory =
    std::getenv("BB_SLOW_LOW_MEMORY") == nullptr ? false : std::string(std::getenv("BB_SLOW_LOW_MEMORY")) == "1";

// Parse storage budget from environment variable (in GB)
static size_t parse_storage_budget()
{
    const char* env_val = std::getenv("BB_STORAGE_BUDGET_GB");
    if (env_val == nullptr) {
        return std::numeric_limits<size_t>::max(); // No limit by default
    }

    try {
        size_t gb = std::stoull(env_val);
        return gb * 1024ULL * 1024ULL * 1024ULL; // Convert GB to bytes
    } catch (...) {
        return std::numeric_limits<size_t>::max(); // Invalid value, no limit
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
size_t storage_budget = parse_storage_budget();

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<size_t> current_storage_usage{ 0 };
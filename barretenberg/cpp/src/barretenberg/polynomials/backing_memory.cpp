#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cctype>
#include <cstdlib>
#include <limits>
#include <string>

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool slow_low_memory =
    std::getenv("BB_SLOW_LOW_MEMORY") == nullptr ? false : std::string(std::getenv("BB_SLOW_LOW_MEMORY")) == "1";

// Storage budget is disabled for WASM builds
#ifndef __wasm__

// Parse storage size string (e.g., "500m", "2g", "1024k")
size_t parse_size_string(const std::string& size_str)
{
    if (size_str.empty()) {
        return std::numeric_limits<size_t>::max();
    }

    try {
        std::string str = size_str;

        // Convert to lowercase for case-insensitive comparison
        char suffix = static_cast<char>(std::tolower(static_cast<unsigned char>(str.back())));
        size_t multiplier = 1;

        // Check for unit suffix
        if (suffix == 'k') {
            multiplier = 1024ULL;
            str.pop_back();
        } else if (suffix == 'm') {
            multiplier = 1024ULL * 1024ULL;
            str.pop_back();
        } else if (suffix == 'g') {
            multiplier = 1024ULL * 1024ULL * 1024ULL;
            str.pop_back();
        } else if (std::isdigit(static_cast<unsigned char>(suffix)) == 0) {
            // Invalid suffix
            throw_or_abort("Invalid storage size format: '" + size_str + "'. Use format like '500m', '2g', or '1024k'");
        }

        // Check if remaining string is a valid number
        if (str.empty()) {
            throw_or_abort("Invalid storage size format: '" + size_str + "'. No numeric value provided");
        }

        size_t value = std::stoull(str);
        return value * multiplier;
    } catch (const std::invalid_argument&) {
        throw_or_abort("Invalid storage size format: '" + size_str + "'. Not a valid number");
    } catch (const std::out_of_range&) {
        throw_or_abort("Invalid storage size format: '" + size_str + "'. Value out of range");
    }
}

namespace {
// Parse storage budget from environment variable (supports k/m/g suffixes like Docker)
size_t parse_storage_budget()
{
    const char* env_val = std::getenv("BB_STORAGE_BUDGET");
    if (env_val == nullptr) {
        return std::numeric_limits<size_t>::max(); // No limit by default
    }

    return parse_size_string(std::string(env_val));
}
} // namespace

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
size_t storage_budget = parse_storage_budget();

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<size_t> current_storage_usage{ 0 };

#endif // __wasm__

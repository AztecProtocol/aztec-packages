#include "barretenberg/polynomials/backing_memory.hpp"

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool slow_low_memory =
    std::getenv("BB_SLOW_LOW_MEMORY") == nullptr ? false : std::string(std::getenv("BB_SLOW_LOW_MEMORY")) == "1";

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool enable_memory_fallback = std::getenv("BB_ENABLE_MEMORY_FALLBACK") == nullptr
                                  ? false
                                  : std::string(std::getenv("BB_ENABLE_MEMORY_FALLBACK")) == "1";

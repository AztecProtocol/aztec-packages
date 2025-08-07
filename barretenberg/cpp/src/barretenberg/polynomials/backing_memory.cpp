#include "barretenberg/polynomials/backing_memory.hpp"

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool slow_low_memory =
    std::getenv("BB_SLOW_LOW_MEMORY") == nullptr ? false : std::string(std::getenv("BB_SLOW_LOW_MEMORY")) == "1";

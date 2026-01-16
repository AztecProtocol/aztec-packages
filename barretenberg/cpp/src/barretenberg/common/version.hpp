#pragma once

#include <cstddef>

namespace bb {
// Internal: Full string with sentinel prefix for binary patching by inject_version
extern const char* const BB_VERSION_PLACEHOLDER;

// The sentinel string length (used to compute offset to actual version)
constexpr size_t BB_VERSION_SENTINEL_LEN = 29; // strlen("BARRETENBERG_VERSION_SENTINEL")

// Public: Pointer to the actual version string (past the sentinel prefix)
// Use this wherever you need the version string
inline const char* BB_VERSION = BB_VERSION_PLACEHOLDER + BB_VERSION_SENTINEL_LEN;
} // namespace bb

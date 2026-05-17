// To be provided by the environment.
// For a WASM build, this is provided by the JavaScript environment.
// For a native build, this is provided in this module.
#pragma once

#include <cstddef>

#ifdef __wasm__
#include "barretenberg/common/wasm_export.hpp"
WASM_IMPORT("logstr") void logstr(char const*);
#else
extern "C" void logstr(char const*);
#endif

// Returns the peak RSS in bytes for the current process, or 0 on failure / unsupported platform.
std::size_t peak_rss_bytes();

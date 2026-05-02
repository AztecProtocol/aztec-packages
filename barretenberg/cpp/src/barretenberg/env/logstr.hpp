// To be provided by the environment.
// For a WASM build, this is provided by the JavaScript environment.
// For a native build, this is provided in this module.
#include "barretenberg/common/wasm_export.hpp"
#include <cstddef>

WASM_IMPORT("logstr") void logstr(char const*);

// Returns the peak RSS in bytes for the current process, or 0 on failure / unsupported platform.
std::size_t peak_rss_bytes();

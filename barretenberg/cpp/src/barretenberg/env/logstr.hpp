// Defined by this module for native builds, and by barretenberg/wasi for the wasm reactor.
#include "barretenberg/common/wasm_export.hpp"
#include <cstddef>

extern "C" void logstr(char const*);

// Returns the peak RSS in bytes for the current process, or 0 on failure / unsupported platform.
std::size_t peak_rss_bytes();

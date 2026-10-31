#pragma once
#include <cstddef>

// Logs a message to stderr with the process's memory use: peak RSS natively, linear memory size in wasm.
void logstr(char const* msg);

// Returns the peak RSS in bytes for the current process, or 0 on failure / unsupported platform.
std::size_t peak_rss_bytes();

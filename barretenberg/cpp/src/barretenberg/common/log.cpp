// Used for `vinfo` in log.hpp.
#include <cstdlib>
#include <string>

#ifndef __wasm__
bool verbose_logging = std::getenv("BB_VERBOSE") == nullptr ? false : std::string(std::getenv("BB_VERBOSE")) == "1";
#else
bool verbose_logging = true;
#endif

// Used for `debug` in log.hpp.
bool debug_logging = false;

// Used for `vinfo` in log.hpp.
#include <cstdlib>
#include <string>

#include "barretenberg/common/log.hpp"

#ifndef __wasm__
bool verbose_logging = std::getenv("BB_VERBOSE") == nullptr ? false : std::string(std::getenv("BB_VERBOSE")) == "1";
#else
bool verbose_logging = true;
#endif

// Used for `debug` in log.hpp.
bool debug_logging = false;

// Used for `log_function` in log.hpp. Defaults to `logstr`.
LogFunction log_function = [](LogLevel /*unused*/, const char* msg) { logstr(msg); };

void set_log_function(LogFunction new_log_function)
{
    log_function = std::move(new_log_function);
}

// Used for `vinfo` in log.hpp.
#include <cstdlib>
#include <string>

#include "barretenberg/common/log.hpp"

#ifndef __wasm__
// Default log level is INFO.
LogLevel bb_log_level = []() {
    const char* verbose_ptr = std::getenv("BB_VERBOSE");
    std::string verbose_str = verbose_ptr == nullptr ? "0" : std::string(verbose_ptr);
    return verbose_str == "1" ? LogLevel::VERBOSE : LogLevel::INFO;
}();
#else
LogLevel bb_log_level = LogLevel::VERBOSE;
#endif

// Used for `log_function` in log.hpp. Defaults to `logstr`.
LogFunction log_function = [](LogLevel /*unused*/, const std::string& msg) { logstr(msg.c_str()); };

void set_log_function(LogFunction new_log_function)
{
    log_function = std::move(new_log_function);
}

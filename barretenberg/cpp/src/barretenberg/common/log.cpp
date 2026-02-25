// Used for `vinfo` in log.hpp.
#include <cstdlib>
#include <string>

#include "barretenberg/common/log.hpp"

#ifndef __wasm__
// Default log level is INFO.
std::atomic<LogLevel> bb_log_level = []() {
    const char* verbose_ptr = std::getenv("BB_VERBOSE");
    std::string verbose_str = verbose_ptr == nullptr ? "0" : std::string(verbose_ptr);
    return verbose_str == "1" ? LogLevel::VERBOSE : LogLevel::INFO;
}();
#else
std::atomic<LogLevel> bb_log_level = LogLevel::VERBOSE;
#endif

// Default log function: forwards to logstr.
static const LogFunction default_log_function = [](LogLevel /*unused*/, const std::string& msg) {
    logstr(msg.c_str());
};

// Thread-local log function so each worker thread can have its own logger.
thread_local LogFunction tl_log_function = default_log_function;

LogFunction& get_log_function()
{
    return tl_log_function;
}

void set_log_function(LogFunction new_log_function)
{
    tl_log_function = std::move(new_log_function);
}

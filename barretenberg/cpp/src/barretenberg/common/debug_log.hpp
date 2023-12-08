#pragma once

/**
 * @details
 * To be used to create a verbose trace of execution. This helps with comparing runs that should have had the same
 * result, but don't. It is less useful for other kinds of correctness, but if we know what values we expect (or not) it
 * still can be useful.
 *
 * Compilation: cmake -DCMAKE_CXX_FLAGS="-DBBERG_DEBUG_LOG" ...
 * Then, compare outputs of the program with another run of the same program (it's good to remove sources of randomness,
 * if present). Once you have a divergence you can use the environment variable DEBUG_LOG_ABORT=... with a string
 * pattern to abort the program, stopping in a debugger.
 */

#ifdef BBERG_DEBUG_LOG

#include <iostream>
#include <sstream>
#include <string>
namespace barretenberg {
/**
 * Throws an std::runtime_error if we would print a log that includes the env variable DEBUG_LOG_ABORT.
 * This is primarily intended to be used with a debugger to then poke around execution and see differences in a
 * comparison log. Does nothing if DEBUG_LOG_ABORT is not set.
 * @param log_str The log string to be checked against the environment variable.
 */
void _debug_log_check_abort_condition(const std::string& log_str);

/**
 * Logs multiple values to standard output.
 *
 * @param args The values to be logged.
 */
template <typename... FuncArgs> void _debug_log(const char* func_name, const FuncArgs&... args)
{
    std::ostringstream ss;
    ss << func_name << " ";
    // Using fold expression to append args to stringstream
    ((ss << args << " "), ...);
    std::string log_str = ss.str();
    // Want to be able to catch offending statements in a debugger, this throws if we match an env variable pattern
    _debug_log_check_abort_condition(log_str);
    std::cout << log_str << std::endl;
}
} // namespace barretenberg
/**
 * Logs function parameters. This macro should be placed at the beginning of function
 * bodies to log their parameters.
 *
 * @param ... The parameters to be logged.
 */
#define DEBUG_LOG(...)                                                                                                 \
    if (!std::is_constant_evaluated()) {                                                                               \
        barretenberg::_debug_log(__FUNCTION__, __VA_ARGS__);                                                           \
    }

#else // If BBERG_DEBUG_LOG is not defined

// Define empty macros and functions
#define DEBUG_LOG(...)

#endif // BBERG_DEBUG_LOG

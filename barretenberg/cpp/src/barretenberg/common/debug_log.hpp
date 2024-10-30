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
 * comparison log. Prints the string if DEBUG_LOG_ABORT is not set.
 * Should be run with MULTITHREADING=OFF if DEBUG_LOG is used within parallel_for, and with as little non-determinism as
 * possible (the BBERG_DEBUG_LOG flag currently turns off some determinism).
 * @param log_str The log string to be checked against the environment variable.
 */
void _debug_log_impl(const std::string& log_str);

template <class T>
concept Printable = requires(T a) { std::cout << a; };
template <class T>
concept ContainerLike = requires(T a) {
    a.begin();
    a.size();
};

template <typename T> const char* _summarize(const T* /*unused*/)
{
    return "(?)";
}

template <Printable T> const T& _summarize(const T* x)
{
    return *x;
}

// fallback for non-printable containers
template <ContainerLike T>
std::string _summarize(const T* x)
    requires(!Printable<T>)
{
    std::ostringstream ss;
    if (x->size() == 0) {
        ss << "[]";
    } else {
        ss << "[" << _summarize(&*x->begin()) << "...]";
    }
    return ss.str();
}

/**
 * Logs multiple values to standard output.
 *
 * @param args The values to be logged.
 */
template <typename... FuncArgs> void _debug_log(const char* func_name, const char* arg_string, const FuncArgs&... args)
{
    // shut off recursive DEBUG_LOG
    static size_t debug_log_calls = 0;
    if (debug_log_calls > 0) {
        return;
    }
    debug_log_calls++;
    std::ostringstream ss;
    ss << func_name << " " << arg_string << " = ";
    // Using fold expression to append args to stringstream
    ((ss << _summarize(&args) << " "), ...);
    std::string log_str = ss.str();
    // Want to be able to catch offending statements in a debugger, this throws if we match an env variable pattern
    _debug_log_impl(log_str);
    debug_log_calls--;
}
} // namespace barretenberg
/**
 * Logs function parameters. This macro should be placed at the beginning of function
 * bodies to log their parameters.
 *
 * @param ... The parameters to be logged.
 */
#define DEBUG_LOG(...)                                                                                                 \
    if (!std::is_constant_evaluated()) { /*we are not in a compile-time constexpr*/                                    \
        barretenberg::_debug_log(__FUNCTION__, #__VA_ARGS__, __VA_ARGS__);                                             \
    }

#define DEBUG_LOG_ALL(container)                                                                                       \
    for (auto& x : (container)) {                                                                                      \
        barretenberg::_debug_log(__FUNCTION__, #container, x);                                                         \
    }

#else // If BBERG_DEBUG_LOG is not defined

// Define empty macros and functions
#define DEBUG_LOG(...)
#define DEBUG_LOG_ALL(container)

#endif // BBERG_DEBUG_LOG

#pragma once

#include <algorithm>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "barretenberg/env/logstr.hpp"

#define BENCHMARK_INFO_PREFIX "##BENCHMARK_INFO_PREFIX##"
#define BENCHMARK_INFO_SEPARATOR "#"
#define BENCHMARK_INFO_SUFFIX "##BENCHMARK_INFO_SUFFIX##"

#define BENCH_GATE_COUNT_START(builder, op_name)                                                                       \
    uint64_t __bench_before = builder.get_num_finalized_gates_inefficient();

#define BENCH_GATE_COUNT_END(builder, op_name)                                                                         \
    uint64_t __bench_after = builder.get_num_finalized_gates_inefficient();                                            \
    std::cerr << "num gates with " << op_name << " = " << __bench_after - __bench_before << std::endl;                 \
    benchmark_info(Builder::NAME_STRING, "Bigfield", op_name, "Gate Count", __bench_after - __bench_before);

template <typename... Args> std::string format(Args... args)
{
    std::ostringstream os;
    ((os << args), ...);
    return os.str();
}

template <typename T> void benchmark_format_chain(std::ostream& os, T const& first)
{
    // We will be saving these values to a CSV file, so we can't tolerate commas
    std::stringstream current_argument;
    current_argument << first;
    std::string current_argument_string = current_argument.str();
    std::ranges::replace(current_argument_string, ',', ';');
    os << current_argument_string << BENCHMARK_INFO_SUFFIX;
}

template <typename T, typename... Args>
void benchmark_format_chain(std::ostream& os, T const& first, Args const&... args)
{
    // We will be saving these values to a CSV file, so we can't tolerate commas
    std::stringstream current_argument;
    current_argument << first;
    std::string current_argument_string = current_argument.str();
    std::ranges::replace(current_argument_string, ',', ';');
    os << current_argument_string << BENCHMARK_INFO_SEPARATOR;
    benchmark_format_chain(os, args...);
}

template <typename... Args> std::string benchmark_format(Args... args)
{
    std::ostringstream os;
    os << BENCHMARK_INFO_PREFIX;
    benchmark_format_chain(os, args...);
    return os.str();
}

// Log levels from TS foundation/src/log/log-levels.ts:
// ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace']
// Map: 0=silent, 1=fatal, 2=error, 3=warn, 4=info, 5=verbose, 6=debug, 7=trace
enum class LogLevel : int {
    SILENT = 0, // Works ok as 0 assuming nothing logs as SILENT.
    FATAL = 1,
    ERROR = 2,
    WARN = 3,
    INFO = 4,
    VERBOSE = 5,
    DEBUG = 6,
    TRACE = 7,
};
extern LogLevel bb_log_level;

// This allows the logging sink to be customized. Useful for Typescript use-cases.
using LogFunction = std::function<void(LogLevel level, const std::string& msg)>;
extern LogFunction log_function;
void set_log_function(LogFunction new_log_function);

// This logs (using log_function) if the log level is enabled.
// NOTE: Evaluation of __VA_ARGS__ is lazy since it's inside the if statement.
#define log_(level, ...)                                                                                               \
    do {                                                                                                               \
        if (level <= bb_log_level) {                                                                                   \
            log_function(level, format(__VA_ARGS__));                                                                  \
        }                                                                                                              \
    } while (0)

#define log_fatal(...) log_(LogLevel::FATAL, __VA_ARGS__)
#define log_error(...) log_(LogLevel::ERROR, __VA_ARGS__)
#define log_warn(...) log_(LogLevel::WARN, __VA_ARGS__)
#define important(...) log_(LogLevel::WARN, "important: ", __VA_ARGS__)
#define info(...) log_(LogLevel::INFO, __VA_ARGS__)
#define vinfo(...) log_(LogLevel::VERBOSE, __VA_ARGS__)
#define log_verbose(...) log_(LogLevel::VERBOSE, __VA_ARGS__)

// The following logging levels are only compiled in debug mode (i.e., NDEBUG is not defined).
#ifndef NDEBUG
#define debug(...) log_(LogLevel::DEBUG, __VA_ARGS__)
#define log_trace(...) log_(LogLevel::TRACE, __VA_ARGS__)
#else
#define debug(...) (void)0
#define log_trace(...) (void)0
#endif

/**
 * @brief Info used to store circuit statistics during CI/CD with concrete structure. Writes straight to log
 *
 * @details Automatically appends the necessary prefix and suffix, as well as separators.
 *
 * @tparam Args
 * @param args
 */
#ifdef CI
template <typename Arg1, typename Arg2, typename Arg3, typename Arg4, typename Arg5>
inline void benchmark_info(Arg1 composer, Arg2 class_name, Arg3 operation, Arg4 metric, Arg5 value)
{
    logstr(benchmark_format(composer, class_name, operation, metric, value).c_str());
}
#else
template <typename... Args> inline void benchmark_info(Args... /*unused*/) {}
#endif

/**
 * @brief A class for saving benchmarks and printing them all at once in the end of the function.
 *
 */
class BenchmarkInfoCollator {

    std::vector<std::string> saved_benchmarks;

  public:
    BenchmarkInfoCollator() = default;
    BenchmarkInfoCollator(const BenchmarkInfoCollator& other) = default;
    BenchmarkInfoCollator(BenchmarkInfoCollator&& other) = default;
    BenchmarkInfoCollator& operator=(const BenchmarkInfoCollator& other) = default;
    BenchmarkInfoCollator& operator=(BenchmarkInfoCollator&& other) = default;

/**
 * @brief Info used to store circuit statistics during CI/CD with concrete structure. Stores string in vector for now
 * (used to flush all benchmarks at the end of test).
 *
 * @details Automatically appends the necessary prefix and suffix, as well as separators.
 *
 * @tparam Args
 * @param args
 */
#ifdef CI
    template <typename Arg1, typename Arg2, typename Arg3, typename Arg4, typename Arg5>
    inline void benchmark_info_deferred(Arg1 composer, Arg2 class_name, Arg3 operation, Arg4 metric, Arg5 value)
    {
        saved_benchmarks.push_back(benchmark_format(composer, class_name, operation, metric, value).c_str());
    }
#else
    explicit BenchmarkInfoCollator(std::vector<std::string> saved_benchmarks)
        : saved_benchmarks(std::move(saved_benchmarks))
    {}
    template <typename... Args> inline void benchmark_info_deferred(Args... /*unused*/) {}
#endif
    ~BenchmarkInfoCollator()
    {
        for (auto& x : saved_benchmarks) {
            logstr(x.c_str());
        }
    }
};

// integrates bb bench stats with google benchmark
#pragma once
#include <benchmark/benchmark.h>

#ifdef __wasm__
namespace bb {
struct GoogleBbBenchReporter {
    GoogleBbBenchReporter(::benchmark::State& state)
    {
        // unused, we don't have op counts on
        (void)state;
    }
};
}; // namespace bb
// require a semicolon to appease formatters
#define GOOGLE_BB_BENCH_REPORTER(state) (void)0
#define GOOGLE_BB_BENCH_REPORTER_CANCEL() (void)0
#else
#include "bb_bench.hpp"
namespace bb {
// NOLINTNEXTLINE(cppcoreguidelines-special-member-functions)
struct GoogleBbBenchReporter {
    // We allow having a ref member as this only lives inside a function frame
    ::benchmark::State& state;
    bool cancelled = false;
    GoogleBbBenchReporter(::benchmark::State& state)
        : state(state)
    {
        bb::detail::use_bb_bench = true;
        // Intent: Clear when we enter the state loop
        bb::detail::GLOBAL_BENCH_STATS.clear();
    }
    ~GoogleBbBenchReporter()
    {
        if (std::getenv("BB_BENCH") != nullptr) {
            bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cerr);
        }
        // Allow for conditional reporting
        if (cancelled) {
            return;
        }
        // Intent: Collect results when we exit the state loop
        for (auto& [key, parent_map] : bb::detail::GLOBAL_BENCH_STATS.aggregate()) {
            for (auto& entry : parent_map) {
                state.counters[std::string(key) + "(s)"] += static_cast<double>(entry.second.time);
                state.counters[std::string(key)] += static_cast<double>(entry.second.count);
            }
        }
    }
};
// Allow for integration with google benchmark user-defined counters
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define GOOGLE_BB_BENCH_REPORTER(state) bb::GoogleBbBenchReporter __GOOGLE_BB_BENCH_REPORTER{ state };
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define GOOGLE_BB_BENCH_REPORTER_CANCEL() __GOOGLE_BB_BENCH_REPORTER.cancelled = true;
}; // namespace bb
#endif

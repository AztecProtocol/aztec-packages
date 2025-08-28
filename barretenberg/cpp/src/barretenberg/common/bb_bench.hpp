
#pragma once

#include <memory>
#include <ostream>
#include <tracy/Tracy.hpp>

/**
 * Provides an abstraction that counts operations based on function names.
 * For efficiency, we spread out counts across threads.
 */

#include "barretenberg/common/compiler_hints.hpp"
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
namespace bb::detail {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool use_bb_bench;

// Compile-time string
// See e.g. https://www.reddit.com/r/cpp_questions/comments/pumi9r/does_c20_not_support_string_literals_as_template/
template <std::size_t N> struct OperationLabel {
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    constexpr OperationLabel(const char (&str)[N])
    {
        for (std::size_t i = 0; i < N; ++i) {
            value[i] = str[i];
        }
    }

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    char value[N];
};

struct TimeStats;

// Contains all statically known op counts
struct GlobalBenchStatsContainer {
  public:
    struct Entry {
        std::string key;
        std::string thread_id;
        std::shared_ptr<TimeStats> count;
    };
    ~GlobalBenchStatsContainer();
    static inline thread_local TimeStats* parent = nullptr;
    std::mutex mutex;
    std::vector<Entry> counts;
    void print() const;
    // NOTE: Should be called when other threads aren't active
    void clear();
    void add_entry(const char* key, const std::shared_ptr<TimeStats>& count);
    std::map<std::string, std::size_t> get_aggregate_counts() const;
    void print_aggregate_counts(std::ostream&, size_t) const;
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

// Tracks operation statistics and links them to their immediate parent context.
// Each stat is associated only with its direct parent, not the full call hierarchy.
// This allows measuring the direct contribution of nested operations to their parent,
// but doesn't provide recursive parent-child relationships through the entire call stack.
struct TimeStats {
    TimeStats* parent = nullptr;
    std::size_t count = 0;
    std::size_t time = 0;
    // Used if the parent changes from last call - chains to handle multiple parent contexts
    std::unique_ptr<TimeStats> next;

    void track(std::size_t time_val)
    {
        TimeStats* current_parent = GlobalBenchStatsContainer::parent;
        // Try to track with current stats if parent matches
        // Check if 'next' already handles this parent to avoid creating duplicates
        if (raw_track(current_parent, time_val) || (next && next->raw_track(current_parent, time_val))) {
            return;
        }
        // Create new TimeStats at the front of this linked list.
        auto new_next = std::make_unique<TimeStats>(parent, count, time);
        new_next = std::move(next);
        next = std::move(new_next);

        // Reset this node.
        parent = current_parent;
        count = 1;
        time = time_val;
    }

  private:
    // Returns true if successfully tracked (parent matches), false otherwise
    bool raw_track(TimeStats* expected_parent, std::size_t time_val)
    {
        if (parent != expected_parent) {
            return false;
        }
        count++;
        time += time_val;
        return true;
    }
};

template <OperationLabel Op> struct GlobalBenchStats {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static inline thread_local std::shared_ptr<TimeStats> stats;

    static TimeStats* ensure_stats()
    {
        if (bb::detail::use_bb_bench) {
        }
        if (BB_UNLIKELY(stats == nullptr)) {
            stats = std::make_shared<TimeStats>();
            GLOBAL_BENCH_STATS.add_entry(Op.value, stats);
        }
        return stats.get();
    }
    static constexpr void add_clock_time(std::size_t time)
    {
        if (std::is_constant_evaluated()) {
            // We do nothing if the compiler tries to run this
            return;
        }
        ensure_stats();
        stats->time += time;
    }
};

// NOLINTNEXTLINE(cppcoreguidelines-special-member-functions)
struct BenchReporter {
    TimeStats* stats;
    std::size_t time;
    BenchReporter(TimeStats* stats);
    ~BenchReporter();
};
} // namespace bb::detail

// Define macros. we use void(0) for empty ones as we want these to be statements that need a semicolon.
#ifdef TRACY_INSTRUMENTED
#define BB_TRACY() ZoneScopedN(__func__)
#define BB_TRACY_NAME(name) ZoneScopedN(name)
#define BB_BENCH_TRACY() ZoneScopedN(__func__)
#define BB_BENCH_TRACY_NAME(name) ZoneScopedN(name)
#define BB_BENCH_NAME(name) (void)0
#define BB_BENCH_ENABLE_NESTING() (void)0
#define BB_BENCH() (void)0
#elif defined __wasm__
#define BB_TRACY() (void)0
#define BB_TRACY_NAME(name) (void)0
#define BB_BENCH_TRACY() (void)0
#define BB_BENCH_TRACY_NAME(name) (void)0
#define BB_BENCH_NAME(name) (void)0
#define BB_BENCH_ENABLE_NESTING() (void)0
#define BB_BENCH() (void)0
#else
#define BB_TRACY() (void)0
#define BB_TRACY_NAME(name) (void)0
#define BB_BENCH_TRACY() BB_BENCH_NAME(__func__)
#define BB_BENCH_TRACY_NAME(name) BB_BENCH_NAME(name)
#define BB_BENCH_NAME(name)                                                                                            \
    bb::detail::BenchReporter __bb_op_count_time(bb::detail::GlobalBenchStats<name>::ensure_stats())
#define BB_BENCH_ENABLE_NESTING() if (bb::detail::use_bb_bench)
#define BB_BENCH() BB_BENCH_NAME(__func__)
#endif

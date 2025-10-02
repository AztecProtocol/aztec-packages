
#pragma once

#include "barretenberg/common/compiler_hints.hpp"
#include <iostream>
#include <map>
#include <memory>
#include <ostream>
#include <string_view>
#include <tracy/Tracy.hpp>
#include <unordered_map>
#include <vector>

/**
 * Provides an abstraction that counts operations based on function names.
 * For efficiency, we spread out counts across threads.
 */

namespace bb::detail {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool use_bb_bench;

// Compile-time string
// See e.g. https://www.reddit.com/r/cpp_questions/comments/pumi9r/does_c20_not_support_string_literals_as_template/
template <std::size_t N> struct OperationLabel {
    constexpr static std::size_t size() { return N; }
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

template <OperationLabel op1, OperationLabel op2> constexpr auto concat()
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    char result_cstr[op1.size() + op2.size() - 1] = {};
    std::copy(op1.value, op1.value + op1.size() - 1, result_cstr);
    std::copy(op2.value, op2.value + op2.size(), result_cstr + op1.size() - 1);
    return OperationLabel{ result_cstr };
}
struct TimeStats;
struct TimeStatsEntry;
using OperationKey = std::string_view;

struct TimeAndCount {
    uint64_t time = 0;
    uint64_t count = 0;
};

// Normalized benchmark entry - each represents a unique (function, parent) pair
struct AggregateEntry {
    // For convenience, even though redundant with map store
    OperationKey key;
    OperationKey parent;
    std::size_t time = 0;
    std::size_t count = 0;
    size_t num_threads = 0;
    double time_mean = 0;
    std::size_t time_max = 0;
    double time_stddev = 0;

    // Welford's algorithm state
    double time_m2 = 0; // sum of squared differences from mean

    void add_thread_time_sample(const TimeAndCount& stats);
    double get_std_dev() const;
};

// AggregateData: Result of normalizing benchmark data
// entries: Key -> ParentKey -> Entry
// Empty string is used as key if the entry has no parent.
using AggregateData = std::unordered_map<OperationKey, std::map<OperationKey, AggregateEntry>>;

// Contains all statically known op counts
struct GlobalBenchStatsContainer {
  public:
    static inline thread_local TimeStatsEntry* parent = nullptr;
    ~GlobalBenchStatsContainer();
    std::mutex mutex;
    std::vector<std::shared_ptr<TimeStatsEntry>> entries;
    void print() const;
    // NOTE: Should be called when other threads aren't active
    void clear();
    void add_entry(const char* key, const std::shared_ptr<TimeStatsEntry>& entry);
    void print_stats_recursive(const OperationKey& key, const TimeStats* stats, const std::string& indent) const;
    void print_aggregate_counts(std::ostream&, size_t) const;
    void print_aggregate_counts_hierarchical(std::ostream&) const;

    // Normalize the raw benchmark data into a clean structure for display
    AggregateData aggregate() const;
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

// Tracks operation statistics and links them to their immediate parent context.
// Each stat is associated only with its direct parent, not the full call hierarchy.
// This allows measuring the direct contribution of nested operations to their parent,
// but doesn't provide recursive parent-child relationships through the entire call stack.
struct TimeStats {
    TimeStatsEntry* parent = nullptr;
    std::size_t count = 0;
    std::size_t time = 0;
    // Used if the parent changes from last call - chains to handle multiple parent contexts
    std::unique_ptr<TimeStats> next;

    TimeStats() = default;
    TimeStats(TimeStatsEntry* parent_ptr, std::size_t count_val, std::size_t time_val)
        : parent(parent_ptr)
        , count(count_val)
        , time(time_val)
    {}

    void track(TimeStatsEntry* current_parent, std::size_t time_val)
    {
        // Try to track with current stats if parent matches
        // Check if 'next' already handles this parent to avoid creating duplicates
        if (raw_track(current_parent, time_val) || (next && next->raw_track(current_parent, time_val))) {
            return;
        }
        // Create new TimeStats at the front of this linked list.
        auto new_next = std::make_unique<TimeStats>(parent, count, time);
        new_next->next = std::move(next);
        next = std::move(new_next);

        // Reset this node.
        parent = current_parent;
        count = 1;
        time = time_val;
    }

  private:
    // Returns true if successfully tracked (parent matches), false otherwise
    bool raw_track(TimeStatsEntry* expected_parent, std::size_t time_val)
    {
        if (parent != expected_parent) {
            return false;
        }
        count++;
        time += time_val;
        return true;
    }
};

// Each key will appear at most once *per thread*.
// Each thread has its own count for thread-safety.
struct TimeStatsEntry {
    OperationKey key;
    TimeStats count;
};

// The stat entry associated with a certain label AND a certain thread.
// These will later be aggregated, and the TimeStats itself contains stat
// entries for each caller context change (for later summarization).
template <OperationLabel Op> struct ThreadBenchStats {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static inline thread_local std::shared_ptr<TimeStatsEntry> stats;

    static void init_entry(TimeStatsEntry& entry);
    // returns null if use_bb_bench not enabled
    static std::shared_ptr<TimeStatsEntry> ensure_stats()
    {
        if (bb::detail::use_bb_bench && BB_UNLIKELY(stats == nullptr)) {
            stats = std::make_shared<TimeStatsEntry>();
            GLOBAL_BENCH_STATS.add_entry(Op.value, stats);
        }
        return stats;
    }
};

// NOLINTNEXTLINE(cppcoreguidelines-special-member-functions)
// no-op if passed null stats
struct BenchReporter {
    TimeStatsEntry* parent;
    TimeStatsEntry* stats;
    std::size_t time;
    BenchReporter(TimeStatsEntry* entry);
    ~BenchReporter();
};
} // namespace bb::detail

// Define macros. we use void(0) for empty ones as we want these to be statements that need a semicolon.
#ifdef TRACY_INSTRUMENTED
#define BB_TRACY() ZoneScopedN(__func__)
#define BB_TRACY_NAME(name) ZoneScopedN(name)
#define BB_BENCH_TRACY() ZoneScopedN(__func__)
#define BB_BENCH_TRACY_NAME(name) ZoneScopedN(name)
#define BB_BENCH_ONLY_NAME(name) (void)0
#define BB_BENCH_ENABLE_NESTING() (void)0
#define BB_BENCH_ONLY() (void)0
#elif defined __wasm__
#define BB_TRACY() (void)0
#define BB_TRACY_NAME(name) (void)0
#define BB_BENCH_TRACY() (void)0
#define BB_BENCH_TRACY_NAME(name) (void)0
#define BB_BENCH_ONLY_NAME(name) (void)0
#define BB_BENCH_ENABLE_NESTING() (void)0
#define BB_BENCH_ONLY() (void)0
#else
#define BB_TRACY() (void)0
#define BB_TRACY_NAME(name) (void)0
#define BB_BENCH_TRACY() BB_BENCH_ONLY_NAME(__func__)
#define BB_BENCH_TRACY_NAME(name) BB_BENCH_ONLY_NAME(name)
#define BB_BENCH_ONLY_NAME(name)                                                                                       \
    bb::detail::BenchReporter _bb_bench_reporter((bb::detail::ThreadBenchStats<name>::ensure_stats().get()))
#define BB_BENCH_ENABLE_NESTING()                                                                                      \
    if (_bb_bench_reporter.stats)                                                                                      \
    bb::detail::GlobalBenchStatsContainer::parent = _bb_bench_reporter.stats
#define BB_BENCH_ONLY() BB_BENCH_ONLY_NAME(__func__)
#endif
#define BB_BENCH_NAME(name)                                                                                            \
    BB_BENCH_TRACY_NAME(name);                                                                                         \
    BB_BENCH_ENABLE_NESTING()

#define BB_BENCH()                                                                                                     \
    BB_BENCH_TRACY();                                                                                                  \
    BB_BENCH_ENABLE_NESTING()

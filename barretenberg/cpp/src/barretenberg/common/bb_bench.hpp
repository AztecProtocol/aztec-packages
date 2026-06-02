
#pragma once

#include "barretenberg/common/compiler_hints.hpp"
#include <atomic>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
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
// When true, BenchReporter pushes a {name, parent, ts, dur, tid} record into a per-thread
// event buffer on every scope exit, for Chrome Trace Event / Perfetto-style output.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<bool> capture_per_call_events;

// Record-time nesting-depth cap for per-call event capture. A scope is recorded only when its
// nesting depth (1 == outermost BB_BENCH scope on the thread) is <= this cap. Keeps a phase-level
// trace bounded in both volume and overhead on a many-thread prover by dropping the deep
// per-op leaves (field arithmetic, Execution::add, …) at record time rather than post-filtering.
// 0xff (default) keeps every depth. Set via bb_set_bench_trace_max_depth.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<uint8_t> bench_trace_max_depth;

// Set a comma-separated deny-list of leaf op names that are never recorded even when within the
// depth cap — for a hot shallow op the cap alone doesn't exclude. Empty clears it.
void set_bench_trace_denylist(std::string_view names_csv);
// True if `name` is on the deny-list.
bool bench_trace_name_denied(std::string_view name) noexcept;

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
    uint64_t time = 0;
    uint64_t count = 0;
    size_t num_threads = 0;
    double time_mean = 0;
    uint64_t time_max = 0;
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

// A single scope entry/exit pair — captured only when capture_per_call_events is true.
// name and parent are stable string_views into OperationLabel static storage or entry->key.
struct PerCallEvent {
    OperationKey name;
    OperationKey parent;
    uint64_t ts_ns;  // start wall-clock nanoseconds
    uint64_t dur_ns; // end - start
    uint64_t tid;    // hashed thread id
    uint32_t depth;  // nesting depth at record time (1 == outermost scope on the thread)
};

// Per-thread event buffer. Owned by the global container so serialized traces can safely
// include events from worker threads that have already exited.
struct ThreadEventBuffer {
    uint64_t tid = 0;
    std::vector<PerCallEvent> events;
};

// Access the current thread's event buffer, registering it on first touch.
ThreadEventBuffer& get_thread_event_buffer();

// Contains all statically known op counts
struct GlobalBenchStatsContainer {
  public:
    static inline thread_local TimeStatsEntry* parent = nullptr;
    ~GlobalBenchStatsContainer();
    std::mutex mutex;
    std::vector<std::shared_ptr<TimeStatsEntry>> entries;
    // Protects thread_event_buffers. Separate from `mutex` so serializers can iterate
    // thread buffers without contending with active threads registering new TimeStatsEntries.
    std::mutex event_mutex;
    std::vector<std::unique_ptr<ThreadEventBuffer>> thread_event_buffers;
    void print() const;
    // NOTE: Should be called when other threads aren't active
    void clear();
    void add_entry(const char* key, const std::shared_ptr<TimeStatsEntry>& entry);
    ThreadEventBuffer& register_thread_event_buffer(uint64_t tid);
    void print_stats_recursive(const OperationKey& key, const TimeStats* stats, const std::string& indent) const;
    void print_aggregate_counts(std::ostream&, size_t) const;
    void print_aggregate_counts_hierarchical(std::ostream&) const;
    void serialize_aggregate_data_json(std::ostream&) const;
    // Chrome Trace Event Format output for Perfetto / chrome://tracing.
    // serialize_trace_events_json emits every captured per-call event (requires
    // capture_per_call_events to have been true during the run).
    void serialize_trace_events_json(std::ostream&) const;
    // Synthesizes Chrome Trace Event entries from the aggregate stats — one "X" event per
    // (name, parent, thread_slot) laid out in DFS order. Lossy about individual call timing
    // but tiny and works even without per-call capture.
    void serialize_aggregate_trace_json(std::ostream&) const;

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
    uint64_t count = 0;
    uint64_t time = 0;
    // Used if the parent changes from last call - chains to handle multiple parent contexts
    std::unique_ptr<TimeStats> next;

    TimeStats() = default;
    TimeStats(TimeStatsEntry* parent_ptr, uint64_t count_val, uint64_t time_val)
        : parent(parent_ptr)
        , count(count_val)
        , time(time_val)
    {}

    void track(TimeStatsEntry* current_parent, uint64_t time_val)
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
    bool raw_track(TimeStatsEntry* expected_parent, uint64_t time_val)
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
    static std::shared_ptr<TimeStatsEntry>& get_stats()
    {
        // Workaround for GCC 13 bug with thread_local static inline members in templates
        static thread_local std::shared_ptr<TimeStatsEntry> stats;
        return stats;
    }

    static void init_entry(TimeStatsEntry& entry);
    // returns null if use_bb_bench not enabled
    static std::shared_ptr<TimeStatsEntry> ensure_stats()
    {
        auto& stats = get_stats();
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
    uint64_t time;
    uint32_t depth; // this scope's nesting depth, snapshotted in the ctor (0 if not recording)
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
#elif defined __wasm__ && !defined ENABLE_WASM_BENCH
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

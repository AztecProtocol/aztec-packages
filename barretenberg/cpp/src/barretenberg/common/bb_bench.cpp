#include "barretenberg/common/assert.hpp"
#include <cstdint>
#include <sys/types.h>
#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "bb_bench.hpp"
#include <algorithm>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <ostream>
#include <set>
#include <sstream>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace {
// ANSI color codes
struct Colors {
    static constexpr const char* WHITE = "\033[37m";
    static constexpr const char* RESET = "\033[0m";
    static constexpr const char* BOLD = "\033[1m";
    static constexpr const char* CYAN = "\033[36m";
    static constexpr const char* GREEN = "\033[32m";
    static constexpr const char* YELLOW = "\033[33m";
    static constexpr const char* MAGENTA = "\033[35m";
    static constexpr const char* DIM = "\033[2m";
    static constexpr const char* RED = "\033[31m";
};

// Format time value with appropriate unit
std::string format_time(double time_ms)
{
    std::ostringstream oss;
    if (time_ms >= 1000.0) {
        oss << std::fixed << std::setprecision(2) << (time_ms / 1000.0) << " s";
    } else if (time_ms >= 1.0 && time_ms < 1000.0) {
        oss << std::fixed << std::setprecision(2) << time_ms << " ms";
    } else {
        oss << std::fixed << std::setprecision(1) << (time_ms * 1000.0) << " μs";
    }
    return oss.str();
}

// Format time with fixed width for alignment
std::string format_time_aligned(double time_ms)
{
    std::ostringstream oss;
    if (time_ms >= 1000.0) {
        std::ostringstream time_oss;
        time_oss << std::fixed << std::setprecision(2) << (time_ms / 1000.0) << "s";
        oss << std::left << std::setw(10) << time_oss.str();
    } else {
        std::ostringstream time_oss;
        time_oss << std::fixed << std::setprecision(1) << time_ms << "ms";
        oss << std::left << std::setw(10) << time_oss.str();
    }
    return oss.str();
}

// Helper to format percentage value
std::string format_percentage_value(double percentage, const char* color)
{
    std::ostringstream oss;
    oss << color << " " << std::left << std::fixed << std::setprecision(1) << std::setw(5) << percentage << "%"
        << Colors::RESET;
    return oss.str();
}

// Helper to format percentage with color based on percentage value
std::string format_percentage(double value, double total, double min_threshold = 0.0)
{
    double percentage = (total <= 0) ? 0.0 : (value / total) * 100.0;
    if (total <= 0 || percentage < min_threshold) {
        return "       ";
    }

    // Choose color based on percentage value (like time colors)
    const char* color = Colors::CYAN; // Default color

    return format_percentage_value(percentage, color);
}

// Helper to format percentage section
std::string format_percentage_section(double time_ms, double parent_time, size_t indent_level)
{
    if (parent_time > 0 && indent_level > 0) {
        return format_percentage(time_ms * 1000000.0, parent_time);
    }
    return "       ";
}

// Helper to format time section
std::string format_time_section(double time_ms)
{
    std::ostringstream oss;
    oss << "   ";
    if (time_ms >= 100.0 && time_ms < 1000.0) {
        oss << Colors::DIM << format_time_aligned(time_ms) << Colors::RESET;
    } else {
        oss << format_time_aligned(time_ms);
    }
    return oss.str();
}

// Helper to format call stats
std::string format_call_stats(double time_ms, uint64_t count)
{
    if (!(time_ms >= 100.0 && count > 1)) {
        return "";
    }
    double avg_ms = time_ms / static_cast<double>(count);
    std::ostringstream oss;
    oss << Colors::DIM << " (" << format_time(avg_ms) << " x " << count << ")" << Colors::RESET;
    return oss.str();
}

std::string format_aligned_section(double time_ms, double parent_time, uint64_t count, size_t indent_level)
{
    std::ostringstream oss;

    // Add indent level indicator at the beginning with different color
    oss << Colors::MAGENTA << "[" << indent_level << "] " << Colors::RESET;

    // Format percentage FIRST
    oss << format_percentage_section(time_ms, parent_time, indent_level);

    // Format time AFTER percentage with appropriate color (with more spacing)
    oss << format_time_section(time_ms);

    // Format calls/threads info - only show for >= 100ms, make it DIM
    oss << format_call_stats(time_ms, count);

    return oss.str();
}

// Get color based on time threshold
struct TimeColor {
    const char* name_color;
    const char* time_color;
};

TimeColor get_time_colors(double time_ms)
{
    if (time_ms >= 1000.0) {
        return { Colors::BOLD, Colors::WHITE };
    }
    if (time_ms >= 100.0) {
        return { Colors::YELLOW, Colors::YELLOW };
    }
    return { Colors::DIM, Colors::DIM };
}

// Print separator line
void print_separator(std::ostream& os, bool thick = true)
{
    const char* line = thick ? "═══════════════════════════════════════════════════════════════════════════════════════"
                               "═════════════════════"
                             : "───────────────────────────────────────────────────────────────────────────────────────"
                               "─────────────────────";
    os << Colors::BOLD << Colors::CYAN << line << Colors::RESET << "\n";
}
} // anonymous namespace

namespace bb::detail {

// use_bb_bench is also set by --print_bench and --bench_out flags
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_bb_bench = std::getenv("BB_BENCH") == nullptr ? false : std::string(std::getenv("BB_BENCH")) == "1";
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> capture_per_call_events{ false };
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<uint8_t> bench_trace_max_depth{ []() -> uint8_t {
    const char* e = std::getenv("BB_BENCH_TRACE_MAX_DEPTH");
    if (e == nullptr) {
        return 0xff;
    }
    const int v = std::atoi(e);
    return (v <= 0 || v > 255) ? static_cast<uint8_t>(0xff) : static_cast<uint8_t>(v);
}() };
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
using OperationKey = std::string_view;

namespace {
// Per-thread nesting depth of BB_BENCH scopes that are being recorded (stats != nullptr). Plain
// thread_local so the increment/decrement in BenchReporter is lock-free and never serializes the
// prover across its worker threads. 1 == outermost scope on this thread.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
thread_local uint32_t g_bench_depth = 0;

// Deny-list of leaf op names excluded from per-call capture regardless of depth. The deny-list is
// optional (usually empty) and is populated once before a trace run, so the hot dtor path stays
// lock-free in the common case: `g_bench_trace_denylist_active` is a single relaxed atomic load,
// and the mutex is only taken when a non-empty list has actually been set.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> g_bench_trace_denylist_active{ false };
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::unordered_set<std::string> g_bench_trace_denylist;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::mutex g_bench_trace_denylist_mutex;
} // namespace

void set_bench_trace_denylist(std::string_view names_csv)
{
    std::unique_lock<std::mutex> lock(g_bench_trace_denylist_mutex);
    g_bench_trace_denylist.clear();
    size_t start = 0;
    while (start <= names_csv.size()) {
        size_t comma = names_csv.find(',', start);
        size_t end = (comma == std::string_view::npos) ? names_csv.size() : comma;
        std::string_view tok = names_csv.substr(start, end - start);
        if (!tok.empty()) {
            g_bench_trace_denylist.emplace(tok);
        }
        if (comma == std::string_view::npos) {
            break;
        }
        start = comma + 1;
    }
    g_bench_trace_denylist_active.store(!g_bench_trace_denylist.empty(), std::memory_order_relaxed);
}

bool bench_trace_name_denied(std::string_view name) noexcept
{
    if (!g_bench_trace_denylist_active.load(std::memory_order_relaxed)) {
        return false;
    }
    std::unique_lock<std::mutex> lock(g_bench_trace_denylist_mutex);
    return g_bench_trace_denylist.find(std::string(name)) != g_bench_trace_denylist.end();
}

void AggregateEntry::add_thread_time_sample(const TimeAndCount& stats)
{
    if (stats.count == 0) {
        return;
    }
    // Account for aggregate time and count
    time += stats.time;
    count += stats.count;
    time_max = std::max(stats.time, time_max);
    // Use Welford's method to be able to track the variance
    num_threads++;
    double delta = static_cast<double>(stats.time) - time_mean;
    time_mean += delta / static_cast<double>(num_threads);
    double delta2 = static_cast<double>(stats.time) - time_mean;
    time_m2 += delta * delta2;
}

double AggregateEntry::get_std_dev() const
{
    // Calculate standard deviation
    if (num_threads > 1) {
        return std::sqrt(time_m2 / static_cast<double>(num_threads - 1));
    }
    return 0;
}

// Normalize the raw benchmark data into a clean structure for display
AggregateData GlobalBenchStatsContainer::aggregate() const
{
    AggregateData result;

    // Each count has a unique [thread, key] combo.
    // We therefore treat each count as a thread's contribution to that key.
    for (const std::shared_ptr<TimeStatsEntry>& entry : entries) {
        // A map from parent key => AggregateEntry
        auto& entry_map = result[entry->key];
        // combine all entries with same parent key
        std::map<OperationKey, TimeAndCount> parent_key_to_stats;

        // For collection-time performance, we allow multiple stat blocks with the same parent. It'd be simpler to have
        // one but we just have to combine them here.
        for (const TimeStats* stats = &entry->count; stats != nullptr; stats = stats->next.get()) {
            OperationKey parent_key = stats->parent != nullptr ? stats->parent->key : "";
            parent_key_to_stats[parent_key].count += stats->count;
            parent_key_to_stats[parent_key].time += stats->time;
        }

        for (auto [parent_key, stats] : parent_key_to_stats) {
            auto& normalized_entry = entry_map[parent_key];
            normalized_entry.key = entry->key;
            normalized_entry.parent = parent_key;
            normalized_entry.add_thread_time_sample(stats);
        }
    }

    return result;
}

GlobalBenchStatsContainer::~GlobalBenchStatsContainer()
{
    if (std::getenv("BB_BENCH") != nullptr) {
        print_aggregate_counts_hierarchical(std::cerr);
    }
}

void GlobalBenchStatsContainer::add_entry(const char* key, const std::shared_ptr<TimeStatsEntry>& entry)
{
    std::unique_lock<std::mutex> lock(mutex);
    entry->key = key;
    entries.push_back(entry);
}

ThreadEventBuffer& GlobalBenchStatsContainer::register_thread_event_buffer(uint64_t tid)
{
    std::unique_lock<std::mutex> lock(event_mutex);
    auto buf = std::make_unique<ThreadEventBuffer>();
    buf->tid = tid;
    // Reserve up front: avoids reallocation churn when a worker thread emits
    // tens of thousands of events over a full Chonk prove.
    buf->events.reserve(1U << 14U);
    ThreadEventBuffer& result = *buf;
    thread_event_buffers.push_back(std::move(buf));
    return result;
}

ThreadEventBuffer& get_thread_event_buffer()
{
    static thread_local ThreadEventBuffer* tl_buf = nullptr;
    if (tl_buf == nullptr) {
        const uint64_t tid = static_cast<uint64_t>(std::hash<std::thread::id>{}(std::this_thread::get_id()));
        tl_buf = &GLOBAL_BENCH_STATS.register_thread_event_buffer(tid);
    }
    return *tl_buf;
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "GlobalBenchStatsContainer::print() START"
              << "\n";
    for (const std::shared_ptr<TimeStatsEntry>& entry : entries) {
        print_stats_recursive(entry->key, &entry->count, "");
    }
    std::cout << "GlobalBenchStatsContainer::print() END"
              << "\n";
}

void GlobalBenchStatsContainer::print_stats_recursive(const OperationKey& key,
                                                      const TimeStats* stats,
                                                      const std::string& indent) const
{
    if (stats->count > 0) {
        std::cout << indent << key << "\t" << stats->count << "\n";
    }
    if (stats->time > 0) {
        std::cout << indent << key << "(t)\t" << static_cast<double>(stats->time) / 1000000.0 << "ms\n";
    }

    if (stats->next != nullptr) {
        print_stats_recursive(key, stats->next.get(), indent + "  ");
    }
}

void GlobalBenchStatsContainer::print_aggregate_counts(std::ostream& os, size_t indent) const
{
    os << '{';
    bool first = true;
    for (const auto& [key, entry_map] : aggregate()) {
        // Loop for a flattened view
        uint64_t time = 0;
        for (auto& [parent_key, entry] : entry_map) {
            time += entry.time_max;
        }

        if (!first) {
            os << ',';
        }
        if (indent > 0) {
            os << "\n" << std::string(indent, ' ');
        }
        os << '"' << key << "\":" << time;
        first = false;
    }
    if (indent > 0) {
        os << "\n";
    }
    os << '}' << "\n";
}

// Serializable structure for a single benchmark entry (msgpack-compatible)
struct SerializableEntry {
    std::string parent;
    uint64_t time;
    uint64_t time_max;
    double time_mean;
    double time_stddev;
    uint64_t count;
    uint64_t num_threads;

    SERIALIZATION_FIELDS(parent, time, time_max, time_mean, time_stddev, count, num_threads);
};

void GlobalBenchStatsContainer::serialize_aggregate_data_json(std::ostream& os) const
{
    AggregateData data = aggregate();

    // Convert AggregateData to a msgpack-serializable map
    std::map<std::string, std::vector<SerializableEntry>> serializable_data;

    for (const auto& [key, parent_map] : data) {
        std::vector<SerializableEntry> entries;

        for (const auto& [parent_key, entry] : parent_map) {
            // Skip _root entries that have zero time (never called at root level)
            if (parent_key.empty() && entry.time == 0) {
                continue;
            }

            entries.push_back(SerializableEntry{ .parent = parent_key.empty() ? "_root" : std::string(parent_key),
                                                 .time = entry.time,
                                                 .time_max = entry.time_max,
                                                 .time_mean = entry.time_mean,
                                                 .time_stddev = entry.get_std_dev(),
                                                 .count = entry.count,
                                                 .num_threads = entry.num_threads });
        }

        // Only add functions that have non-empty entries
        if (!entries.empty()) {
            serializable_data[std::string(key)] = entries;
        }
    }

    // Use msgpack to serialize and convert to JSON
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, serializable_data);
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    os << oh.get() << std::endl;
}

namespace {
// Emit a single Chrome Trace Event Format "X" (complete) event.
// ts/dur are in microseconds (the Chrome Trace convention), with 3 digits after the
// decimal so we don't lose nanosecond precision.
void emit_x_event(std::ostream& os,
                  OperationKey name,
                  OperationKey parent,
                  double ts_us,
                  double dur_us,
                  uint64_t tid,
                  uint32_t depth,
                  bool& first)
{
    if (!first) {
        os << ',';
    }
    first = false;
    os << "\n    {";
    os << "\"name\":\"" << name << "\"";
    os << ",\"cat\":\"bb\"";
    os << ",\"ph\":\"X\"";
    os << ",\"pid\":0";
    os << ",\"tid\":" << tid;
    os << ",\"ts\":" << std::fixed << std::setprecision(3) << ts_us;
    os << ",\"dur\":" << std::fixed << std::setprecision(3) << dur_us;
    const bool has_parent = !parent.empty() && parent != "_root";
    if (has_parent || depth > 0) {
        os << ",\"args\":{";
        if (has_parent) {
            os << "\"parent\":\"" << parent << "\"";
        }
        if (depth > 0) {
            if (has_parent) {
                os << ',';
            }
            os << "\"depth\":" << depth;
        }
        os << "}";
    }
    os << "}";
}
} // namespace

void GlobalBenchStatsContainer::serialize_trace_events_json(std::ostream& os) const
{
    std::unique_lock<std::mutex> lock(const_cast<std::mutex&>(event_mutex));

    // Find the earliest start across all threads so the timeline begins at ts=0 —
    // absolute ns-since-epoch values are huge and make Perfetto's axis awkward.
    uint64_t min_ts = UINT64_MAX;
    for (const auto& buf : thread_event_buffers) {
        for (const PerCallEvent& e : buf->events) {
            if (e.ts_ns < min_ts) {
                min_ts = e.ts_ns;
            }
        }
    }
    if (min_ts == UINT64_MAX) {
        min_ts = 0;
    }

    // `min_ts_ns` is the un-rebased wall-clock ns of the first recorded event. The browser
    // alignment fit (host_ms = a + b·(min_ts_ns + ts·1000)/1e6) needs this to map the rebased
    // per-event `ts` (µs from min_ts) back onto the absolute C++ clock before fitting it to the
    // main-thread performance.now() domain.
    os << "{\n  \"displayTimeUnit\":\"us\",\n  \"min_ts_ns\":" << min_ts << ",\n  \"traceEvents\":[";
    bool first = true;

    // Remap each thread's raw pthread-hash tid to a small integer. Native
    // std::hash<thread::id> returns values > 2^32 (pthread stack addresses),
    // which Perfetto's Chrome-trace loader can collapse onto a single track.
    // Small integer tids avoid that and also match the WASM trace style.
    std::unordered_map<uint64_t, uint64_t> tid_remap;
    uint64_t main_raw_tid = UINT64_MAX;
    uint64_t main_start = UINT64_MAX;
    for (const auto& buf : thread_event_buffers) {
        if (!buf->events.empty() && buf->events.front().ts_ns < main_start) {
            main_start = buf->events.front().ts_ns;
            main_raw_tid = buf->tid;
        }
    }
    // Main gets tid=1 (sorted first). Workers get 2..N.
    tid_remap[main_raw_tid] = 1;
    uint64_t next_worker_tid = 2;
    for (const auto& buf : thread_event_buffers) {
        if (buf->tid == main_raw_tid) {
            continue;
        }
        tid_remap[buf->tid] = next_worker_tid++;
    }

    if (!first) {
        os << ',';
    }
    first = false;
    os << "\n    {\"name\":\"process_name\",\"ph\":\"M\",\"pid\":0,\"tid\":0,\"args\":{\"name\":\"bb\"}}";
    for (const auto& buf : thread_event_buffers) {
        uint64_t small_tid = tid_remap[buf->tid];
        std::string label = (buf->tid == main_raw_tid) ? "main" : ("worker-" + std::to_string(small_tid - 1));
        os << ",\n    {\"name\":\"thread_name\",\"ph\":\"M\",\"pid\":0,\"tid\":" << small_tid
           << ",\"args\":{\"name\":\"" << label << "\"}}";
        os << ",\n    {\"name\":\"thread_sort_index\",\"ph\":\"M\",\"pid\":0,\"tid\":" << small_tid
           << ",\"args\":{\"sort_index\":" << small_tid << "}}";
    }

    for (const auto& buf : thread_event_buffers) {
        for (const PerCallEvent& e : buf->events) {
            double ts_us = static_cast<double>(e.ts_ns - min_ts) / 1000.0;
            double dur_us = static_cast<double>(e.dur_ns) / 1000.0;
            emit_x_event(os, e.name, e.parent, ts_us, dur_us, tid_remap[e.tid], e.depth, first);
        }
    }
    os << "\n  ]\n}\n";
}

void GlobalBenchStatsContainer::serialize_aggregate_trace_json(std::ostream& os) const
{
    AggregateData data = aggregate();

    os << "{\n  \"displayTimeUnit\":\"us\",\n  \"traceEvents\":[";
    bool first = true;

    // Map each (key, parent) aggregate entry to a synthesized ph:"X" block. We DFS from
    // roots (empty parent), assigning ts sequentially so children are contained within
    // their parent's [ts, ts+dur] range — that makes Chrome/Perfetto nest them visually.
    // Using tid=0 across the whole synthesized trace; per-thread layout would double-count
    // time since aggregates already sum across threads.
    std::function<void(OperationKey, OperationKey, uint64_t)> emit_tree;
    emit_tree = [&](OperationKey key, OperationKey parent_key, uint64_t ts_start_ns) -> void {
        auto it = data.find(key);
        if (it == data.end()) {
            return;
        }
        const AggregateEntry* self = nullptr;
        for (const auto& [p, entry] : it->second) {
            if (p == parent_key) {
                self = &entry;
                break;
            }
        }
        if (self == nullptr || self->time_max == 0) {
            return;
        }

        emit_x_event(os,
                     key,
                     parent_key.empty() ? OperationKey{ "_root" } : parent_key,
                     static_cast<double>(ts_start_ns) / 1000.0,
                     static_cast<double>(self->time_max) / 1000.0,
                     /*tid=*/0,
                     /*depth=*/0,
                     first);

        // Collect children: any entry whose parent_map contains `key`.
        std::vector<std::pair<OperationKey, uint64_t>> children;
        for (const auto& [child_key, pmap] : data) {
            auto cit = pmap.find(key);
            if (cit != pmap.end() && cit->second.time_max > 0) {
                children.emplace_back(child_key, cit->second.time_max);
            }
        }
        // Largest children first so big blocks are visually dominant.
        std::sort(children.begin(), children.end(), [](const auto& a, const auto& b) { return a.second > b.second; });

        uint64_t child_offset = 0;
        for (const auto& [child_key, child_dur] : children) {
            emit_tree(child_key, key, ts_start_ns + child_offset);
            child_offset += child_dur;
        }
    };

    // Roots: any key that has an empty-parent aggregate entry with non-zero time.
    std::vector<std::pair<OperationKey, uint64_t>> roots;
    for (const auto& [key, pmap] : data) {
        auto pit = pmap.find("");
        if (pit != pmap.end() && pit->second.time_max > 0) {
            roots.emplace_back(key, pit->second.time_max);
        }
    }
    std::sort(roots.begin(), roots.end(), [](const auto& a, const auto& b) { return a.second > b.second; });

    uint64_t root_offset = 0;
    for (const auto& [root_key, root_dur] : roots) {
        emit_tree(root_key, /*parent_key=*/OperationKey{ "" }, root_offset);
        root_offset += root_dur;
    }

    os << "\n  ]\n}\n";
}

void GlobalBenchStatsContainer::print_aggregate_counts_hierarchical(std::ostream& os) const
{
    AggregateData aggregated = aggregate();

    if (aggregated.empty()) {
        os << "No benchmark data collected\n";
        return;
    }

    // Print header
    os << "\n";
    print_separator(os, true);
    os << Colors::BOLD << "  Benchmark Results" << Colors::RESET << "\n";
    print_separator(os, true);

    std::map<OperationKey, std::set<OperationKey>> keys_to_parents;
    std::set<OperationKey> printed_in_detail;
    for (auto& [key, entry_map] : aggregated) {
        for (auto& [parent_key, entry] : entry_map) {
            if (entry.count > 0) {
                keys_to_parents[key].insert(parent_key);
            }
        }
    }

    // Helper function to print a stat line with tree drawing
    auto print_entry = [&](const AggregateEntry& entry, size_t indent_level, bool is_last, uint64_t parent_time) {
        std::string indent(indent_level * 2, ' ');
        std::string prefix = (indent_level == 0) ? "" : (is_last ? "└─ " : "├─ ");

        // Use exactly 80 characters for function name without indent
        const size_t name_width = 80;
        std::string display_name = std::string(entry.key);
        if (display_name.length() > name_width) {
            display_name = display_name.substr(0, name_width - 3) + "...";
        }

        double time_ms = static_cast<double>(entry.time_max) / 1000000.0;
        auto colors = get_time_colors(time_ms);

        // Print indent + prefix + name (exactly 80 chars) + time/percentage/calls
        os << indent << prefix << colors.name_color;
        if (time_ms >= 1000.0 && colors.name_color == Colors::BOLD) {
            os << Colors::YELLOW; // Special case: bold yellow for >= 1s
        }
        os << std::left << std::setw(static_cast<int>(name_width)) << display_name << Colors::RESET;

        // Print time if available with aligned section including indent level
        if (entry.time_max > 0) {
            if (time_ms < 100.0) {
                // Minimal format for <100ms: only [level] and percentage, no time display
                std::ostringstream minimal_oss;
                minimal_oss << Colors::MAGENTA << "[" << indent_level << "] " << Colors::RESET;
                minimal_oss << format_percentage_section(time_ms, static_cast<double>(parent_time), indent_level);
                minimal_oss << "   " << std::setw(10) << ""; // Add spacing to replace where time would be
                os << "  " << colors.time_color << std::setw(40) << std::left << minimal_oss.str() << Colors::RESET;
            } else {
                std::string aligned_section =
                    format_aligned_section(time_ms, static_cast<double>(parent_time), entry.count, indent_level);
                os << "  " << colors.time_color << std::setw(40) << std::left << aligned_section << Colors::RESET;
                if (entry.num_threads > 1) {
                    double mean_ms = entry.time_mean / 1000000.0;
                    double stddev_percentage = floor(entry.get_std_dev() * 100 / entry.time_mean);
                    os << "  " << entry.num_threads << " threads " << mean_ms << "ms average " << stddev_percentage
                       << "% stddev";
                }
            }
        }

        os << "\n";
    };

    // Recursive function to print hierarchy
    std::function<void(OperationKey, size_t, bool, uint64_t, OperationKey)> print_hierarchy;
    print_hierarchy = [&](OperationKey key,
                          size_t indent_level,
                          bool is_last,
                          uint64_t parent_time,
                          OperationKey current_parent) -> void {
        auto it = aggregated.find(key);
        if (it == aggregated.end()) {
            return;
        }

        // Find the entry with the specific parent context
        const AggregateEntry* entry_to_print = nullptr;
        for (const auto& [parent_key, entry] : it->second) {
            if ((indent_level == 0 && parent_key.empty()) || (indent_level > 0 && parent_key == current_parent)) {
                entry_to_print = &entry;
                break;
            }
        }

        if (!entry_to_print) {
            return;
        }

        // Print this entry
        print_entry(*entry_to_print, indent_level, is_last, parent_time);

        // Find and print children - operations that have this key as parent (only those with meaningful time >= 0.5ms)
        std::vector<OperationKey> children;
        if (!printed_in_detail.contains(key)) {
            for (const auto& [child_key, parent_map] : aggregated) {
                for (const auto& [parent_key, entry] : parent_map) {
                    if (parent_key == key && entry.time_max >= 500000) { // 0.5ms in nanoseconds
                        children.push_back(child_key);
                        break;
                    }
                }
            }
            printed_in_detail.insert(key);
        }

        // Sort children by their time in THIS parent context
        std::ranges::sort(children, [&](OperationKey a, OperationKey b) {
            uint64_t time_a = 0;
            uint64_t time_b = 0;
            if (auto it = aggregated.find(a); it != aggregated.end()) {
                for (const auto& [parent_key, entry] : it->second) {
                    if (parent_key == key) {
                        time_a = entry.time_max;
                        break;
                    }
                }
            }
            if (auto it = aggregated.find(b); it != aggregated.end()) {
                for (const auto& [parent_key, entry] : it->second) {
                    if (parent_key == key) {
                        time_b = entry.time_max;
                        break;
                    }
                }
            }
            return time_a > time_b;
        });

        // Calculate time spent in children and add "(other)" if >5% unaccounted
        uint64_t children_total_time = 0;
        for (const auto& child_key : children) {
            if (auto it = aggregated.find(child_key); it != aggregated.end()) {
                for (const auto& [parent_key, entry] : it->second) {
                    if (parent_key == key && entry.time_max >= 500000) { // 0.5ms in nanoseconds
                        children_total_time += entry.time_max;
                    }
                }
            }
        }
        uint64_t parent_total_time = entry_to_print->time_max;
        bool should_add_other = false;
        if (!children.empty() && parent_total_time > 0 && children_total_time < parent_total_time) {
            uint64_t unaccounted = parent_total_time - children_total_time;
            double percentage = (static_cast<double>(unaccounted) / static_cast<double>(parent_total_time)) * 100.0;
            should_add_other = percentage > 5.0 && unaccounted > 0;
        }
        uint64_t other_time = should_add_other ? (parent_total_time - children_total_time) : 0;

        if (!children.empty() && keys_to_parents[key].size() > 1) {
            os << std::string(indent_level * 2, ' ') << "  ├─ NOTE: Shared children. Can add up to > 100%.\n";
        }

        // Print children
        for (size_t i = 0; i < children.size(); ++i) {
            bool is_last_child = (i == children.size() - 1) && !should_add_other;
            print_hierarchy(children[i], indent_level + 1, is_last_child, entry_to_print->time, key);
        }

        // Print "(other)" category if significant unaccounted time exists
        if (should_add_other && keys_to_parents[key].size() <= 1) {
            AggregateEntry other_entry;
            other_entry.key = "(other)";
            other_entry.time = other_time;
            other_entry.time_max = other_time;
            other_entry.count = 1;
            other_entry.num_threads = 1;
            print_entry(other_entry, indent_level + 1, true, parent_total_time); // always last
        }
    };

    // Find root entries (those that ONLY have empty parent key and significant time)
    std::vector<OperationKey> roots;
    for (const auto& [key, parent_map] : aggregated) {
        auto empty_parent_it = parent_map.find("");
        if (empty_parent_it != parent_map.end() && empty_parent_it->second.time > 0) {
            roots.push_back(key);
        }
    }

    // Sort roots by time (descending)
    std::ranges::sort(roots, [&](OperationKey a, OperationKey b) {
        uint64_t time_a = 0;
        uint64_t time_b = 0;
        if (auto it_a = aggregated.find(a); it_a != aggregated.end()) {
            if (auto parent_it = it_a->second.find(""); parent_it != it_a->second.end()) {
                time_a = parent_it->second.time_max;
            }
        }
        if (auto it_b = aggregated.find(b); it_b != aggregated.end()) {
            if (auto parent_it = it_b->second.find(""); parent_it != it_b->second.end()) {
                time_b = parent_it->second.time_max;
            }
        }
        return time_a > time_b;
    });

    // Print hierarchies starting from roots
    for (size_t i = 0; i < roots.size(); ++i) {
        print_hierarchy(roots[i], 0, i == roots.size() - 1, 0, "");
    }

    // Print summary
    print_separator(os, false);

    // Calculate totals from root entries
    std::set<OperationKey> unique_funcs;
    for (const auto& [key, _] : aggregated) {
        unique_funcs.insert(key);
    }
    size_t unique_functions_count = unique_funcs.size();

    uint64_t shared_count = 0;
    for (const auto& [key, parents] : keys_to_parents) {
        if (parents.size() > 1) {
            shared_count++;
        }
    }

    uint64_t total_time = 0;
    for (const auto& [_, parent_map] : aggregated) {
        if (auto it = parent_map.find(""); it != parent_map.end()) {
            total_time = std::max(total_time, it->second.time_max);
        }
    }

    uint64_t total_calls = 0;
    for (const auto& [_, parent_map] : aggregated) {
        for (const auto& [__, entry] : parent_map) {
            total_calls += entry.count;
        }
    }

    double total_time_ms = static_cast<double>(total_time) / 1000000.0;

    os << "  " << Colors::BOLD << "Total: " << Colors::RESET << Colors::MAGENTA << unique_functions_count
       << " functions" << Colors::RESET;
    if (shared_count > 0) {
        os << " (" << Colors::RED << shared_count << " shared" << Colors::RESET << ")";
    }
    os << ", " << Colors::GREEN << total_calls << " measurements" << Colors::RESET << ", " << Colors::YELLOW;
    if (total_time_ms >= 1000.0) {
        os << std::fixed << std::setprecision(2) << (total_time_ms / 1000.0) << " seconds";
    } else {
        os << std::fixed << std::setprecision(2) << total_time_ms << " ms";
    }
    os << Colors::RESET;

    os << "\n";
    print_separator(os, true);
    os << "\n";
}

void GlobalBenchStatsContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (std::shared_ptr<TimeStatsEntry>& entry : entries) {
        entry->count = TimeStats();
    }
    std::unique_lock<std::mutex> event_lock(event_mutex);
    for (const auto& buf : thread_event_buffers) {
        buf->events.clear();
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

BenchReporter::BenchReporter(TimeStatsEntry* entry)
    : parent(nullptr)
    , stats(entry)
    , time(0)
    , depth(0)
{
    if (stats == nullptr) {
        return;
    }
    // Track the current parent context
    parent = GlobalBenchStatsContainer::parent;
    // Snapshot this scope's nesting depth (1 == outermost recorded scope on this thread). Plain
    // thread_local increment — lock-free, so it never serializes the prover's worker threads.
    depth = ++g_bench_depth;
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    time = static_cast<uint64_t>(now_ns.time_since_epoch().count());
}
BenchReporter::~BenchReporter()
{
    if (stats == nullptr) {
        return;
    }
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    uint64_t end_ns = static_cast<uint64_t>(now_ns.time_since_epoch().count());
    // Add, taking advantage of our parent context
    stats->count.track(parent, end_ns - time);

    // Per-call event capture for Chrome Trace Event / Perfetto output. Only active when
    // --trace_out_perfetto / bb_set_bench_trace was set; otherwise a single relaxed atomic load on
    // the hot path. Restricted at RECORD time to phase-level granularity: a scope is kept only when
    // its nesting depth is within the cap and its op name isn't on the deny-list. This drops the
    // per-op leaves (field arithmetic, Execution::*, …) before they ever hit the buffer, keeping
    // both volume and overhead bounded on a many-thread prove.
    if (capture_per_call_events.load(std::memory_order_relaxed) &&
        depth <= bench_trace_max_depth.load(std::memory_order_relaxed) && !bench_trace_name_denied(stats->key)) {
        ThreadEventBuffer& buf = get_thread_event_buffer();
        buf.events.push_back(PerCallEvent{
            /*name=*/stats->key,
            /*parent=*/parent != nullptr ? parent->key : OperationKey{ "_root" },
            /*ts_ns=*/time,
            /*dur_ns=*/end_ns - time,
            /*tid=*/buf.tid,
            /*depth=*/depth,
        });
    }

    // Pop this scope from the thread-local depth counter (paired with the ctor's increment).
    if (g_bench_depth > 0) {
        --g_bench_depth;
    }

    // Unwind to previous parent
    GlobalBenchStatsContainer::parent = parent;
}
} // namespace bb::detail

// WASM exports that drive the browser-side phase-level trace. Mirror the native CLI's
// --trace_out_perfetto data flow: enable per-call capture, bound it to phase granularity with a
// depth cap, sample the bench clock for host↔C++ alignment, and dump the Chrome-trace JSON after a
// prove. Wired through bb.js exactly like bb_set_msm_distribution_mode.

// Turn per-call event capture on/off. Also flips use_bb_bench so the BB_BENCH macros actually
// allocate their per-thread stats (without it, ensure_stats() returns null and nothing records).
// MUST be called before the prove starts so every worker thread sees use_bb_bench == true on its
// first BB_BENCH scope; the globals live in shared WASM memory so one call covers all threads.
WASM_EXPORT void bb_set_bench_trace(uint8_t on)
{
    bb::detail::use_bb_bench = on != 0;
    bb::detail::capture_per_call_events.store(on != 0, std::memory_order_relaxed);
}

// Set the record-time nesting-depth cap (1 == outermost scope). Calibrated so the prove-stage tree
// (ChonkAPI::prove → Chonk::accumulate* → {…Prover}::* → CommitmentKey::batch_commit →
// BatchMultiScalarMul) is kept while the per-op leaves are dropped. 0xff keeps everything.
WASM_EXPORT void bb_set_bench_trace_max_depth(uint8_t d)
{
    bb::detail::bench_trace_max_depth.store(d, std::memory_order_relaxed);
}

// Set a comma-separated deny-list of leaf op names that are never recorded even within the depth
// cap (a null pointer or empty string clears it).
WASM_EXPORT void bb_set_bench_trace_denylist(const char* names_csv)
{
    bb::detail::set_bench_trace_denylist(names_csv == nullptr ? std::string_view{} : std::string_view{ names_csv });
}

// Read the same clock BB_BENCH events are stamped with (high_resolution_clock → the WASI
// clock_time_get import, i.e. Date.now()·1e6), written as a little-endian u64 ns to `out`. The
// browser pairs this with performance.now() to fit C++ ns → main-thread ms.
WASM_EXPORT void bb_bench_clock_ns(uint64_t* out)
{
    const auto now = std::chrono::high_resolution_clock::now();
    const auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    *out = static_cast<uint64_t>(now_ns.time_since_epoch().count());
}

// Serialize all captured per-call events to Chrome Trace Event JSON (with the `min_ts_ns` header
// and per-event `args.depth`) into a length-prefixed heap buffer for the JS side to read back.
WASM_EXPORT void bb_dump_bench_trace_json(uint8_t** out)
{
    std::ostringstream oss;
    bb::detail::GLOBAL_BENCH_STATS.serialize_trace_events_json(oss);
    const std::string s = oss.str();
    *out = to_heap_buffer(std::vector<uint8_t>(s.begin(), s.end()));
}
#endif

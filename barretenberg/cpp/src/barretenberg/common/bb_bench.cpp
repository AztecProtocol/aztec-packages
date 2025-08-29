#include "barretenberg/common/assert.hpp"
#include <cstdint>
#include <sys/types.h>
#ifndef __wasm__
#include "bb_bench.hpp"
#include <algorithm>
#include <cassert>
#include <chrono>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <ostream>
#include <set>
#include <sstream>
#include <thread>
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
    } else if (time_ms >= 1.0) {
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
        // Format seconds: "16.43s    " left aligned in 10 char field
        std::string time_str =
            (std::ostringstream{} << std::fixed << std::setprecision(2) << (time_ms / 1000.0) << "s").str();
        oss << std::left << std::setw(10) << time_str;
    } else {
        // Format milliseconds: "443.0ms  " left aligned in 10 char field (no color here, applied outside)
        std::string time_str = (std::ostringstream{} << std::fixed << std::setprecision(1) << time_ms << "ms").str();
        oss << std::left << std::setw(10) << time_str;
    }
    return oss.str();
}

// Helper to format percentage with color based on percentage value
std::string format_percentage(double value, double total, double min_threshold = 0.1)
{
    if (total <= 0) {
        return "       ";
    }
    double percentage = (value / total) * 100.0;
    if (percentage < min_threshold) {
        return "       ";
    }

    // Choose color based on percentage value (like time colors)
    const char* color = Colors::CYAN; // Default color

    std::ostringstream oss;
    oss << color << " " << std::left << std::fixed << std::setprecision(1) << std::setw(5) << percentage << "%"
        << Colors::RESET;
    return oss.str();
}

std::string format_aligned_section(double time_ms,
                                   double parent_time,
                                   uint64_t count,
                                   size_t indent_level,
                                   size_t num_threads = 1,
                                   double mean_ms = 0.0)
{
    std::ostringstream oss;

    // Add indent level indicator at the beginning with different color
    oss << Colors::MAGENTA << "[" << indent_level << "] " << Colors::RESET;

    // Format time with appropriate color
    if (time_ms >= 100.0 && time_ms < 1000.0) {
        oss << Colors::DIM << format_time_aligned(time_ms) << Colors::RESET;
    } else {
        oss << format_time_aligned(time_ms);
    }

    // Format percentage using the existing function
    if (parent_time > 0 && indent_level > 0) {
        oss << format_percentage(time_ms * 1000000.0, parent_time);
    } else {
        oss << "       "; // Keep alignment for root entries
    }

    // Format calls/threads info - only show if >= 100ms, only show thread info if num_threads > 1, make it DIM
    if (time_ms >= 100.0) {
        if (num_threads > 1) {
            oss << Colors::DIM << " (" << std::fixed << std::setprecision(2) << mean_ms << " ms x " << num_threads
                << ")" << Colors::RESET;
        } else if (count > 1) {
            double avg_ms = time_ms / static_cast<double>(count);
            oss << Colors::DIM << " (" << format_time(avg_ms) << " x " << count << ")" << Colors::RESET;
        }
    }

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
        return { Colors::BOLD, Colors::WHITE }; // Bold white for >= 1 second
    }
    if (time_ms >= 100.0) {
        return { Colors::YELLOW, Colors::YELLOW }; // Yellow for >= 100ms
    }
    return { Colors::DIM, Colors::DIM }; // Dim for < 100ms
}

// Print separator line
void print_separator(std::ostream& os, bool thick = true)
{
    const char* line = thick ? "═══════════════════════════════════════════════════════════════════════════════════════"
                               "═════════════════════"
                             : "───────────────────────────────────────────────────────────────────────────--------────"
                               "─────────────────────";
    os << Colors::BOLD << Colors::CYAN << line << Colors::RESET << "\n";
}
} // anonymous namespace

namespace bb::detail {

// use_bb_bench is also set by --print_bench and --bench_out flags
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_bb_bench = std::getenv("BB_BENCH") == nullptr ? false : std::string(std::getenv("BB_BENCH")) == "1";
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool debug_bench = std::getenv("BB_BENCH_DEBUG") != nullptr;
using OperationKey = std::string_view;

void AggregateEntry::add_thread_time_sample(const TimeAndCount& stats)
{
    if (stats.count == 0) {
        return;
    }
    // Account for aggregate time and count
    time += stats.time;
    count += stats.count;
    // Use Welford's method to be able to track the variance
    double time_ms = static_cast<double>(stats.time / stats.count) / 1000000.0;
    num_threads++;
    double delta = time_ms - time_mean;
    time_mean += delta / static_cast<double>(num_threads);
    double delta2 = time_ms - time_mean;
    time_m2 += delta * delta2;
}

double AggregateEntry::get_std_dev() const
{
    // Calculate standard deviation
    if (num_threads > 1) {
        return std::sqrt(time_m2 / static_cast<double>(num_threads - 1));
    } else {
        return 0;
    }
}

// Normalize the raw benchmark data into a clean structure for display
AggregateData aggregate(const std::vector<TimeStatsEntry*>& counts)
{
    AggregateData result;

    // Each count has a unique [thread, key] combo.
    // We therefore treat each count as a thread's contribution to that key.
    for (const TimeStatsEntry* entry : counts) {
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

void GlobalBenchStatsContainer::add_entry(const char* key, TimeStatsEntry* entry)
{
    std::unique_lock<std::mutex> lock(mutex);
    entry->key = key;
    entries.push_back(entry);
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "print_op_counts() START" << "\n";
    for (const TimeStatsEntry* entry : entries) {
        print_stats_recursive(entry->key, &entry->count, "");
    }
    std::cout << "print_op_counts() END" << "\n";
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
    for (const auto& [key, entry_map] : aggregate(entries)) {
        // Loop for a flattened view
        uint64_t time = 0;
        for (auto& [parent_key, entry] : entry_map) {
            time += entry.time;
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

void GlobalBenchStatsContainer::print_aggregate_counts_hierarchical(std::ostream& os) const
{
    AggregateData aggregated = aggregate(entries);

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
        std::string prefix;
        if (indent_level > 0) {
            prefix = is_last ? "└─ " : "├─ ";
        }

        // Use exactly 80 characters for function name without indent
        const size_t name_width = 80;
        std::string display_name = std::string(entry.key);
        if (display_name.length() > name_width) {
            display_name = display_name.substr(0, name_width - 3) + "...";
        }

        double time_ms = static_cast<double>(entry.time) / 1000000.0;
        auto colors = get_time_colors(time_ms);

        // Print indent + prefix + name (exactly 80 chars) + time/percentage/calls
        os << indent << prefix << colors.name_color;
        if (time_ms >= 1000.0 && colors.name_color == Colors::BOLD) {
            os << Colors::YELLOW; // Special case: bold yellow for >= 1s
        }
        os << std::left << std::setw(static_cast<int>(name_width)) << display_name << Colors::RESET;

        // Print time if available with aligned section including indent level
        if (entry.time > 0) {
            double mean_ms = entry.num_threads > 1 ? entry.time_mean / 1000000.0 : 0.0;
            std::string aligned_section = format_aligned_section(
                time_ms, static_cast<double>(parent_time), entry.count, indent_level, entry.num_threads, mean_ms);
            os << "  " << colors.time_color << std::setw(40) << std::left << aligned_section << Colors::RESET;
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
                    if (parent_key == key && entry.time >= 500000) { // 0.5ms in nanoseconds
                        children.push_back(child_key);
                        break;
                    }
                }
            }
            printed_in_detail.insert(key);
        }

        // Sort children by time (use total time across all parents)
        std::ranges::sort(children, [&](OperationKey a, OperationKey b) {
            uint64_t time_a = 0;
            uint64_t time_b = 0;
            if (auto it = aggregated.find(a); it != aggregated.end()) {
                for (const auto& [_, entry] : it->second) {
                    time_a += entry.time;
                }
            }
            if (auto it = aggregated.find(b); it != aggregated.end()) {
                for (const auto& [_, entry] : it->second) {
                    time_b += entry.time;
                }
            }
            return time_a > time_b;
        });

        // Calculate time spent in children and add "(other)" if >5% unaccounted
        uint64_t children_total_time = 0;
        for (const auto& child_key : children) {
            if (auto it = aggregated.find(child_key); it != aggregated.end()) {
                // Sum time for this child across all parent contexts where parent matches current key
                for (const auto& [parent_key, entry] : it->second) {
                    if (parent_key == key && entry.time >= 500000) { // 0.5ms in nanoseconds
                        children_total_time += entry.time;
                    }
                }
            }
        }

        // Check if there's significant unaccounted time (>5%) and we have children
        uint64_t parent_total_time = entry_to_print->time;
        bool should_add_other = false;
        uint64_t other_time = 0;
        if (!children.empty() && parent_total_time > 0 && children_total_time < parent_total_time) {
            other_time = parent_total_time - children_total_time;
            double other_percentage =
                (static_cast<double>(other_time) / static_cast<double>(parent_total_time)) * 100.0;
            should_add_other = other_percentage > 5.0 && other_time > 0;
        }

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
            // Create fake AggregateEntry for (other)
            AggregateEntry other_entry;
            other_entry.key = "(other)";
            other_entry.time = other_time;
            other_entry.count = 1;
            other_entry.num_threads = 1;

            print_entry(other_entry, indent_level + 1, true, parent_total_time); // always last
        }
    };

    // Find root entries (those that ONLY have empty parent key and significant time)
    std::vector<OperationKey> roots;
    for (const auto& [key, parent_map] : aggregated) {
        // Check if this operation has an empty parent key entry with significant time
        if (auto empty_parent_it = parent_map.find(""); empty_parent_it != parent_map.end()) {
            if (empty_parent_it->second.time > 0) {
                roots.push_back(key);
            }
        }
    }

    // Sort roots by time
    std::ranges::sort(roots, [&](OperationKey a, OperationKey b) {
        uint64_t time_a = 0;
        uint64_t time_b = 0;
        if (auto it = aggregated.find(a); it != aggregated.end()) {
            if (auto parent_it = it->second.find(""); parent_it != it->second.end()) {
                time_a = parent_it->second.time;
            }
        }
        if (auto it = aggregated.find(b); it != aggregated.end()) {
            if (auto parent_it = it->second.find(""); parent_it != it->second.end()) {
                time_b = parent_it->second.time;
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
    uint64_t total_time = 0;
    uint64_t total_calls = 0;
    std::set<OperationKey> unique_functions;
    uint64_t shared_count = 0;

    for (auto& [key, parent_map] : aggregated) {
        unique_functions.insert(key);

        // Count as shared if has multiple parents
        if (keys_to_parents[key].size() > 1) {
            shared_count++;
        }
        auto& root_entry = parent_map[""];
        total_time += root_entry.time;
        // Sum ALL calls
        for (auto& entry : parent_map) {
            total_calls += entry.second.count;
        }
    }

    double total_time_ms = static_cast<double>(total_time) / 1000000.0;

    os << "  " << Colors::BOLD << "Total: " << Colors::RESET << Colors::MAGENTA << unique_functions.size()
       << " functions" << Colors::RESET;
    if (shared_count > 0) {
        os << " (" << Colors::RED << shared_count << " shared" << Colors::RESET << ")";
    }
    os << ", " << Colors::GREEN << total_calls << " measurements" << Colors::RESET << ", ";

    if (total_time_ms >= 1000.0) {
        os << Colors::YELLOW << std::fixed << std::setprecision(2) << (total_time_ms / 1000.0) << " seconds"
           << Colors::RESET;
    } else {
        os << Colors::YELLOW << std::fixed << std::setprecision(2) << total_time_ms << " ms" << Colors::RESET;
    }

    os << "\n";
    print_separator(os, true);
    os << "\n";
}

void GlobalBenchStatsContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (TimeStatsEntry* entry : entries) {
        entry->count = TimeStats();
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

BenchReporter::BenchReporter(TimeStatsEntry* entry)
    : parent(nullptr)
    , stats(entry)
    , time(0)
{
    if (stats == nullptr) {
        return;
    }
    // Track the current parent context
    parent = GlobalBenchStatsContainer::parent;
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
    // Add, taking advantage of our parent context
    stats->count.track(parent, static_cast<uint64_t>(now_ns.time_since_epoch().count()) - time);

    // Unwind to previous parent
    GlobalBenchStatsContainer::parent = parent;
}
} // namespace bb::detail
#endif

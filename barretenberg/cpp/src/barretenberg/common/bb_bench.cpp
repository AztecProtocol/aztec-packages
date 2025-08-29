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
        oss << std::fixed << std::setprecision(2) << std::setw(8) << (time_ms / 1000.0) << " s";
    } else {
        oss << std::fixed << std::setprecision(1) << std::setw(8) << time_ms << " ms";
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
    oss << color << " " << std::fixed << std::setprecision(1) << std::setw(5) << percentage << "%" << Colors::RESET;
    return oss.str();
}

// Print average time if count > 1
std::string format_average(double time_ms, uint64_t count)
{
    if (count <= 1) {
        return "";
    }
    double avg_ms = time_ms / static_cast<double>(count);
    std::ostringstream oss;
    oss << Colors::DIM << " (" << format_time(avg_ms) << " x " << count << ")" << Colors::RESET;
    return oss.str();
}

// Print separator line
void print_separator(std::ostream& os, bool thick = true)
{
    const char* line = thick ? "═══════════════════════════════════════════════════════════════════════════════════════"
                               "═════════════════════"
                             : "───────────────────────────────────────────────────────────────────────────────"
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

        // Format name with level-specific alignment - each level aligns with peers at same level
        size_t base_width = 80;                               // Base width for root level
        size_t level_width = base_width - (indent_level * 2); // Reduce width per level for visual clarity
        std::string display_name = std::string(entry.key);
        if (display_name.length() > level_width) {
            display_name = display_name.substr(0, level_width - 3) + "...";
        }

        double time_ms = static_cast<double>(entry.time) / 1000000.0;
        auto colors = get_time_colors(time_ms);

        // Print name with appropriate color
        os << indent << prefix << colors.name_color;
        if (time_ms >= 1000.0 && colors.name_color == Colors::BOLD) {
            os << Colors::YELLOW; // Special case: bold yellow for >= 1s
        }
        os << std::left << std::setw(static_cast<int>(level_width)) << display_name << Colors::RESET;

        // Print time if available
        if (entry.time > 0) {
            os << "  " << colors.time_color << format_time_aligned(time_ms) << Colors::RESET;

            // Show percentage relative to parent (or none for roots)
            if (indent_level == 0 || parent_time == 0) {
                // Root entries or entries without valid parent time don't show percentage
                os << "       "; // Keep alignment (7 chars to match percentage format)
            } else {
                os << format_percentage(static_cast<double>(entry.time), static_cast<double>(parent_time));
            }

            // Show average per call if multiple calls
            os << format_average(time_ms, entry.count);
        }

        os << "\n";
    };

    // Recursive function to print hierarchy
    std::function<void(OperationKey, size_t, std::set<OperationKey>&, bool, uint64_t)> print_hierarchy;
    print_hierarchy = [&](OperationKey key,
                          size_t indent_level,
                          std::set<OperationKey>& visited,
                          bool is_last,
                          uint64_t parent_time) -> void {
        if (visited.contains(key)) {
            return;
        }
        visited.insert(key);

        auto it = aggregated.find(key);
        if (it == aggregated.end()) {
            return;
        }

        // Find the entry with empty parent (root) or specific parent
        const AggregateEntry* entry_to_print = nullptr;
        for (const auto& [parent_key, entry] : it->second) {
            if ((indent_level == 0 && parent_key.empty()) || (indent_level > 0 && !parent_key.empty())) {
                entry_to_print = &entry;
                break;
            }
        }

        if (!entry_to_print) {
            return;
        }

        // Print this entry
        print_entry(*entry_to_print, indent_level, is_last, parent_time);

        // Find and print children - operations that have this key as parent
        std::vector<OperationKey> children;
        if (!printed_in_detail.contains(key)) {
            for (const auto& [child_key, parent_map] : aggregated) {
                for (const auto& [parent_key, entry] : parent_map) {
                    if (parent_key == key) {
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

        if (!children.empty() && keys_to_parents[key].size() > 1) {
            os << std::string(indent_level * 2, ' ') << "NOTE: Shared children. Will add up to > 100%.\n";
        }

        // Print children
        for (size_t i = 0; i < children.size(); ++i) {
            print_hierarchy(children[i], indent_level + 1, visited, i == children.size() - 1, entry_to_print->time);
        }
    };

    // Find root entries (those with empty parent key)
    std::vector<OperationKey> roots;
    for (const auto& [key, parent_map] : aggregated) {
        for (const auto& [parent_key, entry] : parent_map) {
            if (parent_key.empty()) {
                roots.push_back(key);
                break;
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
    std::set<OperationKey> visited;
    for (size_t i = 0; i < roots.size(); ++i) {
        print_hierarchy(roots[i], 0, visited, i == roots.size() - 1, 0);
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

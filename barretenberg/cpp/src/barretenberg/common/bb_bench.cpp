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
    static constexpr const char* BLUE = "\033[34m";
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
        return { Colors::BOLD, Colors::WHITE }; // Bold for >= 1 second
    }
    if (time_ms >= 100.0) {
        return { Colors::YELLOW, Colors::YELLOW }; // Yellow for >= 100ms
    }
    return { Colors::DIM, Colors::DIM }; // Dim for < 100ms
}

// Helper to format percentage with optional display
std::string format_percentage(double value, double total, double min_threshold = 0.1)
{
    if (total <= 0) {
        return "      ";
    }
    double percentage = (value / total) * 100.0;
    if (percentage < min_threshold) {
        return "      ";
    }

    std::ostringstream oss;
    oss << Colors::CYAN << " " << std::fixed << std::setprecision(1) << std::setw(5) << percentage << "%"
        << Colors::RESET;
    return oss.str();
}

// Print average time if count > 1
std::string format_average(double time_ms, std::size_t count)
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
    const char* line = thick ? "═══════════════════════════════════════════════════════════════════════════════"
                             : "───────────────────────────────────────────────────────────────────────────────";
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
            auto& normalized_entry = entry_map[entry->key];
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
    // Phase 1: Display the hierarchical structure
    // First, print header
    os << "\n";
    print_separator(os, true);
    os << Colors::BOLD << "  Benchmark Results" << Colors::RESET << "\n";
    print_separator(os, true);
    os << "\n";

    // Keep track of all operations that have already have their children printed.
    std::set<OperationKey> printed_in_detail;

    // Helper lambda to print a stat line with tree drawing
    auto print_stat_tree =
        [&](const AggregateEntry& entry, size_t indent_level, bool is_last, std::size_t parent_time = 0) {
            std::string indent(indent_level * 2, ' ');
            std::string prefix;
            if (indent_level > 0) {
                prefix = is_last ? "└─ " : "├─ ";
            }

            // Format name with proper width
            size_t total_prefix_len = indent.length() + prefix.length();
            size_t name_width = std::max<size_t>(30, 70 - total_prefix_len);
            std::string display_name =
                entry.key.length() > name_width ? entry.key.substr(0, name_width - 3) + std::string("...") : entry.key;

            double time_ms = static_cast<double>(entry.time) / 1000000.0;
            auto colors = get_time_colors(time_ms);

            // Print name with appropriate color
            os << indent << prefix << colors.name_color;
            if (time_ms >= 1000.0 && colors.name_color == Colors::BOLD) {
                os << Colors::YELLOW; // Special case: bold yellow for >= 1s
            }
            os << std::left << std::setw(static_cast<int>(name_width)) << display_name << Colors::RESET;

            // Print time if available
            if (entry.time > 0) {
                os << "  " << colors.time_color << format_time_aligned(time_ms) << Colors::RESET;

                // Show percentage relative to parent (or none for roots)
                if (indent_level == 0 || parent_time == 0) {
                    // Root entries or entries without valid parent time don't show percentage
                    os << "      "; // Keep alignment
                } else {
                    os << format_percentage(static_cast<double>(entry.time), static_cast<double>(parent_time));
                }

                // Show thread info for multi-threaded functions
                if (entry.num_threads > 1) {
                    // Show per-thread average with variance
                    os << Colors::DIM << " (" << entry.num_threads << " threads: " << format_time(entry.time_mean)
                       << " ± " << format_time(entry.time_stddev) << ")" << Colors::RESET;
                } else {
                    // Single-threaded, show average per call if multiple calls
                    os << format_average(time_ms, entry.count);
                }
            } else if (entry.count > 0) {
                os << "  " << Colors::DIM << std::setw(8) << entry.count << " calls" << Colors::RESET;
            }

            // Show shared indicator for multi-parent functions appearing at root
            if (multi_parent_functions.contains(entry.name) && indent_level == 0 &&
                !children_by_parent[entry.name].empty()) {
                os << Colors::RED << " [shared]" << Colors::RESET;
            }

            os << "\n";
        };

    // Recursive function to print hierarchy
    std::function<void(const std::string&, size_t, std::set<std::string>&, bool, std::size_t)> print_hierarchy =
        [&](const std::string& entry_key,
            size_t indent_level,
            std::set<std::string>& visited,
            bool is_last,
            std::size_t parent_time) {
            // Skip if already visited
            if (visited.contains(entry_key)) {
                return;
            }
            visited.insert(entry_key);

            // Get the entry
            if (!normalized_entries.contains(entry_key)) {
                return;
            }
            const auto& entry = normalized_entries[entry_key];

            // Print this entry
            print_stat_tree(entry, indent_level, is_last, parent_time);

            // Find and print children - look for entries where parent_key matches this entry's name
            std::vector<std::string> child_keys;
            if (debug_bench && indent_level == 0) {
                std::cout << "DEBUG: Looking for children of '" << entry.name << "'\n";
            }
            for (const auto& [key, child_entry] : normalized_entries) {
                if (child_entry.parent_key == entry.name) {
                    child_keys.push_back(key);
                    if (debug_bench && indent_level == 0) {
                        std::cout << "  Found child: " << child_entry.name << " (key=" << key
                                  << ", time=" << child_entry.time << ", parent_time=" << entry.time << ")\n";
                    }
                }
            }

            // Sort children by time
            std::ranges::sort(child_keys, [&](const auto& a, const auto& b) {
                return normalized_entries[a].time > normalized_entries[b].time;
            });

            // Print children
            for (size_t i = 0; i < child_keys.size(); ++i) {
                print_hierarchy(child_keys[i], indent_level + 1, visited, i == child_keys.size() - 1, entry.time);
            }
        };

    // Print root entries
    std::vector<std::string> root_keys;
    for (const auto& [key, entry] : normalized_entries) {
        if (entry.parent_key.empty()) {
            root_keys.push_back(key);
        }
    }

    // Sort roots by time
    std::ranges::sort(root_keys, [&](const auto& a, const auto& b) {
        return normalized_entries[a].time > normalized_entries[b].time;
    });

    // Print hierarchies starting from roots
    std::set<std::string> visited;
    for (size_t i = 0; i < root_keys.size(); ++i) {
        print_hierarchy(root_keys[i], 0, visited, i == root_keys.size() - 1, 0);
    }

    // Print summary
    os << "\n";
    print_separator(os, false);

    // Calculate totals from normalized entries
    std::size_t total_time = 0;
    std::size_t total_calls = 0;
    std::set<std::string> unique_functions;

    for (const auto& [_, entry] : normalized_entries) {
        if (entry.parent_key.empty()) {
            // Only count root entries to avoid double-counting
            total_time += entry.time;
            total_calls += entry.count;
        }
        unique_functions.insert(entry.name);
    }

    double total_time_ms = static_cast<double>(total_time) / 1000000.0;

    // Count shared functions
    std::size_t shared_count = 0;
    for (const auto& [func, parents] : parents_by_function) {
        if (parents.size() > 1) {
            shared_count++;
        }
    }

    os << "  " << Colors::BOLD << "Total: " << Colors::RESET << Colors::MAGENTA << unique_functions.size()
       << " functions" << Colors::RESET;
    if (shared_count > 0) {
        os << " (" << Colors::RED << shared_count << " shared" << Colors::RESET << ")";
    }
    os << ", " << Colors::GREEN << total_calls << " calls" << Colors::RESET << ", ";

    if (total_time_ms >= 1000.0) {
        os << Colors::YELLOW << std::fixed << std::setprecision(2) << (total_time_ms / 1000.0) << " seconds"
           << Colors::RESET;
    } else {
        os << Colors::YELLOW << std::fixed << std::setprecision(2) << total_time_ms << " ms" << Colors::RESET;
    }

    os << "\n";
    os << Colors::BOLD << Colors::CYAN
       << "═══════════════════════════════════════════════════════════════════════════════" << Colors::RESET << "\n";
    os << "\n";
}

void GlobalBenchStatsContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (TimeStatsEntry* entry : counts) {
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
    time = static_cast<std::size_t>(now_ns.time_since_epoch().count());
}
BenchReporter::~BenchReporter()
{
    if (stats == nullptr) {
        return;
    }
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    // Add, taking advantage of our parent context
    stats->count.track(parent, static_cast<std::size_t>(now_ns.time_since_epoch().count()) - time);

    // Unwind to previous parent
    GlobalBenchStatsContainer::parent = parent;
}
} // namespace bb::detail
#endif

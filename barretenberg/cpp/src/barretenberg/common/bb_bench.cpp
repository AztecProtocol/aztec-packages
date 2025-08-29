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

// Normalize the raw benchmark data into a clean structure for display
NormalizedData normalize_benchmark_data(const std::vector<TimeStatsEntry*>& counts)
{
    NormalizedData result;

    // Temporary structure for collecting raw data
    struct RawStats {
        std::size_t time = 0;
        std::size_t count = 0;
    };

    // Collect raw data per (function, parent, thread) combination
    // Key format: "parent_key|function_name|thread_id"
    std::map<std::string, RawStats> raw_data;

    for (const TimeStatsEntry* entry : counts) {
        const TimeStats* stats = &entry->count;

        // Process all parent contexts for this entry
        while (stats != nullptr) {
            if (stats->count > 0 || stats->time > 0) {
                // Determine parent key
                std::string parent_key = stats->parent ? stats->parent->key : "";
                std::string combined_key = parent_key + "|" + entry->key + "|" + entry->thread_id;

                // Accumulate stats
                raw_data[combined_key].time += stats->time;
                raw_data[combined_key].count += stats->count;

                // Track parent-child relationships
                if (parent_key.empty()) {
                    result.root_functions.insert(entry->key);
                } else {
                    result.parents_by_function[entry->key].insert(parent_key);
                }
            }
            stats = stats->next.get();
        }
    }

    // Aggregate by (function, parent) and calculate statistics
    std::map<std::string, std::vector<RawStats>> stats_by_function_parent;

    for (const auto& [key, stats] : raw_data) {
        // Parse the combined key
        size_t first_sep = key.find('|');
        size_t second_sep = key.find('|', first_sep + 1);
        std::string parent_key = key.substr(0, first_sep);
        std::string function_name = key.substr(first_sep + 1, second_sep - first_sep - 1);

        std::string function_parent_key = parent_key + "|" + function_name;
        stats_by_function_parent[function_parent_key].push_back(stats);
    }

    // Create normalized entries
    for (const auto& [key, thread_stats] : stats_by_function_parent) {
        size_t sep = key.find('|');
        std::string parent_key = key.substr(0, sep);
        std::string function_name = key.substr(sep + 1);

        NormalizedEntry entry;
        entry.name = function_name;
        entry.parent_key = parent_key;
        entry.num_threads = thread_stats.size();

        // Calculate totals and statistics
        for (const auto& stats : thread_stats) {
            entry.time += stats.time;
            entry.count += stats.count;
        }

        // Calculate mean and stddev if multi-threaded
        if (entry.num_threads > 1) {
            double sum_time = 0;
            for (const auto& stats : thread_stats) {
                sum_time += static_cast<double>(stats.time) / 1000000.0;
            }
            entry.time_mean = sum_time / static_cast<double>(entry.num_threads);

            // Calculate variance
            double variance = 0;
            for (const auto& stats : thread_stats) {
                double time_ms = static_cast<double>(stats.time) / 1000000.0;
                variance += (time_ms - entry.time_mean) * (time_ms - entry.time_mean);
            }
            entry.time_stddev = std::sqrt(variance / static_cast<double>(entry.num_threads));
        }

        result.entries[key] = entry;

        if (debug_bench) {
            std::cout << "  Entry[" << key << "]: name=" << entry.name << ", parent=" << entry.parent_key
                      << ", time=" << entry.time << ", count=" << entry.count << "\n";
        }
    }

    if (debug_bench) {
        std::cout << "\n=== DEBUG: Parent-child relationships ===\n";
        std::cout << "Parents by function:\n";
        for (const auto& [func, parents] : result.parents_by_function) {
            std::cout << "  " << func << " has parents: ";
            for (const auto& p : parents) {
                std::cout << p << " ";
            }
            std::cout << "\n";
        }
        std::cout << "Root functions: ";
        for (const auto& r : result.root_functions) {
            std::cout << r << " ";
        }
        std::cout << "\n=== END DEBUG ===\n\n";
    }

    return result;
}

void GlobalBenchStatsContainer::add_entry(const char* key, TimeStatsEntry* entry)
{
    std::unique_lock<std::mutex> lock(mutex);
    std::stringstream ss;
    ss << std::this_thread::get_id();
    entry->key = key;
    entry->thread_id = ss.str();
    counts.push_back(entry);
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "print_op_counts() START" << "\n";
    for (const TimeStatsEntry* entry : counts) {
        print_stats_recursive(entry->key, &entry->count, entry->thread_id, "");
    }
    std::cout << "print_op_counts() END" << "\n";
}

void GlobalBenchStatsContainer::print_stats_recursive(const std::string& key,
                                                      const TimeStats* stats,
                                                      const std::string& thread_id,
                                                      const std::string& indent) const
{
    if (stats->count > 0) {
        std::cout << indent << key << "\t" << stats->count << "\t[thread=" << thread_id << "]" << "\n";
    }
    if (stats->time > 0) {
        std::cout << indent << key << "(t)\t" << static_cast<double>(stats->time) / 1000000.0
                  << "ms\t[thread=" << thread_id << "]" << "\n";
    }

    if (stats->next != nullptr) {
        print_stats_recursive(key, stats->next.get(), thread_id, indent + "  ");
    }
}

std::map<std::string, std::size_t> GlobalBenchStatsContainer::get_aggregate_counts() const
{
    std::map<std::string, std::size_t> aggregate_counts;
    for (const TimeStatsEntry* entry : counts) {
        aggregate_stats_recursive(entry->key, &entry->count, aggregate_counts);
    }
    return aggregate_counts;
}

void GlobalBenchStatsContainer::aggregate_stats_recursive(const std::string& key,
                                                          const TimeStats* stats,
                                                          std::map<std::string, std::size_t>& aggregate_counts) const
{
    if (stats->count > 0) {
        aggregate_counts[key] += stats->count;
    }
    if (stats->time > 0) {
        aggregate_counts[key + "(t)"] += stats->time;
    }

    if (stats->next != nullptr) {
        aggregate_stats_recursive(key, stats->next.get(), aggregate_counts);
    }
}

void GlobalBenchStatsContainer::print_aggregate_counts(std::ostream& os, size_t indent) const
{
    os << '{';
    bool first = true;
    for (const auto& [key, value] : get_aggregate_counts()) {
        if (!first) {
            os << ',';
        }
        if (indent > 0) {
            os << "\n" << std::string(indent, ' ');
        }
        os << '"' << key << "\":" << value;
        first = false;
    }
    if (indent > 0) {
        os << "\n";
    }
    os << '}' << "\n";
}

void GlobalBenchStatsContainer::print_aggregate_counts_pretty(std::ostream& os) const
{

    auto counts = get_aggregate_counts();
    if (counts.empty()) {
        os << "No benchmark data collected." << "\n";
        return;
    }

    // Organize by function name (without (t) suffix)
    std::map<std::string, std::pair<std::size_t, std::size_t>> organized_stats;
    for (const auto& [key, value] : counts) {
        if (key.size() >= 3 && key.substr(key.size() - 3) == "(t)") {
            std::string base_name = key.substr(0, key.size() - 3);
            organized_stats[base_name].second = value; // time in nanoseconds
        } else {
            organized_stats[key].first = value; // count
        }
    }

    // Calculate max widths for alignment
    size_t max_name_width = 0;
    for (const auto& [name, _] : organized_stats) {
        max_name_width = std::max(max_name_width, name.length());
    }
    max_name_width = std::min(max_name_width, static_cast<size_t>(60)); // Cap at 60 chars

    // Print header
    os << "\n";
    os << Colors::BOLD << Colors::CYAN
       << "═══════════════════════════════════════════════════════════════════════════════" << Colors::RESET << "\n";
    os << Colors::BOLD << "  Benchmark Results" << Colors::RESET << "\n";
    os << Colors::BOLD << Colors::CYAN
       << "═══════════════════════════════════════════════════════════════════════════════" << Colors::RESET << "\n";
    os << "\n";

    // Sort by total time descending
    std::vector<std::pair<std::string, std::pair<std::size_t, std::size_t>>> sorted_stats(organized_stats.begin(),
                                                                                          organized_stats.end());
    std::ranges::sort(sorted_stats, [](const auto& a, const auto& b) { return a.second.second > b.second.second; });

    // Print each function's stats
    for (const auto& [name, stats] : sorted_stats) {
        auto [count, time_ns] = stats;

        // Skip entries with no time or count
        if (count == 0 && time_ns == 0) {
            continue;
        }

        // Format name (truncate if too long)
        std::string display_name = name;
        if (display_name.length() > max_name_width) {
            display_name = display_name.substr(0, max_name_width - 3) + "...";
        }

        os << "  " << Colors::BLUE << std::left << std::setw(static_cast<int>(max_name_width) + 2) << display_name
           << Colors::RESET;

        // Print count if available
        if (count > 0) {
            os << Colors::GREEN << std::right << std::setw(8) << count << Colors::RESET << " calls";
        } else {
            os << std::string(14, ' ');
        }

        // Print time if available
        if (time_ns > 0) {
            double time_ms = static_cast<double>(time_ns) / 1000000.0;
            auto colors = get_time_colors(time_ms);

            // Use a custom formatting for this view
            os << "  " << colors.time_color;
            if (time_ms >= 1000.0) {
                os << std::fixed << std::setprecision(2) << std::setw(10) << (time_ms / 1000.0) << " s";
            } else if (time_ms >= 1.0) {
                os << std::fixed << std::setprecision(2) << std::setw(10) << time_ms << " ms";
            } else {
                os << std::fixed << std::setprecision(3) << std::setw(10) << (time_ms * 1000.0) << " μs";
            }
            os << Colors::RESET;

            // Show average time
            os << format_average(time_ms, count);
        }

        os << "\n";
    }

    // Print summary
    os << "\n";
    os << Colors::BOLD << Colors::CYAN
       << "───────────────────────────────────────────────────────────────────────────────" << Colors::RESET << "\n";

    // Calculate totals
    std::size_t total_time_ns = 0;
    std::size_t total_calls = 0;
    for (const auto& [_, stats] : organized_stats) {
        total_calls += stats.first;
        total_time_ns += stats.second;
    }

    double total_time_ms = static_cast<double>(total_time_ns) / 1000000.0;
    os << "  " << Colors::BOLD << "Total: " << Colors::RESET << Colors::MAGENTA << organized_stats.size()
       << " functions" << Colors::RESET << ", " << Colors::GREEN << total_calls << " calls" << Colors::RESET << ", ";

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

void GlobalBenchStatsContainer::print_aggregate_counts_hierarchical(std::ostream& os) const
{
    if (counts.empty()) {
        os << "No benchmark data collected." << "\n";
        return;
    }

    // Phase 1: Collect and normalize all data
    // Key is "parent_key|function_name" for uniqueness
    std::map<std::string, NormalizedEntry> normalized_entries;

    // Additional indices for easy lookup
    std::map<std::string, std::vector<std::string>> children_by_parent; // parent -> list of children
    std::map<std::string, std::set<std::string>> parents_by_function;   // function -> set of parents
    std::set<std::string> root_functions;                               // Functions with no parent

    // Temporary structure for collecting raw data
    struct RawStats {
        std::size_t time = 0;
        std::size_t count = 0;
    };

    // Collect raw data per (function, parent, thread) combination
    // Key format: "parent_key|function_name|thread_id"
    std::map<std::string, RawStats> raw_data;

    for (const TimeStatsEntry* entry : counts) {
        const TimeStats* stats = &entry->count;

        // Process all parent contexts for this entry
        while (stats != nullptr) {
            if (stats->count > 0 || stats->time > 0) {
                // Determine parent key
                std::string parent_key = stats->parent ? stats->parent->key : "";
                std::string combined_key = parent_key + "|" + entry->key + "|" + entry->thread_id;

                // Accumulate stats
                raw_data[combined_key].time += stats->time;
                raw_data[combined_key].count += stats->count;

                // Track parent-child relationships
                if (parent_key.empty()) {
                    root_functions.insert(entry->key);
                } else {
                    children_by_parent[parent_key].push_back(entry->key);
                    parents_by_function[entry->key].insert(parent_key);
                }
            }
            stats = stats->next.get();
        }
    }

    // Phase 2: Aggregate by (function, parent) and calculate statistics
    std::map<std::string, std::vector<RawStats>> stats_by_function_parent;

    for (const auto& [key, stats] : raw_data) {
        // Parse the combined key
        size_t first_sep = key.find('|');
        size_t second_sep = key.find('|', first_sep + 1);
        std::string parent_key = key.substr(0, first_sep);
        std::string function_name = key.substr(first_sep + 1, second_sep - first_sep - 1);

        std::string function_parent_key = parent_key + "|" + function_name;
        stats_by_function_parent[function_parent_key].push_back(stats);
    }

    // Debug: print what we collected
    if (debug_bench) {
        std::cout << "=== DEBUG: Raw data collected ===\n";
        for (const auto& [key, stats] : raw_data) {
            std::cout << "  " << key << " -> time=" << stats.time << " count=" << stats.count << "\n";
        }

        std::cout << "\n=== DEBUG: Function-parent aggregation ===\n";
        for (const auto& [key, stats_list] : stats_by_function_parent) {
            size_t total_time = 0;
            size_t total_count = 0;
            for (const auto& stats : stats_list) {
                total_time += stats.time;
                total_count += stats.count;
            }
            std::cout << "  " << key << " -> time=" << total_time << " count=" << total_count << " (from "
                      << stats_list.size() << " threads)\n";
        }
        std::cout << "\n=== DEBUG: Normalized entries ===\n";
    }

    // Create normalized entries
    for (const auto& [key, thread_stats] : stats_by_function_parent) {
        size_t sep = key.find('|');
        std::string parent_key = key.substr(0, sep);
        std::string function_name = key.substr(sep + 1);

        NormalizedEntry entry;
        entry.name = function_name;
        entry.parent_key = parent_key;
        entry.num_threads = thread_stats.size();

        // Calculate totals and statistics
        for (const auto& stats : thread_stats) {
            entry.time += stats.time;
            entry.count += stats.count;
        }

        // Calculate mean and stddev if multi-threaded
        if (entry.num_threads > 1) {
            double sum_time = 0;
            for (const auto& stats : thread_stats) {
                sum_time += static_cast<double>(stats.time) / 1000000.0;
            }
            entry.time_mean = sum_time / static_cast<double>(entry.num_threads);

            // Calculate variance
            double variance = 0;
            for (const auto& stats : thread_stats) {
                double time_ms = static_cast<double>(stats.time) / 1000000.0;
                variance += (time_ms - entry.time_mean) * (time_ms - entry.time_mean);
            }
            entry.time_stddev = std::sqrt(variance / static_cast<double>(entry.num_threads));
        }

        normalized_entries[key] = entry;
    }

    // Phase 3: Display the hierarchical structure
    // First, print header
    os << "\n";
    print_separator(os, true);
    os << Colors::BOLD << "  Hierarchical Benchmark Results" << Colors::RESET << "\n";
    print_separator(os, true);
    os << "\n";

    // Identify functions that appear under multiple parents
    std::set<std::string> multi_parent_functions;
    for (const auto& [func, parents] : parents_by_function) {
        if (parents.size() > 1) {
            multi_parent_functions.insert(func);
        }
    }

    // Helper lambda to print a stat line with tree drawing
    auto print_stat_tree =
        [&](const NormalizedEntry& entry, size_t indent_level, bool is_last, std::size_t parent_time = 0) {
            std::string indent(indent_level * 2, ' ');
            std::string prefix;
            if (indent_level > 0) {
                prefix = is_last ? "└─ " : "├─ ";
            }

            // Format name with proper width
            size_t total_prefix_len = indent.length() + prefix.length();
            size_t name_width = std::max<size_t>(30, 70 - total_prefix_len);
            std::string display_name =
                entry.name.length() > name_width ? entry.name.substr(0, name_width - 3) + "..." : entry.name;

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

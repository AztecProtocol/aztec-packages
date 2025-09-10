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
#include <mutex>
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

// Helper to determine if time is in seconds range
bool is_seconds_range(double time_ms)
{
    return time_ms >= 1000.0;
}

// Helper to determine if time is in milliseconds range
bool is_milliseconds_range(double time_ms)
{
    return time_ms >= 1.0 && time_ms < 1000.0;
}

// Helper to convert milliseconds to seconds
double milliseconds_to_seconds(double time_ms)
{
    return time_ms / 1000.0;
}

// Helper to convert milliseconds to microseconds
double milliseconds_to_microseconds(double time_ms)
{
    return time_ms * 1000.0;
}

// Helper to convert nanoseconds to milliseconds
double nanoseconds_to_milliseconds(uint64_t nanoseconds)
{
    return static_cast<double>(nanoseconds) / 1000000.0;
}

// Format time value with appropriate unit
std::string format_time(double time_ms)
{
    std::ostringstream oss;
    if (is_seconds_range(time_ms)) {
        oss << std::fixed << std::setprecision(2) << milliseconds_to_seconds(time_ms) << " s";
    } else if (is_milliseconds_range(time_ms)) {
        oss << std::fixed << std::setprecision(2) << time_ms << " ms";
    } else {
        oss << std::fixed << std::setprecision(1) << milliseconds_to_microseconds(time_ms) << " μs";
    }
    return oss.str();
}

// Helper to create formatted time string for seconds
std::string create_seconds_string(double time_ms)
{
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2) << milliseconds_to_seconds(time_ms) << "s";
    return oss.str();
}

// Helper to create formatted time string for milliseconds
std::string create_milliseconds_string(double time_ms)
{
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(1) << time_ms << "ms";
    return oss.str();
}

// Format time with fixed width for alignment
std::string format_time_aligned(double time_ms)
{
    std::ostringstream oss;
    if (is_seconds_range(time_ms)) {
        std::string time_str = create_seconds_string(time_ms);
        oss << std::left << std::setw(10) << time_str;
    } else {
        std::string time_str = create_milliseconds_string(time_ms);
        oss << std::left << std::setw(10) << time_str;
    }
    return oss.str();
}

// Helper to calculate percentage
double calculate_percentage(double value, double total)
{
    if (total <= 0) {
        return 0.0;
    }
    return (value / total) * 100.0;
}

// Helper to check if percentage is below threshold
bool is_percentage_below_threshold(double percentage, double threshold)
{
    return percentage < threshold;
}

// Helper to create empty percentage string
std::string create_empty_percentage_string()
{
    return "       ";
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
    double percentage = calculate_percentage(value, total);
    if (total <= 0 || is_percentage_below_threshold(percentage, min_threshold)) {
        return create_empty_percentage_string();
    }

    // Choose color based on percentage value (like time colors)
    const char* color = Colors::CYAN; // Default color

    return format_percentage_value(percentage, color);
}

// Helper to format indent level indicator
std::string format_indent_level_indicator(size_t indent_level)
{
    std::ostringstream oss;
    oss << Colors::MAGENTA << "[" << indent_level << "] " << Colors::RESET;
    return oss.str();
}

// Helper to check if should show percentage
bool should_show_percentage(double parent_time, size_t indent_level)
{
    return parent_time > 0 && indent_level > 0;
}

// Helper to format percentage section
std::string format_percentage_section(double time_ms, double parent_time, size_t indent_level)
{
    if (should_show_percentage(parent_time, indent_level)) {
        return format_percentage(time_ms * 1000000.0, parent_time);
    }
    return create_empty_percentage_string();
}

// Helper to check if time needs dimming
bool should_dim_time(double time_ms)
{
    return time_ms >= 100.0 && time_ms < 1000.0;
}

// Helper to format time section
std::string format_time_section(double time_ms)
{
    std::ostringstream oss;
    oss << "   ";
    if (should_dim_time(time_ms)) {
        oss << Colors::DIM << format_time_aligned(time_ms) << Colors::RESET;
    } else {
        oss << format_time_aligned(time_ms);
    }
    return oss.str();
}

// Helper to check if should show call stats
bool should_show_call_stats(double time_ms, uint64_t count)
{
    return time_ms >= 100.0 && count > 1;
}

// Helper to calculate average time
double calculate_average_time(double time_ms, uint64_t count)
{
    return time_ms / static_cast<double>(count);
}

// Helper to format call stats
std::string format_call_stats(double time_ms, uint64_t count)
{
    if (!should_show_call_stats(time_ms, count)) {
        return "";
    }
    double avg_ms = calculate_average_time(time_ms, count);
    std::ostringstream oss;
    oss << Colors::DIM << " (" << format_time(avg_ms) << " x " << count << ")" << Colors::RESET;
    return oss.str();
}

std::string format_aligned_section(double time_ms, double parent_time, uint64_t count, size_t indent_level)
{
    std::ostringstream oss;

    // Add indent level indicator at the beginning with different color
    oss << format_indent_level_indicator(indent_level);

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

// Helper to check if time is significant (>= 100ms)
bool is_time_significant(double time_ms)
{
    return time_ms >= 100.0;
}

// Helper to check if time is minimal (< 100ms)
bool is_time_minimal(double time_ms)
{
    return time_ms < 100.0;
}

// Helper to get colors for significant seconds
TimeColor get_seconds_colors()
{
    return { Colors::BOLD, Colors::WHITE };
}

// Helper to get colors for significant milliseconds
TimeColor get_significant_milliseconds_colors()
{
    return { Colors::YELLOW, Colors::YELLOW };
}

// Helper to get colors for minimal time
TimeColor get_minimal_time_colors()
{
    return { Colors::DIM, Colors::DIM };
}

TimeColor get_time_colors(double time_ms)
{
    if (is_seconds_range(time_ms)) {
        return get_seconds_colors();
    }
    if (is_time_significant(time_ms)) {
        return get_significant_milliseconds_colors();
    }
    return get_minimal_time_colors();
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
using OperationKey = std::string_view;

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
    for (const TimeStatsEntry* entry : entries) {
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

void GlobalBenchStatsContainer::add_entry(const char* key, TimeStatsEntry* entry)
{
    std::unique_lock<std::mutex> lock(mutex);
    entry->key = key;
    entries.push_back(entry);
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "GlobalBenchStatsContainer::print() START" << "\n";
    for (const TimeStatsEntry* entry : entries) {
        print_stats_recursive(entry->key, &entry->count, "");
    }
    std::cout << "GlobalBenchStatsContainer::print() END" << "\n";
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

    // Helper to create tree prefix
    auto create_tree_prefix = [](size_t indent_level, bool is_last) -> std::string {
        if (indent_level == 0) {
            return "";
        }
        return is_last ? "└─ " : "├─ ";
    };

    // Helper to truncate display name
    auto truncate_display_name = [](const std::string& name, size_t max_width) -> std::string {
        if (name.length() <= max_width) {
            return name;
        }
        return name.substr(0, max_width - 3) + "...";
    };

    // Helper to format minimal time output
    auto format_minimal_time_output = [&](size_t indent_level, double time_ms, uint64_t parent_time) -> std::string {
        std::ostringstream oss;
        oss << format_indent_level_indicator(indent_level);
        oss << format_percentage_section(time_ms, static_cast<double>(parent_time), indent_level);
        oss << "   " << std::setw(10) << ""; // Add spacing to replace where time would be
        return oss.str();
    };

    // Helper to format thread statistics
    auto format_thread_stats = [](const AggregateEntry& entry) -> std::string {
        if (entry.num_threads <= 1) {
            return "";
        }
        double mean_ms = entry.time_mean / 1000000.0;
        double stddev_percentage = floor(entry.get_std_dev() * 100 / entry.time_mean);
        std::ostringstream oss;
        oss << "  " << entry.num_threads << " threads " << mean_ms << "ms average " << stddev_percentage << "% stddev";
        return oss.str();
    };

    // Helper function to print a stat line with tree drawing
    auto print_entry = [&](const AggregateEntry& entry, size_t indent_level, bool is_last, uint64_t parent_time) {
        std::string indent(indent_level * 2, ' ');
        std::string prefix = create_tree_prefix(indent_level, is_last);

        // Use exactly 80 characters for function name without indent
        const size_t name_width = 80;
        std::string display_name = truncate_display_name(std::string(entry.key), name_width);

        double time_ms = nanoseconds_to_milliseconds(entry.time_max);
        auto colors = get_time_colors(time_ms);

        // Print indent + prefix + name (exactly 80 chars) + time/percentage/calls
        os << indent << prefix << colors.name_color;
        if (is_seconds_range(time_ms) && colors.name_color == Colors::BOLD) {
            os << Colors::YELLOW; // Special case: bold yellow for >= 1s
        }
        os << std::left << std::setw(static_cast<int>(name_width)) << display_name << Colors::RESET;

        // Print time if available with aligned section including indent level
        if (entry.time_max > 0) {
            if (is_time_minimal(time_ms)) {
                // Minimal format for <100ms: only [level] and percentage, no time display
                std::string minimal_output = format_minimal_time_output(indent_level, time_ms, parent_time);
                os << "  " << colors.time_color << std::setw(40) << std::left << minimal_output << Colors::RESET;
            } else {
                std::string aligned_section =
                    format_aligned_section(time_ms, static_cast<double>(parent_time), entry.count, indent_level);
                os << "  " << colors.time_color << std::setw(40) << std::left << aligned_section << Colors::RESET;
                os << format_thread_stats(entry);
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

        // Helper to check if time is meaningful (>= 0.5ms)
        auto is_time_meaningful = [](uint64_t time_ns) -> bool {
            return time_ns >= 500000; // 0.5ms in nanoseconds
        };

        // Helper to find children of a given key
        auto find_children = [&](OperationKey parent) -> std::vector<OperationKey> {
            std::vector<OperationKey> result;
            for (const auto& [child_key, parent_map] : aggregated) {
                for (const auto& [parent_key, entry] : parent_map) {
                    if (parent_key == parent && is_time_meaningful(entry.time_max)) {
                        result.push_back(child_key);
                        break;
                    }
                }
            }
            return result;
        };

        // Find and print children - operations that have this key as parent (only those with meaningful time >= 0.5ms)
        std::vector<OperationKey> children;
        if (!printed_in_detail.contains(key)) {
            children = find_children(key);
            printed_in_detail.insert(key);
        }

        // Helper to get child time in specific parent context
        auto get_child_time_in_parent = [&](OperationKey child, OperationKey parent) -> uint64_t {
            if (auto it = aggregated.find(child); it != aggregated.end()) {
                for (const auto& [parent_key, entry] : it->second) {
                    if (parent_key == parent) {
                        return entry.time_max;
                    }
                }
            }
            return 0;
        };

        // Sort children by their time in THIS parent context
        std::ranges::sort(children, [&](OperationKey a, OperationKey b) {
            uint64_t time_a = get_child_time_in_parent(a, key);
            uint64_t time_b = get_child_time_in_parent(b, key);
            return time_a > time_b;
        });

        // Helper to calculate total time for children
        auto calculate_children_total_time = [&](const std::vector<OperationKey>& child_keys,
                                                 OperationKey parent) -> uint64_t {
            uint64_t total = 0;
            for (const auto& child_key : child_keys) {
                if (auto it = aggregated.find(child_key); it != aggregated.end()) {
                    for (const auto& [parent_key, entry] : it->second) {
                        if (parent_key == parent && entry.time_max >= 500000) { // 0.5ms in nanoseconds
                            total += entry.time_max;
                        }
                    }
                }
            }
            return total;
        };

        // Helper to check if unaccounted time is significant
        auto is_unaccounted_time_significant = [](uint64_t parent_time, uint64_t children_time) -> bool {
            if (parent_time == 0 || children_time >= parent_time) {
                return false;
            }
            uint64_t unaccounted = parent_time - children_time;
            double percentage = (static_cast<double>(unaccounted) / static_cast<double>(parent_time)) * 100.0;
            return percentage > 5.0 && unaccounted > 0;
        };

        // Calculate time spent in children and add "(other)" if >5% unaccounted
        uint64_t children_total_time = calculate_children_total_time(children, key);
        uint64_t parent_total_time = entry_to_print->time_max;
        bool should_add_other =
            !children.empty() && is_unaccounted_time_significant(parent_total_time, children_total_time);
        uint64_t other_time = should_add_other ? (parent_total_time - children_total_time) : 0;

        if (!children.empty() && keys_to_parents[key].size() > 1) {
            os << std::string(indent_level * 2, ' ') << "  ├─ NOTE: Shared children. Can add up to > 100%.\n";
        }

        // Print children
        for (size_t i = 0; i < children.size(); ++i) {
            bool is_last_child = (i == children.size() - 1) && !should_add_other;
            print_hierarchy(children[i], indent_level + 1, is_last_child, entry_to_print->time, key);
        }

        // Helper to create "other" entry for unaccounted time
        auto create_other_entry = [](uint64_t time) -> AggregateEntry {
            AggregateEntry entry;
            entry.key = "(other)";
            entry.time = time;
            entry.time_max = time;
            entry.count = 1;
            entry.num_threads = 1;
            return entry;
        };

        // Print "(other)" category if significant unaccounted time exists
        if (should_add_other && keys_to_parents[key].size() <= 1) {
            AggregateEntry other_entry = create_other_entry(other_time);
            print_entry(other_entry, indent_level + 1, true, parent_total_time); // always last
        }
    };

    // Helper to check if entry is a root (has empty parent with significant time)
    auto is_root_entry = [&](const auto& parent_map) -> bool {
        auto empty_parent_it = parent_map.find("");
        return empty_parent_it != parent_map.end() && empty_parent_it->second.time > 0;
    };

    // Helper to collect root entries
    auto collect_root_entries = [&]() -> std::vector<OperationKey> {
        std::vector<OperationKey> roots;
        for (const auto& [key, parent_map] : aggregated) {
            if (is_root_entry(parent_map)) {
                roots.push_back(key);
            }
        }
        return roots;
    };

    // Helper to get root entry time
    auto get_root_entry_time = [&](OperationKey key) -> uint64_t {
        if (auto it = aggregated.find(key); it != aggregated.end()) {
            if (auto parent_it = it->second.find(""); parent_it != it->second.end()) {
                return parent_it->second.time_max;
            }
        }
        return 0;
    };

    // Helper to sort entries by time (descending)
    auto sort_by_time_descending = [&](std::vector<OperationKey>& keys) {
        std::ranges::sort(
            keys, [&](OperationKey a, OperationKey b) { return get_root_entry_time(a) > get_root_entry_time(b); });
    };

    // Find root entries (those that ONLY have empty parent key and significant time)
    std::vector<OperationKey> roots = collect_root_entries();

    // Sort roots by time
    sort_by_time_descending(roots);

    // Print hierarchies starting from roots
    for (size_t i = 0; i < roots.size(); ++i) {
        print_hierarchy(roots[i], 0, i == roots.size() - 1, 0, "");
    }

    // Print summary
    print_separator(os, false);

    // Helper to count unique functions
    auto count_unique_functions = [&]() -> size_t {
        std::set<OperationKey> unique;
        for (const auto& [key, _] : aggregated) {
            unique.insert(key);
        }
        return unique.size();
    };

    // Helper to count shared functions (with multiple parents)
    auto count_shared_functions = [&]() -> uint64_t {
        uint64_t count = 0;
        for (const auto& [key, parents] : keys_to_parents) {
            if (parents.size() > 1) {
                count++;
            }
        }
        return count;
    };

    // Helper to calculate total time from root entries
    auto calculate_total_time = [&]() -> uint64_t {
        uint64_t max_time = 0;
        for (const auto& [_, parent_map] : aggregated) {
            if (auto it = parent_map.find(""); it != parent_map.end()) {
                max_time = std::max(max_time, it->second.time_max);
            }
        }
        return max_time;
    };

    // Helper to calculate total calls
    auto calculate_total_calls = [&]() -> uint64_t {
        uint64_t total = 0;
        for (const auto& [_, parent_map] : aggregated) {
            for (const auto& [__, entry] : parent_map) {
                total += entry.count;
            }
        }
        return total;
    };

    // Calculate totals from root entries
    size_t unique_functions_count = count_unique_functions();
    uint64_t shared_count = count_shared_functions();
    uint64_t total_time = calculate_total_time();
    uint64_t total_calls = calculate_total_calls();

    // Helper to format function count
    auto format_function_count = [](size_t count, uint64_t shared) -> std::string {
        std::ostringstream oss;
        oss << Colors::MAGENTA << count << " functions" << Colors::RESET;
        if (shared > 0) {
            oss << " (" << Colors::RED << shared << " shared" << Colors::RESET << ")";
        }
        return oss.str();
    };

    // Helper to format measurement count
    auto format_measurement_count = [](uint64_t count) -> std::string {
        std::ostringstream oss;
        oss << Colors::GREEN << count << " measurements" << Colors::RESET;
        return oss.str();
    };

    // Helper to format total time with color
    auto format_total_time_colored = [](double time_ms) -> std::string {
        std::ostringstream oss;
        oss << Colors::YELLOW;
        if (is_seconds_range(time_ms)) {
            oss << std::fixed << std::setprecision(2) << milliseconds_to_seconds(time_ms) << " seconds";
        } else {
            oss << std::fixed << std::setprecision(2) << time_ms << " ms";
        }
        oss << Colors::RESET;
        return oss.str();
    };

    double total_time_ms = nanoseconds_to_milliseconds(total_time);

    os << "  " << Colors::BOLD << "Total: " << Colors::RESET
       << format_function_count(unique_functions_count, shared_count) << ", " << format_measurement_count(total_calls)
       << ", " << format_total_time_colored(total_time_ms);

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

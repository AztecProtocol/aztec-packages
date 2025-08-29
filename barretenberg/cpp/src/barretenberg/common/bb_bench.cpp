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
    static constexpr const char* ITALIC = "\033[3m";
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

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_bb_bench = std::getenv("BB_BENCH") == nullptr ? false : std::string(std::getenv("BB_BENCH")) == "1";

GlobalBenchStatsContainer::~GlobalBenchStatsContainer()
{
    // This is useful for printing counts at the end of non-benchmarks.
    // See op_count_google_bench.hpp for benchmarks.
    // print();
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

    // Collect all stats with their parent relationships
    struct StatInfo {
        std::string key;
        std::size_t count = 0;
        std::size_t time = 0;
        std::set<const TimeStatsEntry*> parents;
        // Track time and count spent under each specific parent
        std::map<const TimeStatsEntry*, std::pair<std::size_t, std::size_t>>
            per_parent_stats; // parent -> (time, count)
        // Track per-thread statistics for multi-threaded functions
        std::vector<std::pair<std::size_t, std::size_t>> thread_stats; // (time, count) per thread
    };

    std::map<std::string, StatInfo> all_stats;
    std::set<const TimeStatsEntry*> all_entries;

    // First pass: collect all stats and their parent relationships
    // Group entries by key to detect multi-threaded functions
    std::map<std::string, std::vector<const TimeStatsEntry*>> entries_by_key;
    for (const TimeStatsEntry* entry : counts) {
        all_entries.insert(entry);
        entries_by_key[entry->key].push_back(entry);
    }

    // Process each unique function
    for (const auto& [key, entries] : entries_by_key) {
        auto& stat_info = all_stats[key];
        stat_info.key = key;

        // Process each thread's entry for this function
        for (const TimeStatsEntry* entry : entries) {
            // Process all contexts to properly track per-parent statistics
            const TimeStats* stats = &entry->count;
            bool is_primary = true;

            // Track this thread's primary stats
            std::size_t thread_time = 0;
            std::size_t thread_count = 0;

            while (stats != nullptr) {
                // For the primary context, add to total and thread stats
                if (is_primary) {
                    stat_info.count += stats->count;
                    stat_info.time += stats->time;
                    thread_time += stats->time;
                    thread_count += stats->count;
                }

                // Track parent relationship and per-parent stats
                if (stats->parent != nullptr) {
                    stat_info.parents.insert(stats->parent);
                    // Track time and count for this specific parent
                    stat_info.per_parent_stats[stats->parent].first += stats->time;
                    stat_info.per_parent_stats[stats->parent].second += stats->count;
                }

                stats = stats->next.get();
                is_primary = false;
            }

            // Store this thread's stats
            if (thread_time > 0 || thread_count > 0) {
                stat_info.thread_stats.push_back({ thread_time, thread_count });
            }
        }
    }

    // Build parent-to-children map (include ALL children, even multi-parent ones)
    std::map<std::string, std::set<std::string>> children_map;
    for (const auto& [key, info] : all_stats) {
        for (const TimeStatsEntry* parent : info.parents) {
            children_map[parent->key].insert(key);
        }
    }

    // Find root entries (no parents)
    std::set<std::string> roots;
    for (const auto& [key, info] : all_stats) {
        if (info.parents.empty()) {
            roots.insert(key);
        }
    }

    // Find the lowest common ancestor for multi-parent entries with children
    // These will be shown as separate entries at the appropriate level
    std::map<std::string, std::string> entry_common_ancestor;
    std::set<std::string> multi_parent_with_children;

    for (const auto& [key, info] : all_stats) {
        if (info.parents.size() > 1 && children_map.contains(key) && !children_map[key].empty()) {
            multi_parent_with_children.insert(key);

            // Find common ancestor of all parents
            std::vector<const TimeStatsEntry*> parent_vec(info.parents.begin(), info.parents.end());

            // For simplicity, if no common ancestor or complex to find, make it a root
            // In practice, most will either be siblings (same parent) or need to be roots
            bool all_same_grandparent = true;
            const TimeStatsEntry* first_grandparent = nullptr;

            for (const auto* parent : parent_vec) {
                if (all_stats[parent->key].parents.empty()) {
                    // Parent is a root, so this entry should be at level 1
                    all_same_grandparent = false;
                    break;
                }

                const TimeStatsEntry* grandparent = *all_stats[parent->key].parents.begin();
                if (!first_grandparent) {
                    first_grandparent = grandparent;
                } else if (first_grandparent != grandparent) {
                    all_same_grandparent = false;
                    break;
                }
            }

            if (!all_same_grandparent || !first_grandparent) {
                // No common ancestor, make it a root
                roots.insert(key);
            } else {
                // Will be shown as child of common ancestor
                entry_common_ancestor[key] = first_grandparent->key;
                children_map[first_grandparent->key].insert(key);
            }
        }
    }

    // Helper lambda to print a stat line with tree drawing
    auto print_stat_tree = [&](const std::string& name,
                               const StatInfo& info,
                               size_t indent_level,
                               bool is_last,
                               std::size_t parent_time = 0) {
        std::string indent(indent_level * 2, ' ');
        std::string prefix;
        if (indent_level > 0) {
            prefix = is_last ? "└─ " : "├─ ";
        }

        // Format name with proper width
        size_t total_prefix_len = indent.length() + prefix.length();
        size_t name_width = std::max<size_t>(30, 70 - total_prefix_len);
        std::string display_name = name.length() > name_width ? name.substr(0, name_width - 3) + "..." : name;

        double time_ms = static_cast<double>(info.time) / 1000000.0;
        auto colors = get_time_colors(time_ms);

        // Print name with appropriate color
        os << indent << prefix << colors.name_color;
        if (time_ms >= 1000.0 && colors.name_color == Colors::BOLD) {
            os << Colors::YELLOW; // Special case: bold yellow for >= 1s
        }
        os << std::left << std::setw(static_cast<int>(name_width)) << display_name << Colors::RESET;

        // Print time if available
        if (info.time > 0) {
            os << "  " << colors.time_color << format_time_aligned(time_ms) << Colors::RESET;

            // Show percentage relative to parent (or none for roots)
            if (indent_level == 0 || parent_time == 0) {
                // Root entries or entries without valid parent time don't show percentage
                os << "      "; // Keep alignment
            } else {
                os << format_percentage(static_cast<double>(info.time), static_cast<double>(parent_time));
            }

            // Show thread info for multi-threaded functions
            if (info.thread_stats.size() > 1) {
                // Calculate mean and variance
                double total_thread_time = 0;
                for (const auto& [t_time, t_count] : info.thread_stats) {
                    total_thread_time += static_cast<double>(t_time) / 1000000.0;
                }
                double mean_time = total_thread_time / static_cast<double>(info.thread_stats.size());

                // Calculate variance
                double time_variance = 0;
                for (const auto& [t_time, t_count] : info.thread_stats) {
                    double thread_time_ms = static_cast<double>(t_time) / 1000000.0;
                    time_variance += (thread_time_ms - mean_time) * (thread_time_ms - mean_time);
                }
                time_variance /= static_cast<double>(info.thread_stats.size());
                double time_stddev = std::sqrt(time_variance);

                // Show per-thread average with variance
                os << Colors::DIM << " (" << info.thread_stats.size() << " threads: " << format_time(mean_time) << " ± "
                   << format_time(time_stddev) << ")" << Colors::RESET;
            } else {
                // Single-threaded, show average per call if multiple calls
                os << format_average(time_ms, info.count);
            }
        } else if (info.count > 0) {
            os << "  " << Colors::DIM << std::setw(8) << info.count << " calls" << Colors::RESET;
        }

        // Show shared indicator only for multi-parent entries at root level
        // Don't show it when they appear nested (as references)
        if (multi_parent_with_children.contains(name) && indent_level == 0) {
            os << Colors::RED << " [shared]" << Colors::RESET;
        } else if (info.parents.size() > 1 && indent_level > 0) {
            // This is a shared function appearing as a reference under a parent
            // Don't show [shared] since we're not showing its children here
        }

        os << "\n";
    };

    // Recursive function to print hierarchy
    std::function<void(
        const std::string&, size_t, std::set<std::string>&, bool, bool, std::size_t, const TimeStatsEntry*)>
        print_hierarchy = [&](const std::string& key,
                              size_t indent_level,
                              std::set<std::string>& visited,
                              bool is_last,
                              bool force_print,
                              std::size_t parent_time,
                              const TimeStatsEntry* parent_entry) {
            // Skip if already visited, unless we're forcing print for multi-parent entries
            if (!force_print && visited.contains(key)) {
                return;
            }

            // Mark as visited only if this is the "canonical" appearance (not forced)
            if (!force_print) {
                visited.insert(key);
            }

            // Get the stats for this specific parent context if not a root
            StatInfo display_info = all_stats[key];

            // If we have a parent entry, try to use parent-specific stats
            // This is important for functions that appear under multiple parents
            if (parent_entry && display_info.per_parent_stats.contains(parent_entry)) {
                // Use parent-specific stats for display
                auto [parent_time_val, parent_count] = display_info.per_parent_stats[parent_entry];
                display_info.time = parent_time_val;
                display_info.count = parent_count;
            }

            // Print this entry with parent time for percentage calculation
            print_stat_tree(key, display_info, indent_level, is_last, parent_time);

            // Only print children if:
            // 1. Not a forced print (multi-parent entry being shown under a parent)
            // 2. Not a multi-parent entry with children (unless it's a root entry at indent_level 0)
            bool should_print_children =
                !force_print && (!multi_parent_with_children.contains(key) || indent_level == 0);

            if (should_print_children) {
                if (children_map.contains(key)) {
                    std::vector<std::string> children_vec;
                    std::size_t children_total_time = 0;

                    // Find the current entry to use as parent reference
                    // If we already have a parent_entry passed in, that means we're under a specific parent
                    // Otherwise, find the entry for this key to use as parent
                    const TimeStatsEntry* current_entry = parent_entry;
                    if (!current_entry) {
                        for (const TimeStatsEntry* e : all_entries) {
                            if (e->key == key) {
                                current_entry = e;
                                break;
                            }
                        }
                    }

                    for (const auto& child : children_map[key]) {
                        // Include ALL children, even multi-parent ones
                        // They'll be marked with [shared] when displayed
                        children_vec.push_back(child);

                        // Calculate the appropriate time for this child
                        std::size_t child_time_to_add = 0;

                        if (current_entry && all_stats[child].per_parent_stats.contains(current_entry)) {
                            // Use parent-specific time if available
                            child_time_to_add = all_stats[child].per_parent_stats[current_entry].first;
                        } else if (all_stats[child].parents.size() == 1) {
                            // For single-parent children, use total time
                            child_time_to_add = all_stats[child].time;
                        } else if (!visited.contains(child)) {
                            // For multi-parent children not yet visited, use total time
                            // (this shouldn't happen often in practice)
                            child_time_to_add = all_stats[child].time;
                        }
                        // For multi-parent children already visited without parent info, don't add time

                        children_total_time += child_time_to_add;
                    }

                    // Sort children by time
                    std::ranges::sort(children_vec, [&](const auto& a, const auto& b) {
                        return all_stats[a].time > all_stats[b].time;
                    });

                    // Check if we need an "other" entry for unaccounted time
                    // Use display_info.time which has been adjusted for parent-specific context
                    std::size_t parent_time = display_info.time;
                    bool need_other = false;
                    std::size_t other_time = 0;

                    if (parent_time > children_total_time) {
                        other_time = parent_time - children_total_time;
                        // Only show "other" if it's more than 1% of parent time or > 1ms
                        double other_ms = static_cast<double>(other_time) / 1000000.0;
                        if (other_ms > 1.0 || (other_time > parent_time / 100)) {
                            need_other = true;
                        }
                    }

                    // Print children (passing current entry's time as parent time and current entry as parent)
                    for (size_t i = 0; i < children_vec.size(); ++i) {
                        // Always allow multi-parent entries without children to be printed multiple times
                        bool allow_reprint = all_stats[children_vec[i]].parents.size() > 1;
                        bool is_last_child = (i == children_vec.size() - 1) && !need_other;
                        print_hierarchy(children_vec[i],
                                        indent_level + 1,
                                        visited,
                                        is_last_child,
                                        allow_reprint,
                                        display_info.time, // Use parent-specific time, not total
                                        current_entry);
                    }

                    // Print "other" entry if needed
                    if (need_other) {
                        // Create a synthetic entry for unaccounted time
                        std::string indent_str((indent_level + 1) * 2, ' ');
                        double time_ms = static_cast<double>(other_time) / 1000000.0;
                        auto colors = get_time_colors(time_ms);
                        size_t name_width = std::max<size_t>(30, 70 - indent_str.length() - 4); // 4 for "└─ "

                        os << indent_str << "└─ " << colors.name_color << Colors::ITALIC << std::left
                           << std::setw(static_cast<int>(name_width)) << "(other)" << Colors::RESET << "  "
                           << colors.time_color << format_time_aligned(time_ms) << Colors::RESET
                           << format_percentage(static_cast<double>(other_time),
                                                static_cast<double>(display_info.time)) // Use parent-specific time
                           << "\n";
                    }
                }
            }
        };

    // Print header
    os << "\n";
    print_separator(os, true);
    os << Colors::BOLD << "  Hierarchical Benchmark Results" << Colors::RESET << "\n";
    print_separator(os, true);
    os << "\n";

    // Sort roots by time
    std::vector<std::pair<std::string, std::size_t>> sorted_roots;
    sorted_roots.reserve(roots.size());
    for (const auto& root : roots) {
        sorted_roots.push_back({ root, all_stats[root].time });
    }
    std::ranges::sort(sorted_roots, [](const auto& a, const auto& b) { return a.second > b.second; });

    // Print hierarchies starting from roots
    std::set<std::string> visited;
    for (size_t i = 0; i < sorted_roots.size(); ++i) {
        print_hierarchy(sorted_roots[i].first, 0, visited, i == sorted_roots.size() - 1, false, 0, nullptr);
    }

    // Print any unvisited entries (typically shared functions that were skipped in main hierarchy)
    std::vector<std::string> unvisited_keys;
    for (const auto& [key, info] : all_stats) {
        if (!visited.contains(key)) {
            unvisited_keys.push_back(key);
        }
    }

    // Sort unvisited entries by time
    std::ranges::sort(unvisited_keys,
                      [&](const auto& a, const auto& b) { return all_stats[a].time > all_stats[b].time; });

    // Print shared functions section if there are any
    if (!unvisited_keys.empty()) {
        os << "\n";
        os << Colors::DIM
           << "Note: Functions below appear in multiple contexts. Times shown are totals across all contexts."
           << Colors::RESET << "\n";
        os << "\n";
    }

    for (size_t i = 0; i < unvisited_keys.size(); ++i) {
        const auto& key = unvisited_keys[i];
        // For shared functions at root level without parent context,
        // just print them without children to avoid misleading percentages
        print_stat_tree(key, all_stats[key], 0, i == unvisited_keys.size() - 1, 0);
        visited.insert(key);
    }

    // Print summary
    os << "\n";
    os << Colors::BOLD << Colors::CYAN
       << "───────────────────────────────────────────────────────────────────────────────" << Colors::RESET << "\n";

    // Calculate totals
    std::size_t total_time = 0;
    std::size_t total_calls = 0;
    std::size_t single_parent_count = 0;
    std::size_t multi_parent_count = 0;

    for (const auto& [_, info] : all_stats) {
        total_calls += info.count;
        total_time += info.time;
        if (info.parents.size() == 1) {
            single_parent_count++;
        } else if (info.parents.size() > 1) {
            multi_parent_count++;
        }
    }

    double total_time_ms = static_cast<double>(total_time) / 1000000.0;
    os << "  " << Colors::BOLD << "Total: " << Colors::RESET << Colors::MAGENTA << all_stats.size() << " functions"
       << Colors::RESET;

    if (single_parent_count > 0 || multi_parent_count > 0) {
        os << " (" << single_parent_count << " nested";
        if (multi_parent_count > 0) {
            os << ", " << multi_parent_count << " shared";
        }
        os << ")";
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

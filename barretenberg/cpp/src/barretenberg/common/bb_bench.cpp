#ifndef __wasm__
#include "bb_bench.hpp"
#include <chrono>
#include <iostream>
#include <ostream>
#include <sstream>
#include <thread>

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
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "print_op_counts() START" << std::endl;
    for (const TimeStatsEntry& entry : counts) {
        print_stats_recursive(entry.key, &entry.count, entry.thread_id, "");
    }
    std::cout << "print_op_counts() END" << std::endl;
}

void GlobalBenchStatsContainer::print_stats_recursive(const std::string& key,
                                                      const TimeStats* stats,
                                                      const std::string& thread_id,
                                                      const std::string& indent) const
{
    if (stats->count > 0) {
        std::cout << indent << key << "\t" << stats->count << "\t[thread=" << thread_id << "]" << std::endl;
    }
    if (stats->time > 0) {
        std::cout << indent << key << "(t)\t" << static_cast<double>(stats->time) / 1000000.0
                  << "ms\t[thread=" << thread_id << "]" << std::endl;
    }

    if (stats->next) {
        print_stats_recursive(key, stats->next.get(), thread_id, indent + "  ");
    }
}

std::map<std::string, std::size_t> GlobalBenchStatsContainer::get_aggregate_counts() const
{
    std::map<std::string, std::size_t> aggregate_counts;
    for (const TimeStatsEntry& entry : counts) {
        aggregate_stats_recursive(entry.key, &entry.count, aggregate_counts);
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

    if (stats->next) {
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
            os << std::endl << std::string(indent, ' ');
        }
        os << '"' << key << "\":" << value;
        first = false;
    }
    if (indent > 0) {
        os << std::endl;
    }
    os << '}' << std::endl;
}

void GlobalBenchStatsContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (TimeStatsEntry& entry : counts) {
        entry.count = TimeStats();
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

BenchReporter::BenchReporter(TimeStatsEntry* entry)
    : stats(entry ? &entry->count : nullptr)
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
    stats->track(parent, static_cast<std::size_t>(now_ns.time_since_epoch().count()) - time);

    // Unwind to previous parent
    GlobalBenchStatsContainer::parent = parent;
}
} // namespace bb::detail
#endif

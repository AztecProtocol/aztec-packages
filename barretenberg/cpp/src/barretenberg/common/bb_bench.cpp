#ifndef __wasm__
#include "bb_bench.hpp"
#include <iostream>
#include <ostream>
#include <sstream>
#include <thread>

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_bb_bench =
    std::getenv("BB_use_bb_bench") == nullptr ? false : std::string(std::getenv("BB_use_bb_bench")) == "1";

GlobalBenchStatsContainer::~GlobalBenchStatsContainer()
{
    // This is useful for printing counts at the end of non-benchmarks.
    // See op_count_google_bench.hpp for benchmarks.
    // print();
}

void GlobalBenchStatsContainer::add_entry(const char* key, const std::shared_ptr<TimeStats>& count)
{
    std::unique_lock<std::mutex> lock(mutex);
    std::stringstream ss;
    ss << std::this_thread::get_id();
    counts.push_back({ key, ss.str(), count });
}

void GlobalBenchStatsContainer::print() const
{
    std::cout << "print_op_counts() START" << std::endl;
    for (const Entry& entry : counts) {
        if (entry.count->count > 0) {
            std::cout << entry.key << "\t" << entry.count->count << "\t[thread=" << entry.thread_id << "]" << std::endl;
        }
        if (entry.count->time > 0) {
            std::cout << entry.key << "(t)\t" << static_cast<double>(entry.count->time) / 1000000.0
                      << "ms\t[thread=" << entry.thread_id << "]" << std::endl;
        }
    }
    std::cout << "print_op_counts() END" << std::endl;
}

std::map<std::string, std::size_t> GlobalBenchStatsContainer::get_aggregate_counts() const
{
    std::map<std::string, std::size_t> aggregate_counts;
    for (const Entry& entry : counts) {
        if (entry.count->count > 0) {
            aggregate_counts[entry.key] += entry.count->count;
        }
        if (entry.count->time > 0) {
            aggregate_counts[entry.key + "(t)"] += entry.count->time;
        }
    }
    return aggregate_counts;
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
    for (Entry& entry : counts) {
        *entry.count = TimeStats();
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalBenchStatsContainer GLOBAL_BENCH_STATS;

BenchReporter::BenchReporter(TimeStats* stats)
    : stats(stats)
{
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    time = static_cast<std::size_t>(now_ns.time_since_epoch().count());
}
BenchReporter::~BenchReporter()
{
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    stats->count += 1;
    stats->time += static_cast<std::size_t>(now_ns.time_since_epoch().count()) - time;
}
} // namespace bb::detail
#endif

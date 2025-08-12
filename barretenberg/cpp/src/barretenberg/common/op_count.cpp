
#ifndef __wasm__
#include "op_count.hpp"
#include <fstream>
#include <iostream>
#include <sstream>
#include <thread>

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_op_count_time =
    std::getenv("BB_USE_OP_COUNT_TIME") == nullptr ? false : std::string(std::getenv("BB_USE_OP_COUNT_TIME")) == "1";

GlobalOpCountContainer::~GlobalOpCountContainer()
{
    // This is useful for printing counts at the end of non-benchmarks.
    // See op_count_google_bench.hpp for benchmarks.
    // print();
}

void GlobalOpCountContainer::add_entry(const char* key, const std::shared_ptr<OpStats>& count)
{
    std::unique_lock<std::mutex> lock(mutex);
    std::stringstream ss;
    ss << std::this_thread::get_id();
    counts.push_back({ key, ss.str(), count });
}

void GlobalOpCountContainer::print() const
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

std::map<std::string, std::size_t> GlobalOpCountContainer::get_aggregate_counts() const
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

void GlobalOpCountContainer::print_aggregate_counts() const
{
    std::cout << "{\"benchmarks\":[{";
    bool first = true;
    for (const auto& [key, value] : get_aggregate_counts()) {
        if (!first) {
            std::cout << ",";
        }
        std::cout << "\"" << key << "\":" << value;
        first = false;
    }
    std::cout << "}]}" << std::endl;
}

void GlobalOpCountContainer::write_aggregate_counts(const std::string& filename) const
{
    std::ofstream os(filename);
    auto print_indent = [&](size_t level) { os << std::string(level * 2, ' '); };

    os << "{\n";
    print_indent(1);
    os << "\"benchmarks\": [\n";
    print_indent(2);
    os << "{\n";
    size_t count = 0;
    std::map<std::string, size_t> data = get_aggregate_counts();
    for (auto it = data.begin(); it != data.end(); ++it, ++count) {
        print_indent(3);
        os << "\"" << it->first << "\": " << it->second;
        if (std::next(it) != data.end())
            os << ",";
        os << "\n";
    }
    print_indent(2);
    os << "}\n";
    print_indent(1);
    os << "]\n";
    os << "}" << std::endl;
}

void GlobalOpCountContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (Entry& entry : counts) {
        *entry.count = OpStats();
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalOpCountContainer GLOBAL_OP_COUNTS;

OpCountTimeReporter::OpCountTimeReporter(OpStats* stats)
    : stats(stats)
{
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    time = static_cast<std::size_t>(now_ns.time_since_epoch().count());
}
OpCountTimeReporter::~OpCountTimeReporter()
{
    auto now = std::chrono::high_resolution_clock::now();
    auto now_ns = std::chrono::time_point_cast<std::chrono::nanoseconds>(now);
    stats->count += 1;
    stats->time += static_cast<std::size_t>(now_ns.time_since_epoch().count()) - time;
}
} // namespace bb::detail
#endif

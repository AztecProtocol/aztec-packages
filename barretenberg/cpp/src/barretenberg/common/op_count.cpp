
#pragma once
#ifndef NO_OP_COUNTS
#include "op_count.hpp"
#include <iostream>
#include <sstream>
#include <thread>

namespace {
void print_op_counts()
{
    __GLOBAL_OP_COUNTS.print();
}
} // namespace

GlobalOpCountContainer::GlobalOpCountContainer()
{
    (void)std::atexit(print_op_counts);
}

void GlobalOpCountContainer::add_entry(const char* key, const std::size_t* count)
{
    std::unique_lock<std::mutex> lock(mutex);
    std::stringstream ss;
    ss << std::this_thread::get_id();
    counts.push_back({ key, ss.str(), count });
}

void GlobalOpCountContainer::print() const
{
    for (const Entry& entry : counts) {
        std::cout << entry.key << ": " << entry.count << "@" << entry.thread_id << std::endl;
    }
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalOpCountContainer __GLOBAL_OP_COUNTS;

#endif


#ifndef NO_OP_COUNTS
#include "op_count.hpp"
#include <iostream>
#include <sstream>
#include <thread>

namespace {
void print_op_counts()
{
    std::cout << "print_op_counts() START" << std::endl;
    bb::detail::GLOBAL_OP_COUNTS.print();
    std::cout << "print_op_counts() END" << std::endl;
}
} // namespace

namespace bb::detail {
GlobalOpCountContainer::~GlobalOpCountContainer()
{
    print_op_counts();
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
        std::cout << entry.key << "\t" << *entry.count << "\t[thread=" << entry.thread_id << "]" << std::endl;
    }
}

void GlobalOpCountContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    counts.clear();
}

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
GlobalOpCountContainer GLOBAL_OP_COUNTS;
} // namespace bb::detail
#endif

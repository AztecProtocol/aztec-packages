
#pragma once
#include <cstdlib>
#include <string>

#ifdef NO_OP_COUNTS
// require a semicolon to appease formatters
#define INCREMENT_OP_COUNT() (void)0
#else
/**
 * Provides an abstraction that counts operations based on function names.
 * For efficiency, we spread out counts across threads.
 */

#include "barretenberg/common/compiler_hints.hpp"
#include <algorithm>
#include <atomic>
#include <mutex>
#include <vector>
template <std::size_t N> struct OperationLabel {
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    constexpr OperationLabel(const char (&str)[N]) { std::copy_n(str, str + N, value); }

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    char value[N];
};

// Contains all statically known op counts
struct GlobalOpCountContainer {
  public:
    struct Entry {
        const char* key;
        std::string thread_id;
        const std::size_t* count;
    };
    GlobalOpCountContainer();
    std::mutex mutex;
    std::vector<Entry> counts;
    void print() const;
    void add_entry(const char* key, const std::size_t* count);
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern GlobalOpCountContainer __GLOBAL_OP_COUNTS;

template <OperationLabel Op> struct GlobalOpCount {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static std::atomic_size_t global_count;
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    // static std::mutex thread_counts_mutex;
    // // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    // static std::vector<ThreadOpCount<Op>*> thread_counts;
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static thread_local std::size_t* thread_local_count;

    static void increment_op_count()
    {
        if (BB_UNLIKELY(thread_local_count == nullptr)) {
            thread_local_count = new std::size_t();
            __GLOBAL_OP_COUNTS.add_entry(Op.value, thread_local_count);
        }
        (*thread_local_count)++;
    }
};

// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define INCREMENT_OP_COUNT() GlobalOpCount<__func__>::increment_op_count()
#endif
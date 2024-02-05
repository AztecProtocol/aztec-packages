
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
namespace bb::detail {
template <std::size_t N> struct OperationLabel {
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    constexpr OperationLabel(const char (&str)[N])
    {
        for (std::size_t i = 0; i != N; ++i) {
            value[i] = str[i];
        }
    }

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
extern GlobalOpCountContainer GLOBAL_OP_COUNTS;

template <OperationLabel Op> struct GlobalOpCount {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static thread_local std::size_t* thread_local_count;

    static constexpr void increment_op_count()
    {
        if (std::is_constant_evaluated()) {
            // We do nothing if the compiler tries to run this
            return;
        }
        if (BB_UNLIKELY(thread_local_count == nullptr)) {
            thread_local_count = new std::size_t();
            GLOBAL_OP_COUNTS.add_entry(Op.value, thread_local_count);
        }
        (*thread_local_count)++;
    }
};
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
template <OperationLabel Op> thread_local std::size_t* GlobalOpCount<Op>::thread_local_count;

} // namespace bb::detail

// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define INCREMENT_OP_COUNT() bb::detail::GlobalOpCount<__func__>::increment_op_count()
#endif

#pragma once

#include <memory>
#include <ostream>
#include <tracy/Tracy.hpp>

#ifdef TRACY_INSTRUMENTED
#define PROFILE_THIS() ZoneScopedN(__func__)
#define PROFILE_THIS_NAME(name) ZoneScopedN(name)
#elif defined __wasm__
#define PROFILE_THIS() (void)0
#define PROFILE_THIS_NAME(name) (void)0
#else
#define PROFILE_THIS() BB_OP_COUNT_TIME_NAME(__func__)
#define PROFILE_THIS_NAME(name) BB_OP_COUNT_TIME_NAME(name)
#endif

#ifdef __wasm__
// require a semicolon to appease formatters
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_OP_COUNT_TIME_NAME(name) (void)0
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_OP_COUNT_TIME() (void)0
#else
/**
 * Provides an abstraction that counts operations based on function names.
 * For efficiency, we spread out counts across threads.
 */

#include "barretenberg/common/compiler_hints.hpp"
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
namespace bb::detail {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool use_op_count_time;

// Compile-time string
// See e.g. https://www.reddit.com/r/cpp_questions/comments/pumi9r/does_c20_not_support_string_literals_as_template/
template <std::size_t N> struct OperationLabel {
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    constexpr OperationLabel(const char (&str)[N])
    {
        for (std::size_t i = 0; i < N; ++i) {
            value[i] = str[i];
        }
    }

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    char value[N];
};

struct OpStats {
    std::size_t count = 0;
    std::size_t time = 0;
};

// Contains all statically known op counts
struct GlobalOpCountContainer {
  public:
    struct Entry {
        std::string key;
        std::string thread_id;
        std::shared_ptr<OpStats> count;
    };
    ~GlobalOpCountContainer();
    std::mutex mutex;
    std::vector<Entry> counts;
    void print() const;
    // NOTE: Should be called when other threads aren't active
    void clear();
    void add_entry(const char* key, const std::shared_ptr<OpStats>& count);
    std::map<std::string, std::size_t> get_aggregate_counts() const;
    void print_aggregate_counts(std::ostream&, size_t) const;
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern GlobalOpCountContainer GLOBAL_OP_COUNTS;

template <OperationLabel Op> struct GlobalOpCount {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static thread_local std::shared_ptr<OpStats> stats;

    static OpStats* ensure_stats()
    {
        if (BB_UNLIKELY(stats == nullptr)) {
            stats = std::make_shared<OpStats>();
            GLOBAL_OP_COUNTS.add_entry(Op.value, stats);
        }
        return stats.get();
    }
    static constexpr void increment_op_count()
    {
        if (std::is_constant_evaluated()) {
            // We do nothing if the compiler tries to run this
            return;
        }
        ensure_stats();
        stats->count++;
    }
    static constexpr void add_clock_time(std::size_t time)
    {
        if (std::is_constant_evaluated()) {
            // We do nothing if the compiler tries to run this
            return;
        }
        ensure_stats();
        stats->time += time;
    }
};
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
template <OperationLabel Op> thread_local std::shared_ptr<OpStats> GlobalOpCount<Op>::stats;

// NOLINTNEXTLINE(cppcoreguidelines-special-member-functions)
struct OpCountTimeReporter {
    OpStats* stats;
    std::size_t time;
    OpCountTimeReporter(OpStats* stats);
    ~OpCountTimeReporter();
};
} // namespace bb::detail

// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_OP_COUNT_TIME_NAME(name)                                                                                    \
    std::optional<bb::detail::OpCountTimeReporter> __bb_op_count_time;                                                 \
    if (bb::detail::use_op_count_time)                                                                                 \
    __bb_op_count_time.emplace(bb::detail::GlobalOpCount<name>::ensure_stats())
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_OP_COUNT_TIME() BB_OP_COUNT_TIME_NAME(__func__)
#endif

#pragma once

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <sstream>

// Enable this for (VERY SLOW) stats on which asserts are hit the most. Note that the time measured will be very
// inaccurate, but you can still see what is called too often to be in a release build.
// #define BB_BENCH_ASSERT(x) BB_BENCH_NAME(x)
#define BB_BENCH_ASSERT(x)

namespace bb {
enum class AssertMode : std::uint8_t { ABORT, WARN };
AssertMode& get_assert_mode();
void assert_failure(std::string const& err);

// NOTE do not use in threaded contexts!
struct AssertGuard {
    AssertGuard(AssertMode mode)
        : previous_mode(get_assert_mode())
    {
        get_assert_mode() = mode;
    }
    ~AssertGuard() { get_assert_mode() = (previous_mode); }
    AssertMode previous_mode;
};
} // namespace bb

// NOTE do not use in threaded contexts!
#define BB_DISABLE_ASSERTS() bb::AssertGuard __bb_assert_guard(bb::AssertMode::WARN)

// NOLINTBEGIN
// Compiler should optimize this out in release builds, without triggering unused-variable warnings.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

#if NDEBUG

// All assertion macros accept an optional message but do nothing in release.
#define ASSERT_DEBUG(expression, ...) DONT_EVALUATE((expression))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

// Basic assert with optional error message
#define ASSERT_DEBUG(expression, ...) ASSERT(expression, __VA_ARGS__)
#endif // NDEBUG

#ifdef __wasm__
#define ASSERT_IN_CONSTEXPR(expression, ...) DONT_EVALUATE((expression))
#define ASSERT(expression, ...) DONT_EVALUATE((expression))

#define BB_ASSERT_EQ(actual, expected, ...) DONT_EVALUATE((actual) == (expected))
#define BB_ASSERT_NEQ(actual, expected, ...) DONT_EVALUATE((actual) != (expected))
#define BB_ASSERT_GT(left, right, ...) DONT_EVALUATE((left) > (right))
#define BB_ASSERT_GTE(left, right, ...) DONT_EVALUATE((left) >= (right))
#define BB_ASSERT_LT(left, right, ...) DONT_EVALUATE((left) < (right))
#define BB_ASSERT_LTE(left, right, ...) DONT_EVALUATE((left) <= (right))
#else
#define ASSERT_IN_CONSTEXPR(expression, ...)                                                                           \
    do {                                                                                                               \
        if (!(BB_LIKELY(expression))) {                                                                                \
            info("Assertion failed: (" #expression ")");                                                               \
            __VA_OPT__(info("Reason   : ", __VA_ARGS__);)                                                              \
            bb::assert_failure("");                                                                                    \
        }                                                                                                              \
    } while (0)

#define ASSERT(expression, ...)                                                                                        \
    do {                                                                                                               \
        BB_BENCH_ASSERT("ASSERT" #expression);                                                                         \
        if (!(BB_LIKELY(expression))) {                                                                                \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #expression ")";                                                              \
            __VA_OPT__(oss << " | Reason: " << __VA_ARGS__;)                                                           \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_EQ(actual, expected, ...)                                                                            \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_EQ" #actual " == " #expected);                                                      \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(BB_LIKELY(_actual == _expected))) {                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #actual " == " #expected ")\n";                                               \
            oss << "  Actual  : " << _actual << "\n";                                                                  \
            oss << "  Expected: " << _expected;                                                                        \
            __VA_OPT__(oss << "\n  Reason  : " << __VA_ARGS__;)                                                        \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_NEQ(actual, expected, ...)                                                                           \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_NEQ" #actual " != " #expected);                                                     \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(BB_LIKELY(_actual != _expected))) {                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #actual " != " #expected ")\n";                                               \
            oss << "  Actual  : " << _actual << "\n";                                                                  \
            oss << "  Not expected: " << _expected;                                                                    \
            __VA_OPT__(oss << "\n  Reason  : " << __VA_ARGS__;)                                                        \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT(left, right, ...)                                                                                 \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_GT" #left " > " #right);                                                            \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(BB_LIKELY(_left > _right))) {                                                                            \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " > " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GTE(left, right, ...)                                                                                \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_GTE" #left " >= " #right);                                                          \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(BB_LIKELY(_left >= _right))) {                                                                           \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " >= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LT(left, right, ...)                                                                                 \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_LT" #left " < " #right);                                                            \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(BB_LIKELY(_left < _right))) {                                                                            \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " < " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LTE(left, right, ...)                                                                                \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_LTE" #left " <= " #right);                                                          \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(BB_LIKELY(_left <= _right))) {                                                                           \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " <= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)
#endif // __wasm__

// These are used in tests.
#ifdef BB_NO_EXCEPTIONS
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_DEATH(statement, matcher)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_DEATH(statement, matcher)
#else
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_THROW(statement, std::runtime_error)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_THROW(statement, std::runtime_error)
#endif // BB_NO_EXCEPTIONS
// NOLINTEND

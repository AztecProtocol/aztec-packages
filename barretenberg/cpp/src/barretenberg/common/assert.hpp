#pragma once

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <regex>
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
#define BB_ASSERT_DEBUG(expression, ...) DONT_EVALUATE((expression))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

// Basic assert with optional error message
#define BB_ASSERT_DEBUG(expression, ...) BB_ASSERT(expression, __VA_ARGS__)
#endif // NDEBUG

#ifdef FUZZING_DISABLE_WARNINGS
#define BB_ASSERT(expression, ...)                                                                                     \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT" #expression);                                                                      \
        if (!(BB_LIKELY(expression))) {                                                                                \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #expression ")";                                                              \
            __VA_OPT__(oss << "\nReason   : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)
#else
#define BB_ASSERT(expression, ...)                                                                                     \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT" #expression);                                                                      \
        if (!(BB_LIKELY(expression))) {                                                                                \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #expression ")";                                                              \
            __VA_OPT__(oss << "\nReason   : " << __VA_ARGS__;)                                                         \
            info(oss.str());                                                                                           \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)
#endif

#define BB_ASSERT_EQ(actual, expected, ...)                                                                            \
    do {                                                                                                               \
        BB_BENCH_ASSERT("BB_ASSERT_EQ" #actual " == " #expected);                                                      \
        const auto& _actual = (actual);                                                                                \
        const auto& _expected = (expected);                                                                            \
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
        const auto& _actual = (actual);                                                                                \
        const auto& _expected = (expected);                                                                            \
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
        const auto& _left = (left);                                                                                    \
        const auto& _right = (right);                                                                                  \
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
        const auto& _left = (left);                                                                                    \
        const auto& _right = (right);                                                                                  \
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
        const auto& _left = (left);                                                                                    \
        const auto& _right = (right);                                                                                  \
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
        const auto& _left = (left);                                                                                    \
        const auto& _right = (right);                                                                                  \
        if (!(BB_LIKELY(_left <= _right))) {                                                                           \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " <= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            bb::assert_failure(oss.str());                                                                             \
        }                                                                                                              \
    } while (0)

// BB_ASSERT_NO_WASM: Use this for asserts that are too expensive to run in WASM
// (e.g., asserts inside hot loops or with expensive computations)
#ifdef __wasm__
#define BB_ASSERT_NO_WASM(expression, ...) DONT_EVALUATE((expression))
#define BB_ASSERT_EQ_NO_WASM(actual, expected, ...) DONT_EVALUATE((actual) == (expected))
#define BB_ASSERT_LT_NO_WASM(left, right, ...) DONT_EVALUATE((left) < (right))
#else
#define BB_ASSERT_NO_WASM(expression, ...) BB_ASSERT(expression, __VA_ARGS__)
#define BB_ASSERT_EQ_NO_WASM(actual, expected, ...) BB_ASSERT_EQ(actual, expected, __VA_ARGS__)
#define BB_ASSERT_LT_NO_WASM(left, right, ...) BB_ASSERT_LT(left, right, __VA_ARGS__)
#endif

// These are used in tests.
#ifdef BB_NO_EXCEPTIONS
#ifdef __wasm__
// WASI gtest does not expose ASSERT_DEATH / EXPECT_DEATH (process-exit semantics aren't
// available to user code inside the WASM module). Skip the assertion instead — the
// test still executes the surrounding setup, just stops at the death check. Without
// this fallback, every TU that includes a death-style assertion fails to compile under
// WASM, which is why only `ecc_tests` currently builds for `test_cmds_wasm_threads` in
// bootstrap.sh.
//
// The `sizeof((void)(statement), 0)` and `(void)sizeof(matcher)` patterns parse the
// arguments without evaluating them, so any locals / typedefs referenced inside the
// death-check expression don't trigger -Wunused warnings at the call site.
#define ASSERT_THROW_OR_ABORT(statement, matcher)                                                                      \
    do {                                                                                                               \
        (void)sizeof((void)(statement), 0);                                                                            \
        (void)sizeof(matcher);                                                                                         \
        GTEST_SKIP() << "death tests unavailable on WASI";                                                             \
    } while (0)
#define EXPECT_THROW_OR_ABORT(statement, matcher)                                                                      \
    do {                                                                                                               \
        (void)sizeof((void)(statement), 0);                                                                            \
        (void)sizeof(matcher);                                                                                         \
        GTEST_SKIP() << "death tests unavailable on WASI";                                                             \
    } while (0)
#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage)                                                               \
    do {                                                                                                               \
        (void)sizeof((void)(code), 0);                                                                                 \
        (void)sizeof(expectedMessage);                                                                                 \
        GTEST_SKIP() << "death tests unavailable on WASI";                                                             \
    } while (0)
#else
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_DEATH(statement, matcher)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_DEATH(statement, matcher)
#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage) EXPECT_DEATH(code, expectedMessage)
#endif
#else
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_THROW(statement, std::runtime_error)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_THROW(statement, std::runtime_error)
#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessageRegex)                                                          \
    try {                                                                                                              \
        code;                                                                                                          \
        FAIL() << "Expected exception with message matching: " << expectedMessageRegex;                                \
    } catch (const std::exception& e) {                                                                                \
        EXPECT_TRUE(std::regex_search(std::string(e.what()), std::regex(expectedMessageRegex)))                        \
            << "Exception message: " << e.what() << "\nExpected to match regex: " << expectedMessageRegex;             \
    }
#endif // BB_NO_EXCEPTIONS
// NOLINTEND

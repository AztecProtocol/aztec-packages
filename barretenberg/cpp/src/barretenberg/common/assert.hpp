#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include <sstream>

// NOLINTBEGIN
#if NDEBUG
// Compiler should optimize this out in release builds, without triggering unused-variable warnings.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

// All assertion macros accept an optional message but do nothing in release.
#define ASSERT_DEBUG_ONLY(expression, ...) DONT_EVALUATE((expression))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

// Basic assert with optional error message
#define ASSERT_DEBUG(expression, ...) ASSERT(expression, __VA_ARGS__)
#endif // NDEBUG

#define ASSERT_IN_CONSTEXPR(expression, ...)                                                                           \
    do {                                                                                                               \
        if (!(expression)) {                                                                                           \
            info("Assertion failed: (" #expression ")");                                                               \
            __VA_OPT__(info("Reason   : ", __VA_ARGS__);)                                                              \
            throw_or_abort("");                                                                                        \
        }                                                                                                              \
    } while (0)

#define ASSERT(expression, ...)                                                                                        \
    do {                                                                                                               \
        if (!(expression)) {                                                                                           \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #expression ")";                                                              \
            __VA_OPT__(oss << " | Reason: " << __VA_ARGS__;)                                                           \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_EQ(actual, expected, ...)                                                                            \
    do {                                                                                                               \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(_actual == _expected)) {                                                                                 \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #actual " == " #expected ")\n";                                               \
            oss << "  Actual  : " << _actual << "\n";                                                                  \
            oss << "  Expected: " << _expected;                                                                        \
            __VA_OPT__(oss << "\n  Reason  : " << __VA_ARGS__;)                                                        \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT(left, right, ...)                                                                                 \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left > _right)) {                                                                                       \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " > " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GTE(left, right, ...)                                                                                \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left >= _right)) {                                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " >= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LT(left, right, ...)                                                                                 \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left < _right)) {                                                                                       \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " < " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LTE(left, right, ...)                                                                                \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left <= _right)) {                                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " <= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

// These are used in tests.
#ifdef BB_NO_EXCEPTIONS
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_DEATH(statement, matcher)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_DEATH(statement, matcher)
#else
#define ASSERT_THROW_OR_ABORT(statement, matcher) ASSERT_THROW(statement, std::runtime_error)
#define EXPECT_THROW_OR_ABORT(statement, matcher) EXPECT_THROW(statement, std::runtime_error)
#endif

// NOLINTEND

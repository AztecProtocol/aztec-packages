#pragma once

// NOLINTBEGIN
#if NDEBUG
// Compiler should optimize this out in release builds, without triggering unused-variable warnings.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

// All assertion macros accept an optional message but do nothing in release.
#define ASSERT_DEBUG_ONLY(expression, ...) DONT_EVALUATE((expression))

#define BB_ASSERT_EQ_DEBUG_ONLY(actual, expected, ...) DONT_EVALUATE((actual) == (expected))
#define BB_ASSERT_GT_DEBUG_ONLY(left, right, ...) DONT_EVALUATE((left) > (right))
#define BB_ASSERT_GTE_DEBUG_ONLY(left, right, ...) DONT_EVALUATE((left) >= (right))
#define BB_ASSERT_LT_DEBUG_ONLY(left, right, ...) DONT_EVALUATE((left) < (right))
#define BB_ASSERT_LTE_DEBUG_ONLY(left, right, ...) DONT_EVALUATE((left) <= (right))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

// Basic assert with optional error message
#define ASSERT_DEBUG_ONLY(expression, ...)                                                                             \
    do {                                                                                                               \
        if (!(expression)) {                                                                                           \
            info("Assertion failed: (" #expression ")");                                                               \
            __VA_OPT__(info("Reason   : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_EQ_DEBUG_ONLY(actual, expected, ...)                                                                 \
    do {                                                                                                               \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(_actual == _expected)) {                                                                                 \
            info("Assertion failed: (" #actual " == " #expected ")");                                                  \
            info("  Actual  : ", _actual);                                                                             \
            info("  Expected: ", _expected);                                                                           \
            __VA_OPT__(info("  Reason  : ", __VA_ARGS__);)                                                             \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT_DEBUG_ONLY(left, right, ...)                                                                      \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left > _right)) {                                                                                       \
            info("Assertion failed: (" #left " > " #right ")");                                                        \
            info("  Left   : ", _left);                                                                                \
            info("  Right  : ", _right);                                                                               \
            __VA_OPT__(info("  Reason : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GTE_DEBUG_ONLY(left, right, ...)                                                                     \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left >= _right)) {                                                                                      \
            info("Assertion failed: (" #left " >= " #right ")");                                                       \
            info("  Left   : ", _left);                                                                                \
            info("  Right  : ", _right);                                                                               \
            __VA_OPT__(info("  Reason : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LT_DEBUG_ONLY(left, right, ...)                                                                      \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left < _right)) {                                                                                       \
            info("Assertion failed: (" #left " < " #right ")");                                                        \
            info("  Left   : ", _left);                                                                                \
            info("  Right  : ", _right);                                                                               \
            __VA_OPT__(info("  Reason : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LTE_DEBUG_ONLY(left, right, ...)                                                                     \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left <= _right)) {                                                                                      \
            info("Assertion failed: (" #left " <= " #right ")");                                                       \
            info("  Left   : ", _left);                                                                                \
            info("  Right  : ", _right);                                                                               \
            __VA_OPT__(info("  Reason : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#endif // NDEBUG

#define ASSERT_RELEASE(expression, ...)                                                                                \
    do {                                                                                                               \
        if (!(expression)) {                                                                                           \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #expression ")";                                                              \
            __VA_OPT__(oss << " | Reason: " << __VA_ARGS__;)                                                           \
            throw_or_abort(oss.str());                                                                                 \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_EQ_RELEASE(actual, expected, ...)                                                                    \
    do {                                                                                                               \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(_actual == _expected)) {                                                                                 \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #actual " == " #expected ")\n";                                               \
            oss << "  Actual  : " << _actual << "\n";                                                                  \
            oss << "  Expected: " << _expected;                                                                        \
            __VA_OPT__(oss << "\n  Reason  : " << __VA_ARGS__;)                                                        \
            throw std::runtime_error(oss.str());                                                                       \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT_RELEASE(left, right, ...)                                                                         \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left > _right)) {                                                                                       \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " > " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw std::runtime_error(oss.str());                                                                       \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GTE_RELEASE(left, right, ...)                                                                        \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left >= _right)) {                                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " >= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw std::runtime_error(oss.str());                                                                       \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LT_RELEASE(left, right, ...)                                                                         \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left < _right)) {                                                                                       \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " < " #right ")\n";                                                     \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw std::runtime_error(oss.str());                                                                       \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_LTE_RELEASE(left, right, ...)                                                                        \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left <= _right)) {                                                                                      \
            std::ostringstream oss;                                                                                    \
            oss << "Assertion failed: (" #left " <= " #right ")\n";                                                    \
            oss << "  Left   : " << _left << "\n";                                                                     \
            oss << "  Right  : " << _right;                                                                            \
            __VA_OPT__(oss << "\n  Reason : " << __VA_ARGS__;)                                                         \
            throw std::runtime_error(oss.str());                                                                       \
        }                                                                                                              \
    } while (0)

// NOLINTEND

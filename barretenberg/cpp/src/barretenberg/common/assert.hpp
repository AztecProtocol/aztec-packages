#pragma once

// NOLINTBEGIN
#if NDEBUG
// Compiler should optimize this out in release builds, without triggering unused-variable warnings.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

// All assertion macros accept an optional message but do nothing in release.
#define ASSERT(expression, ...) DONT_EVALUATE((expression))

#define BB_ASSERT_EQ(actual, expected, ...) DONT_EVALUATE((actual) == (expected))
#define BB_ASSERT_GT(left, right, ...) DONT_EVALUATE((left) > (right))
#define BB_ASSERT_GTE(left, right, ...) DONT_EVALUATE((left) >= (right))
#define BB_ASSERT_LT(left, right, ...) DONT_EVALUATE((left) < (right))
#define BB_ASSERT_LTE(left, right, ...) DONT_EVALUATE((left) <= (right))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

// Basic assert with optional error message
#define ASSERT(expression, ...)                                                                                        \
    do {                                                                                                               \
        if (!(expression)) {                                                                                           \
            info("Assertion failed: (" #expression ")");                                                               \
            __VA_OPT__(info("Reason   : ", __VA_ARGS__);)                                                              \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_EQ(actual, expected, ...)                                                                            \
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

#define BB_ASSERT_GT(left, right, ...)                                                                                 \
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

#define BB_ASSERT_GTE(left, right, ...)                                                                                \
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

#define BB_ASSERT_LT(left, right, ...)                                                                                 \
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

#define BB_ASSERT_LTE(left, right, ...)                                                                                \
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

// NOLINTEND
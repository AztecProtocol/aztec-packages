#pragma once

// NOLINTBEGIN
#if NDEBUG
// Compiler should optimize this out in release builds, without triggering unused-variable warnings.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

#define ASSERT(expression) DONT_EVALUATE((expression))

// All assertion macros accept an optional message but do nothing in release.
#define BB_ASSERT_EQ(actual, expected, ...) DONT_EVALUATE((actual) == (expected))
#define BB_ASSERT_GT(left, right, ...) DONT_EVALUATE((left) > (right))
#define BB_ASSERT_GTE(left, right, ...) DONT_EVALUATE((left) >= (right))

#else
#include "barretenberg/common/log.hpp"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <string>

#define ASSERT(expression) assert((expression))

#define BB_ASSERT_EQ(actual, expected, ...)                                                                            \
    do {                                                                                                               \
        auto _actual = (actual);                                                                                       \
        auto _expected = (expected);                                                                                   \
        if (!(_actual == _expected)) {                                                                                 \
            info("Assertion failed: (" #actual " == " #expected ")" __VA_OPT__(, ) __VA_ARGS__);                       \
            info("  Actual  : ", _actual);                                                                             \
            info("  Expected: ", _expected);                                                                           \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT(left, right, ...)                                                                                 \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left > _right)) {                                                                                       \
            info("Assertion failed: (" #left " > " #right ")" __VA_OPT__(, ) __VA_ARGS__);                             \
            info("  Left  : ", _left);                                                                                 \
            info("  Right : ", _right);                                                                                \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GTE(left, right, ...)                                                                                \
    do {                                                                                                               \
        auto _left = (left);                                                                                           \
        auto _right = (right);                                                                                         \
        if (!(_left >= _right)) {                                                                                      \
            info("Assertion failed: (" #left " >= " #right ")" __VA_OPT__(, ) __VA_ARGS__);                            \
            info("  Left  : ", _left);                                                                                 \
            info("  Right : ", _right);                                                                                \
            std::abort();                                                                                              \
        }                                                                                                              \
    } while (0)

#endif // NDEBUG

// NOLINTEND

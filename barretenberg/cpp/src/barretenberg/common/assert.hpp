#pragma once
#include <cstdio>
#include <cstdlib>

#if NDEBUG
// NOLINTBEGIN
// In NDEBUG mode, no assertion checks are performed.
// Compiler should optimize this out in release builds, without triggering an unused variable warning.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

#define ASSERT(expression) DONT_EVALUATE((expression))
// NOLINTEND
#else

namespace bb::detail {
inline void assert_fail(const char* assertion, const char* file, int line, const char* function)
{
    static bool should_error = std::getenv("BB_ASSERT_WARN") == nullptr;
    if (should_error) {
        fprintf(stderr, "%s:%u: %s: Assertion `%s' failed.\n", file, line, function, assertion);
        /* Terminate execution. */
        abort();
    } else {
        fprintf(stderr, "%s:%u: %s: Assertion `%s' warning (BB_ASSERT_WARN).\n", file, line, function, assertion);
    }
}
} // namespace bb::detail

void bb_assert_fail(const char* assertion, const char* file, int line, const char* function);
#define ASSERT(expr)                                                                                                   \
    (static_cast<bool>((expr)) ? void(0) : bb::detail::assert_fail(#expr, __FILE__, __LINE__, __func__))
#endif // NDEBUG

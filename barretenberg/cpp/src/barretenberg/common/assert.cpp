#include "assert.hpp"
#include <cassert>
#include <cstdio>
#include <cstdlib>

void bb_assert_fail(const char* assertion, const char* file, int line, const char* function)
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

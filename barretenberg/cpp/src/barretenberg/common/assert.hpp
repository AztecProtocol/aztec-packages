#pragma once

#ifdef NDEBUG
// In NDEBUG mode, no assertion checks are performed.
// Compiler should optimize this out in release builds, without triggering an unused variable warning.
#define DONT_EVALUATE(expression)                                                                                      \
    {                                                                                                                  \
        true ? static_cast<void>(0) : static_cast<void>((expression));                                                 \
    }

#define ASSERT(expression) DONT_EVALUATE((expression))

#else
void bb_assert_fail(const char* assertion, const char* file, int line, const char* function);
#define ASSERT(expr) (static_cast<bool>((expr)) ? void(0) : bb_assert_fail(#expr, __FILE__, __LINE__, __func__))
#endif // NDEBUG

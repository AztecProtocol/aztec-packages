/**
 * @file utilities.hpp
 * @brief Common utilities for IPC shared memory implementation
 *
 * Provides timing and CPU pause utilities for spin-wait loops.
 */
#pragma once

#include <cstdint>
#include <time.h> // NOLINT(modernize-deprecated-headers) - need POSIX clock_gettime/CLOCK_MONOTONIC

#if defined(__x86_64__)
#include <immintrin.h>
#define IPC_PAUSE() _mm_pause()
#elif defined(__aarch64__)
#define IPC_PAUSE() asm volatile("yield")
#else
#define IPC_PAUSE()                                                                                                    \
    do {                                                                                                               \
    } while (0)
#endif

namespace ipc {

/**
 * @brief Get current monotonic time in nanoseconds
 *
 * Uses CLOCK_MONOTONIC which is suitable for measuring elapsed time
 * and not affected by system clock adjustments.
 *
 * @return Current monotonic time in nanoseconds, or 0 on error
 */
inline uint64_t mono_ns_now()
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return 0;
    }
    return (static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL) + static_cast<uint64_t>(ts.tv_nsec);
}

} // namespace ipc

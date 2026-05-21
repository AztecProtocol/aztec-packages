/**
 * @file futex.hpp
 * @brief Cross-platform futex-like synchronization primitives
 *
 * Provides unified wait/wake operations for cross-process synchronization:
 * - macOS: Uses os_sync_wait_on_address / os_sync_wake_by_address_any
 * - Linux: Uses futex syscalls
 */
#pragma once

#include <cstdint>
#include <ctime>

#ifdef __APPLE__
// Darwin's os_sync API (available since macOS 10.12 / iOS 10)
// Forward declarations to avoid header dependency
extern "C" {
int os_sync_wait_on_address(void* addr, uint64_t value, size_t size, uint32_t flags);
int os_sync_wait_on_address_with_timeout(
    void* addr, uint64_t value, size_t size, uint32_t flags, uint32_t clockid, uint64_t timeout_ns);
int os_sync_wake_by_address_any(void* addr, size_t size, uint32_t flags);
}
#define OS_SYNC_WAIT_ON_ADDRESS_SHARED 1u
#define OS_SYNC_WAKE_BY_ADDRESS_SHARED 1u
#define OS_CLOCK_MACH_ABSOLUTE_TIME 32u
#else
// Linux futex
#include <cerrno>
#include <linux/futex.h>
#include <sys/syscall.h>
#include <unistd.h>
#endif

namespace bb::ipc {

/**
 * @brief Atomic compare-and-wait operation
 *
 * Blocks if the value at addr equals expect. Works across process boundaries.
 *
 * @param addr Pointer to 32-bit value to wait on
 * @param expect Expected value - blocks if *addr == expect
 * @return 0 on wake, -1 on error
 */
inline int futex_wait(volatile uint32_t* addr, uint32_t expect)
{
#ifdef __APPLE__
    // macOS: Use os_sync_wait_on_address with SHARED flag for cross-process
    return os_sync_wait_on_address(
        const_cast<uint32_t*>(addr), static_cast<uint64_t>(expect), sizeof(uint32_t), OS_SYNC_WAIT_ON_ADDRESS_SHARED);
#else
    // Linux futex
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAIT, expect, nullptr, nullptr, 0));
#endif
}

/**
 * @brief Atomic compare-and-wait operation with timeout
 *
 * Blocks if the value at addr equals expect, but only for up to timeout_ns nanoseconds.
 * Works across process boundaries.
 *
 * @param addr Pointer to 32-bit value to wait on
 * @param expect Expected value - blocks if *addr == expect
 * @param timeout_ns Maximum time to wait in nanoseconds (0 = return immediately if value matches)
 * @return 0 on wake, -1 on error (check errno for ETIMEDOUT on timeout)
 */
inline int futex_wait_timeout(volatile uint32_t* addr, uint32_t expect, uint64_t timeout_ns)
{
#ifdef __APPLE__
    // macOS: Use os_sync_wait_on_address_with_timeout with SHARED flag for cross-process
    // Uses MACH_ABSOLUTE_TIME clock (monotonic, measures time since boot)
    return os_sync_wait_on_address_with_timeout(const_cast<uint32_t*>(addr),
                                                static_cast<uint64_t>(expect),
                                                sizeof(uint32_t),
                                                OS_SYNC_WAIT_ON_ADDRESS_SHARED,
                                                OS_CLOCK_MACH_ABSOLUTE_TIME,
                                                timeout_ns);
#else
    // Linux futex with timeout
    struct timespec timeout = { .tv_sec = static_cast<time_t>(timeout_ns / 1000000000ULL),
                                .tv_nsec = static_cast<long>(timeout_ns % 1000000000ULL) };
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAIT, expect, &timeout, nullptr, 0));
#endif
}

/**
 * @brief Wake waiters blocked on an address
 *
 * Wakes up to n waiters blocked on addr. Works across process boundaries.
 *
 * @param addr Pointer to 32-bit value to wake on
 * @param n Number of waiters to wake (1 for single, INT_MAX for all)
 * @return Number of waiters woken, or -1 on error
 */
inline int futex_wake(volatile uint32_t* addr, int n)
{
#ifdef __APPLE__
    // macOS: Use os_sync_wake_by_address with SHARED flag for cross-process
    (void)n;
    return os_sync_wake_by_address_any(const_cast<uint32_t*>(addr), sizeof(uint32_t), OS_SYNC_WAKE_BY_ADDRESS_SHARED);
#else
    // Linux futex
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAKE, n, nullptr, nullptr, 0));
#endif
}

} // namespace bb::ipc

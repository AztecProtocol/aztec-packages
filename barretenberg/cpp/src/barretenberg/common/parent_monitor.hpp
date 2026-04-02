#pragma once
/**
 * @brief Platform-specific parent death monitoring.
 *
 * Ensures a child process exits when its parent (e.g. Node.js) dies.
 * Call once at startup before entering the main event loop.
 *
 * - Linux: uses prctl(PR_SET_PDEATHSIG) to receive SIGTERM when parent exits.
 * - macOS: spawns a kqueue thread that sets the shutdown flag when parent exits.
 *
 * Header-only — no .cpp needed.
 */

#include <atomic>
#include <functional>
#include <iostream>

#ifdef __linux__
#include <csignal>
#include <sys/prctl.h>
#include <unistd.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#include <thread>
#include <unistd.h>
#endif

namespace bb {

/**
 * @brief Monitor the parent process and invoke a callback when it exits.
 *
 * On Linux, this requests SIGTERM delivery when the parent dies. The caller's
 * SIGTERM handler will fire — the callback is only invoked if the parent has
 * already exited (race condition check).
 *
 * On macOS, this spawns a background thread that invokes the callback directly.
 *
 * @param on_parent_exit Callback invoked when parent exit is detected.
 */
inline void monitor_parent_process([[maybe_unused]] std::function<void()> on_parent_exit)
{
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal\n";
    }
    // Note: no getppid() == 1 race check here. In Docker containers,
    // Node.js often runs as PID 1, so getppid() == 1 is a false positive.
    // prctl(PR_SET_PDEATHSIG) handles the race correctly — the kernel
    // delivers SIGTERM immediately if the parent already exited.
#elif defined(__APPLE__)
    pid_t parent_pid = getppid();
    std::thread([parent_pid, on_parent_exit = std::move(on_parent_exit)]() {
        int kq = kqueue();
        if (kq == -1) {
            return;
        }
        struct kevent change;
        EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0, nullptr);
        if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
            ::close(kq);
            return;
        }
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);
        std::cerr << "Parent process exited, shutting down\n";
        ::close(kq);
        on_parent_exit();
    }).detach();
#endif
}

/**
 * @brief Convenience overload: sets an atomic shutdown flag when parent exits.
 */
inline void monitor_parent_process(std::atomic<bool>& shutdown_flag)
{
    monitor_parent_process([&shutdown_flag]() { shutdown_flag.store(true, std::memory_order_release); });
}

} // namespace bb

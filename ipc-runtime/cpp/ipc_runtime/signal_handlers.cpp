#include "ipc_runtime/signal_handlers.hpp"

#include <atomic>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sys/mman.h>
#include <unistd.h>

#if defined(__linux__)
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#include <thread>
#else
#error "ipc-runtime supports Linux and macOS only"
#endif

namespace ipc {

namespace {

// File-scope pointer used by signal handlers. Atomic so handler execution
// (which may interrupt main() at any point) observes a consistent value.
std::atomic<IpcServer*> g_signal_server{ nullptr };

// Filesystem artifacts to remove on a fatal signal, cached as fixed-size
// C strings at install time. The fatal handler may only use
// async-signal-safe calls, so no std::string / allocation there.
constexpr size_t MAX_CLEANUP_PATHS = 32;
constexpr size_t MAX_CLEANUP_PATH_LEN = 256;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
char g_unlink_paths[MAX_CLEANUP_PATHS][MAX_CLEANUP_PATH_LEN];
size_t g_num_unlink_paths = 0;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
char g_shm_unlink_names[MAX_CLEANUP_PATHS][MAX_CLEANUP_PATH_LEN];
size_t g_num_shm_unlink_names = 0;

void cache_cleanup_paths(const IpcServer& server)
{
    auto paths = server.cleanup_paths();
    g_num_unlink_paths = 0;
    for (const auto& p : paths.unlink_paths) {
        if (g_num_unlink_paths >= MAX_CLEANUP_PATHS || p.size() >= MAX_CLEANUP_PATH_LEN) {
            continue;
        }
        std::strncpy(g_unlink_paths[g_num_unlink_paths], p.c_str(), MAX_CLEANUP_PATH_LEN - 1);
        g_unlink_paths[g_num_unlink_paths][MAX_CLEANUP_PATH_LEN - 1] = '\0';
        g_num_unlink_paths++;
    }
    g_num_shm_unlink_names = 0;
    for (const auto& p : paths.shm_unlink_names) {
        if (g_num_shm_unlink_names >= MAX_CLEANUP_PATHS || p.size() >= MAX_CLEANUP_PATH_LEN) {
            continue;
        }
        std::strncpy(g_shm_unlink_names[g_num_shm_unlink_names], p.c_str(), MAX_CLEANUP_PATH_LEN - 1);
        g_shm_unlink_names[g_num_shm_unlink_names][MAX_CLEANUP_PATH_LEN - 1] = '\0';
        g_num_shm_unlink_names++;
    }
}

void write_stderr_signal_safe(const char* message, size_t len)
{
    ssize_t written = ::write(STDERR_FILENO, message, len);
    (void)written;
}

void graceful_shutdown_handler([[maybe_unused]] int signal)
{
    constexpr char message[] = "\nReceived shutdown signal\n";
    write_stderr_signal_safe(message, sizeof(message) - 1);
    if (auto* s = g_signal_server.load(std::memory_order_acquire); s != nullptr) {
        s->request_shutdown_from_signal();
    }
}

void fatal_error_handler(int signal)
{
    constexpr char message[] = "\nFatal IPC runtime signal\n";
    write_stderr_signal_safe(message, sizeof(message) - 1);
    // Best-effort removal of the socket file / SHM segments so a crashed
    // server doesn't leak them. unlink() is async-signal-safe; shm_unlink()
    // is a thin syscall wrapper and safe in practice (and we are about to
    // _Exit anyway).
    for (size_t i = 0; i < g_num_unlink_paths; i++) {
        ::unlink(g_unlink_paths[i]);
    }
    for (size_t i = 0; i < g_num_shm_unlink_names; i++) {
        ::shm_unlink(g_shm_unlink_names[i]);
    }
    std::_Exit(128 + signal);
}

void setup_parent_death_monitoring()
{
#if defined(__linux__)
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal" << '\n';
    }
#elif defined(__APPLE__)
    pid_t parent_pid = getppid();
    std::thread([parent_pid]() {
        int kq = kqueue();
        if (kq == -1) {
            std::cerr << "Warning: Could not create kqueue for parent monitoring" << '\n';
            return;
        }
        struct kevent change;
        EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0, nullptr);
        if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
            std::cerr << "Warning: Could not monitor parent process" << '\n';
            close(kq);
            return;
        }
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);
        std::cerr << "Parent process exited, shutting down..." << '\n';
        close(kq);
        // Request graceful shutdown so the server's run() loop exits and its
        // destructor unlinks the socket/SHM files. (std::exit here would skip
        // the stack-allocated server's destructor and leak them.)
        if (auto* s = g_signal_server.load(std::memory_order_acquire); s != nullptr) {
            s->request_shutdown_from_signal();
        }
    }).detach();
#endif
}

} // namespace

void install_default_signal_handlers(IpcServer& server)
{
    g_signal_server.store(&server, std::memory_order_release);
    cache_cleanup_paths(server);
    (void)std::signal(SIGTERM, graceful_shutdown_handler);
    (void)std::signal(SIGINT, graceful_shutdown_handler);
    (void)std::signal(SIGBUS, fatal_error_handler);
    (void)std::signal(SIGSEGV, fatal_error_handler);
    setup_parent_death_monitoring();
}

} // namespace ipc

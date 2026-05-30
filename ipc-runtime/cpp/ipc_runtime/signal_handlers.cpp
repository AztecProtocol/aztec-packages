#include "ipc_runtime/signal_handlers.hpp"

#include <atomic>
#include <csignal>
#include <cstdlib>
#include <iostream>

#ifdef __linux__
#include <sys/prctl.h>
#endif

#if defined(__linux__) || defined(__APPLE__)
#include <unistd.h>
#endif

#if defined(__APPLE__)
#include <sys/event.h>
#include <thread>
#endif

namespace ipc {

namespace {

// File-scope pointer used by signal handlers. Atomic so handler execution
// (which may interrupt main() at any point) observes a consistent value.
std::atomic<IpcServer *> g_signal_server{nullptr};

void write_stderr_signal_safe(const char *message, size_t len) {
#if defined(__linux__) || defined(__APPLE__)
  ssize_t written = ::write(STDERR_FILENO, message, len);
  (void)written;
#else
  (void)message;
  (void)len;
#endif
}

void graceful_shutdown_handler([[maybe_unused]] int signal) {
  constexpr char message[] = "\nReceived shutdown signal\n";
  write_stderr_signal_safe(message, sizeof(message) - 1);
  if (auto *s = g_signal_server.load(std::memory_order_acquire); s != nullptr) {
    s->request_shutdown_from_signal();
  }
}

void fatal_error_handler(int signal) {
  constexpr char message[] = "\nFatal IPC runtime signal\n";
  write_stderr_signal_safe(message, sizeof(message) - 1);
  std::_Exit(128 + signal);
}

void setup_parent_death_monitoring() {
#ifdef __linux__
  if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
    std::cerr << "Warning: Could not set parent death signal" << '\n';
  }
#elif defined(__APPLE__)
  pid_t parent_pid = getppid();
  std::thread([parent_pid]() {
    int kq = kqueue();
    if (kq == -1) {
      std::cerr << "Warning: Could not create kqueue for parent monitoring"
                << '\n';
      return;
    }
    struct kevent change;
    EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0,
           nullptr);
    if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
      std::cerr << "Warning: Could not monitor parent process" << '\n';
      close(kq);
      return;
    }
    struct kevent event;
    kevent(kq, nullptr, 0, &event, 1, nullptr);
    std::cerr << "Parent process exited, shutting down..." << '\n';
    close(kq);
    std::exit(0);
  }).detach();
#endif
}

} // namespace

void install_default_signal_handlers(IpcServer &server) {
  g_signal_server.store(&server, std::memory_order_release);
  (void)std::signal(SIGTERM, graceful_shutdown_handler);
  (void)std::signal(SIGINT, graceful_shutdown_handler);
  (void)std::signal(SIGBUS, fatal_error_handler);
  (void)std::signal(SIGSEGV, fatal_error_handler);
  setup_parent_death_monitoring();
}

} // namespace ipc
